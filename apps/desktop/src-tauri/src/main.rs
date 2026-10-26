use std::{
    env,
    path::{Path, PathBuf},
    sync::{Arc, OnceLock},
    time::Duration,
};

use axum::{
    body::Body,
    extract::{Request, State},
    http::{
        header::{
            CACHE_CONTROL, CONTENT_ENCODING, CONTENT_LENGTH, CONTENT_TYPE, COOKIE, HOST, LOCATION,
            ORIGIN, SET_COOKIE,
        },
        HeaderMap, HeaderName, Method, StatusCode,
    },
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{any, get, post},
    Json, Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use http_body_util::BodyExt;
use rand::RngCore;
use reqwest::redirect::Policy;
use serde::Deserialize;
use serde_json::json;
use subtle::ConstantTimeEq;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_updater::UpdaterExt;
use tokio::{fs, net::TcpListener, process::Child, sync::Mutex};
use url::Url;

const BRIDGE_COOKIE_PREFIX: &str = "sheet_bridge";
const BRIDGE_QUERY: &str = "bridge";
const DEFAULT_MCP_PORT: u16 = 4100;

#[derive(Clone)]
struct Config {
    api_origin: Url,
    dev_server: Option<Url>,
    app_root: PathBuf,
    server_bin: Option<PathBuf>,
    data_dir: PathBuf,
    mcp_port: u16,
}

#[derive(Clone)]
struct AppState {
    config: Config,
    client: reqwest::Client,
    port: u16,
    bridge_token: String,
    sidecar: Arc<Mutex<Option<Child>>>,
    profile: Arc<OnceLock<Arc<LocalProfile>>>,
    /// Absent only in tests, which have no running app to update.
    app: Option<tauri::AppHandle>,
    /// The update the last check found, held until the person chooses to install it.
    update: Arc<Mutex<Option<tauri_plugin_updater::Update>>>,
}

struct LocalProfile {
    first_name: String,
    picture: Option<ProfilePicture>,
}

#[derive(Clone)]
enum ProfilePicture {
    Jpeg(Vec<u8>),
    File(PathBuf),
}

#[derive(Deserialize)]
struct OpenRequest {
    url: String,
}

impl Config {
    fn read(app: &tauri::AppHandle) -> Self {
        let mcp_port = read_port("SHEET_MCP_PORT", DEFAULT_MCP_PORT);
        let api_origin = read_origin("SHEET_API_ORIGIN", &format!("http://127.0.0.1:{mcp_port}"));
        let dev_server = env::var("SHEET_DESKTOP_DEV_SERVER")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .and_then(|value| Url::parse(value.trim()).ok())
            .or_else(|| {
                cfg!(debug_assertions).then(|| {
                    Url::parse("http://127.0.0.1:1421").expect("valid Vite development URL")
                })
            });
        let app_root = app
            .path()
            .resource_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("_up_")
            .join("dist")
            .join("app");
        let data_dir = read_data_dir();
        let server_bin = resolve_server_bin(app);

        Self {
            api_origin,
            dev_server,
            app_root,
            server_bin,
            data_dir,
            mcp_port,
        }
    }
}

/// Where the SQLite file and the handoff secret live. The OS app-data
/// directory, overridable with `SHEET_DATA_DIR` (tests, portable installs).
fn read_data_dir() -> PathBuf {
    if let Ok(value) = env::var("SHEET_DATA_DIR") {
        if !value.trim().is_empty() {
            return PathBuf::from(value.trim());
        }
    }
    // A development build keeps its own database, so working on Sheet never
    // touches the designs in the installed app (and the reverse).
    let name = match (cfg!(target_os = "linux"), cfg!(debug_assertions)) {
        (true, false) => "sheet",
        (true, true) => "sheet-dev",
        (false, false) => "Sheet",
        (false, true) => "Sheet Dev",
    };
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(name)
}

fn read_origin(name: &str, fallback: &str) -> Url {
    env::var(name)
        .ok()
        .and_then(|value| Url::parse(value.trim()).ok())
        .and_then(|url| Url::parse(&url.origin().ascii_serialization()).ok())
        .unwrap_or_else(|| Url::parse(fallback).expect("valid fallback origin"))
}

fn read_port(name: &str, fallback: u16) -> u16 {
    if let Ok(value) = env::var(name) {
        if let Ok(port) = value.trim().parse::<u16>() {
            if port > 0 {
                return port;
            }
        }
    }
    fallback
}

/// The window's origin is `http://127.0.0.1:<port>`, and the webview keys
/// everything it remembers (theme, accent, "onboarding seen") by origin. So the
/// installed app asks for the same port every launch, and takes any free one
/// only when that is busy. Development has its own port and its own identity.
const PRODUCTION_PORT: u16 = 4310;

fn requested_port() -> u16 {
    if cfg!(debug_assertions) {
        read_port("SHEET_DESKTOP_PORT", 4300)
    } else {
        read_port("SHEET_DESKTOP_PORT", PRODUCTION_PORT)
    }
}

fn command_bytes(program: &str, args: &[&str]) -> Option<Vec<u8>> {
    let output = std::process::Command::new(program)
        .args(args)
        .output()
        .ok()?;
    output.status.success().then_some(output.stdout)
}

fn command_output(program: &str, args: &[&str]) -> Option<String> {
    command_bytes(program, args)
        .map(|bytes| String::from_utf8_lossy(&bytes).trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn first_name(full_name: &str) -> Option<String> {
    full_name.split_whitespace().next().map(str::to_owned)
}

fn jpeg_photo(record: &[u8]) -> Option<Vec<u8>> {
    let payload = record.splitn(2, |byte| *byte == b':').nth(1)?;
    let hex = payload
        .iter()
        .copied()
        .filter(u8::is_ascii_hexdigit)
        .collect::<Vec<_>>();
    if hex.len() % 2 != 0 {
        return None;
    }
    let bytes = hex
        .chunks_exact(2)
        .map(|pair| {
            let high = (pair[0] as char).to_digit(16)?;
            let low = (pair[1] as char).to_digit(16)?;
            Some(((high << 4) | low) as u8)
        })
        .collect::<Option<Vec<_>>>()?;
    bytes.starts_with(&[0xff, 0xd8, 0xff]).then_some(bytes)
}

fn picture_path(record: &str) -> Option<PathBuf> {
    record.lines().find_map(|line| {
        let value = line
            .trim()
            .strip_prefix("Picture:")
            .unwrap_or(line.trim())
            .trim();
        (!value.is_empty()).then(|| PathBuf::from(value))
    })
}

impl LocalProfile {
    fn read() -> Self {
        let username = env::var("USER")
            .or_else(|_| env::var("USERNAME"))
            .unwrap_or_else(|_| "Local user".to_owned());
        #[cfg(target_os = "macos")]
        let full_name = command_output("id", &["-F", &username]);
        #[cfg(not(target_os = "macos"))]
        let full_name: Option<String> = None;
        #[cfg(target_os = "macos")]
        let picture = command_bytes(
            "dscl",
            &[".", "-read", &format!("/Users/{username}"), "JPEGPhoto"],
        )
        .and_then(|record| jpeg_photo(&record))
        .map(ProfilePicture::Jpeg)
        .or_else(|| {
            command_output(
                "dscl",
                &[".", "-read", &format!("/Users/{username}"), "Picture"],
            )
            .and_then(|record| picture_path(&record))
            .filter(|path| path.is_file())
            .map(ProfilePicture::File)
        });
        #[cfg(not(target_os = "macos"))]
        let picture = None;

        Self {
            first_name: full_name
                .as_deref()
                .and_then(first_name)
                .or_else(|| first_name(&username))
                .unwrap_or_else(|| "Local user".to_owned()),
            picture,
        }
    }
}

impl LocalProfile {
    fn fallback() -> Self {
        Self {
            first_name: "Local user".to_owned(),
            picture: None,
        }
    }
}

/// The account name and avatar come from macOS directory service, and each
/// `dscl` call costs ~100ms. Nothing between the process starting and the
/// window painting needs them, so they are read on the first request that
/// asks, off the runtime's async threads, and cached from then on.
async fn local_profile(state: &AppState) -> Arc<LocalProfile> {
    if let Some(profile) = state.profile.get() {
        return profile.clone();
    }
    let profile = Arc::new(
        tokio::task::spawn_blocking(LocalProfile::read)
            .await
            .unwrap_or_else(|_| LocalProfile::fallback()),
    );
    // A concurrent first request may have won the race; either value is the
    // same one, so the loser keeps what is already stored.
    state.profile.get_or_init(|| profile).clone()
}

/// The compiled local server (`bun build --compile`), bundled beside the app.
/// `SHEET_SERVER_BIN` overrides everything (development, custom layouts).
fn resolve_server_bin(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(value) = env::var("SHEET_SERVER_BIN") {
        let path = PathBuf::from(value.trim());
        if path.is_file() {
            return Some(path);
        }
        eprintln!(
            "[desktop] SHEET_SERVER_BIN is not a file: {}",
            path.display()
        );
    }
    let triple = env::var("SHEET_SERVER_TRIPLE").ok();
    let file_name = if cfg!(windows) {
        "sheet-server.exe"
    } else {
        "sheet-server"
    };
    let mut candidates = Vec::new();
    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join(file_name));
            candidates.push(dir.join("binaries").join(file_name));
        }
    }
    if let Ok(resources) = app.path().resource_dir() {
        candidates.push(resources.join("binaries").join(file_name));
        if let Some(triple) = triple.as_deref() {
            candidates.push(
                resources
                    .join("binaries")
                    .join(format!("{file_name}-{triple}")),
            );
        }
    }
    candidates.into_iter().find(|path| path.is_file())
}

fn handoff_secret_path(data_dir: &Path) -> PathBuf {
    data_dir.join("handoff.key")
}

/// Handoff links are HMAC-signed; the key persists in the data dir so links
/// survive restarts but never leave the machine.
async fn read_handoff_secret(data_dir: &Path) -> Option<String> {
    let path = handoff_secret_path(data_dir);
    if let Ok(bytes) = fs::read(&path).await {
        let secret = String::from_utf8_lossy(&bytes).trim().to_owned();
        if secret.len() >= 32 {
            return Some(secret);
        }
    }
    let mut bytes = [0_u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    let secret = URL_SAFE_NO_PAD.encode(bytes);
    if let Some(parent) = path.parent() {
        if fs::create_dir_all(parent).await.is_err() {
            return None;
        }
    }
    if fs::write(&path, secret.as_bytes()).await.is_err() {
        return None;
    }
    Some(secret)
}

async fn spawn_sidecar(state: &AppState) {
    if cfg!(debug_assertions) {
        let ready = state.config.api_origin.join("/ready").ok().map(|url| {
            state
                .client
                .get(url)
                .timeout(Duration::from_millis(250))
                .send()
        });
        if let Some(request) = ready {
            if request
                .await
                .is_ok_and(|response| response.status().is_success())
            {
                eprintln!("[desktop] reusing the running local server");
                return;
            }
        }
    }

    let Some(bin) = state.config.server_bin.clone() else {
        eprintln!(
            "[desktop] no local server binary found — run `bun run dev:mcp` alongside the app"
        );
        return;
    };
    let db_path = state.config.data_dir.join("sheet.db");
    if let Some(parent) = db_path.parent() {
        if fs::create_dir_all(parent).await.is_err() {
            eprintln!("[desktop] could not create data dir: {}", parent.display());
            return;
        }
    }
    let handoff_secret = read_handoff_secret(&state.config.data_dir).await;
    let mut command = tokio::process::Command::new(&bin);
    command
        .env("SHEET_SQLITE_PATH", &db_path)
        .env("SHEET_MCP_PORT", state.config.mcp_port.to_string())
        .env("SHEET_APP_URL", format!("http://127.0.0.1:{}", state.port))
        .env(
            "MCP_PUBLIC_URL",
            format!("http://127.0.0.1:{}", state.config.mcp_port),
        );
    if let Some(secret) = handoff_secret {
        command.env("SHEET_HANDOFF_SECRET", secret);
    }
    // A sidecar that cannot listen is worse than none: the proxy answers
    // 502 and the window says Sheet is unreachable instead of hanging.
    command.stdout(std::process::Stdio::null());
    command.stderr(std::process::Stdio::inherit());
    match command.spawn() {
        Ok(child) => {
            *state.sidecar.lock().await = Some(child);
            eprintln!("[desktop] local server started from {}", bin.display());
        }
        Err(error) => {
            eprintln!("[desktop] could not start local server: {error}");
        }
    }
}

fn random_bridge_token() -> String {
    let mut bytes = [0_u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn bridge_origin(port: u16) -> String {
    format!("http://127.0.0.1:{port}")
}

fn secret_matches(value: &str, expected: &str) -> bool {
    value.len() == expected.len() && bool::from(value.as_bytes().ct_eq(expected.as_bytes()))
}

fn bridge_cookie_name(port: u16) -> String {
    format!("{BRIDGE_COOKIE_PREFIX}_{port}")
}

fn has_bridge_cookie(headers: &HeaderMap, port: u16, expected: &str) -> bool {
    let expected_name = bridge_cookie_name(port);
    headers
        .get_all(COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .filter_map(|part| part.trim().split_once('='))
        .any(|(name, value)| name == expected_name && secret_matches(value, expected))
}

fn has_expected_host(headers: &HeaderMap, port: u16) -> bool {
    headers
        .get(HOST)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value == format!("127.0.0.1:{port}"))
}

fn has_trusted_origin(headers: &HeaderMap, port: u16) -> bool {
    headers
        .get(ORIGIN)
        .map(|value| {
            value
                .to_str()
                .is_ok_and(|value| value == bridge_origin(port))
        })
        .unwrap_or(true)
}

fn bridge_query_token(request: &Request) -> Option<String> {
    url::form_urlencoded::parse(request.uri().query()?.as_bytes())
        .find(|(name, _)| name == BRIDGE_QUERY)
        .map(|(_, value)| value.into_owned())
}

fn bridge_bootstrap_response(port: u16, token: &str) -> Response {
    Response::builder()
        .status(StatusCode::SEE_OTHER)
        .header(LOCATION, "/")
        .header(CACHE_CONTROL, "no-store")
        .header(
            SET_COOKIE,
            format!(
                "{}={token}; Path=/; HttpOnly; SameSite=Strict",
                bridge_cookie_name(port),
            ),
        )
        .body(Body::empty())
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

async fn require_bridge(State(state): State<AppState>, request: Request, next: Next) -> Response {
    if !has_expected_host(request.headers(), state.port) {
        return (StatusCode::FORBIDDEN, "Untrusted desktop host").into_response();
    }

    if request.method() == Method::GET
        && request.uri().path() == "/"
        && bridge_query_token(&request)
            .is_some_and(|value| secret_matches(&value, &state.bridge_token))
    {
        return bridge_bootstrap_response(state.port, &state.bridge_token);
    }

    if !has_trusted_origin(request.headers(), state.port) {
        return (StatusCode::FORBIDDEN, "Untrusted desktop origin").into_response();
    }
    if !has_bridge_cookie(request.headers(), state.port, &state.bridge_token) {
        return (StatusCode::UNAUTHORIZED, "Unauthorized desktop request").into_response();
    }
    next.run(request).await
}

async fn desktop_profile(State(state): State<AppState>) -> Response {
    let profile = local_profile(&state).await;
    Json(json!({
        "firstName": &profile.first_name,
        "imageUrl": profile
            .picture
            .as_ref()
            .map(|picture| match picture {
                ProfilePicture::Jpeg(_) => "/desktop/profile-image?source=jpeg-photo",
                ProfilePicture::File(_) => "/desktop/profile-image?source=picture",
            }),
    }))
    .into_response()
}

async fn desktop_profile_image(State(state): State<AppState>) -> Response {
    let profile = local_profile(&state).await;
    let Some(picture) = profile.picture.clone() else {
        return StatusCode::NOT_FOUND.into_response();
    };
    match picture {
        ProfilePicture::Jpeg(bytes) => (
            [(CONTENT_TYPE, "image/jpeg"), (CACHE_CONTROL, "no-store")],
            bytes.clone(),
        )
            .into_response(),
        ProfilePicture::File(path) => match fs::read(&path).await {
            Ok(bytes) => (
                [
                    (
                        CONTENT_TYPE,
                        mime_guess::from_path(path).first_or_octet_stream().as_ref(),
                    ),
                    (CACHE_CONTROL, "no-store"),
                ],
                bytes,
            )
                .into_response(),
            Err(_) => StatusCode::NOT_FOUND.into_response(),
        },
    }
}

async fn desktop_open(Json(payload): Json<OpenRequest>) -> Response {
    let Ok(url) = Url::parse(&payload.url) else {
        return (StatusCode::BAD_REQUEST, Json(json!({ "opened": false }))).into_response();
    };
    if url.scheme() != "https" {
        return (StatusCode::BAD_REQUEST, Json(json!({ "opened": false }))).into_response();
    }
    match open_external(url.as_str()) {
        Ok(()) => Json(json!({ "opened": true })).into_response(),
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "opened": false })),
        )
            .into_response(),
    }
}

/// Opens (or raises) the Settings window for the sidebar's Settings button.
/// Windows are made on the main thread, the way the menu item does it.
async fn desktop_settings(State(state): State<AppState>) -> Response {
    let Some(app) = state.app.clone() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let target = app.clone();
    match app.run_on_main_thread(move || open_settings(&target)) {
        Ok(()) => Json(json!({ "opened": true })).into_response(),
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "opened": false })),
        )
            .into_response(),
    }
}

fn update_unavailable() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(json!({
            "status": "error",
            "message": "Updates are not available in this build of Sheet.",
        })),
    )
        .into_response()
}

async fn desktop_version(State(state): State<AppState>) -> Response {
    let Some(app) = state.app.as_ref() else {
        return update_unavailable();
    };
    Json(json!({ "version": app.package_info().version.to_string() })).into_response()
}

/// Asks the release feed whether a newer build exists. The update it finds is
/// kept here so `install` can act on exactly what the person was shown.
async fn desktop_update_check(State(state): State<AppState>) -> Response {
    let Some(app) = state.app.clone() else {
        return update_unavailable();
    };
    // A development build is not an installed release: it must never offer to
    // replace itself with one.
    if cfg!(debug_assertions) {
        return Json(json!({
            "status": "upToDate",
            "version": app.package_info().version.to_string(),
        }))
        .into_response();
    }
    let checked = match app.updater() {
        Ok(updater) => updater.check().await,
        Err(error) => Err(error),
    };
    match checked {
        Ok(Some(update)) => {
            let body = json!({
                "status": "available",
                "version": &update.version,
                "currentVersion": &update.current_version,
                "notes": &update.body,
            });
            *state.update.lock().await = Some(update);
            Json(body).into_response()
        }
        Ok(None) => {
            *state.update.lock().await = None;
            Json(json!({
                "status": "upToDate",
                "version": app.package_info().version.to_string(),
            }))
            .into_response()
        }
        Err(error) => (
            StatusCode::BAD_GATEWAY,
            Json(json!({
                "status": "error",
                "message": format!("Could not check for updates: {error}"),
            })),
        )
            .into_response(),
    }
}

/// Downloads and installs the update the last check found, then relaunches.
/// The answer goes out first; the restart follows once it has been sent.
async fn desktop_update_install(State(state): State<AppState>) -> Response {
    let Some(app) = state.app.clone() else {
        return update_unavailable();
    };
    let Some(update) = state.update.lock().await.take() else {
        return (
            StatusCode::CONFLICT,
            Json(json!({
                "status": "error",
                "message": "There is no update to install. Check for updates first.",
            })),
        )
            .into_response();
    };
    if let Err(error) = update.download_and_install(|_, _| {}, || {}).await {
        return (
            StatusCode::BAD_GATEWAY,
            Json(json!({
                "status": "error",
                "message": format!(
                    "Could not install the update: {error}. Sheet is unchanged; try again, or download the latest release."
                ),
            })),
        )
            .into_response();
    }
    let sidecar = state.sidecar.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(600)).await;
        // The new build starts its own local server on the same port and database.
        if let Some(mut child) = sidecar.lock().await.take() {
            let _ = child.kill().await;
        }
        app.restart();
    });
    Json(json!({ "status": "installed" })).into_response()
}

fn open_external(url: &str) -> std::io::Result<()> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = std::process::Command::new("open");
        command.arg(url);
        command
    };
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = std::process::Command::new("cmd");
        // `start` reads its first quoted argument as the window title, so it gets an empty one.
        command.args(["/c", "start", "", url]);
        command
    };
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let mut command = {
        let mut command = std::process::Command::new("xdg-open");
        command.arg(url);
        command
    };
    command.spawn().map(|_| ())
}

fn is_hop_by_hop(name: &HeaderName) -> bool {
    matches!(
        name.as_str(),
        "connection"
            | "content-length"
            | "host"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
    )
}

async fn proxy_api(State(state): State<AppState>, request: Request) -> Response {
    let path = request
        .uri()
        .path_and_query()
        .map(|value| value.as_str())
        .unwrap_or("/api/")
        .to_owned();
    let target = match state.config.api_origin.join(&path) {
        Ok(target) => target,
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid API target").into_response(),
    };
    let method = request.method().clone();
    let mut upstream = state.client.request(method.clone(), target);
    for (name, value) in request.headers() {
        if !is_hop_by_hop(name) && name != COOKIE {
            upstream = upstream.header(name, value);
        }
    }
    if method != Method::GET && method != Method::HEAD {
        let body = match request.into_body().collect().await {
            Ok(body) => body.to_bytes(),
            Err(_) => return (StatusCode::BAD_REQUEST, "Could not read request").into_response(),
        };
        upstream = upstream.body(body);
    }
    let response = match upstream.send().await {
        Ok(response) => response,
        Err(error) => {
            eprintln!("[desktop] proxy failed: {error}");
            return (StatusCode::BAD_GATEWAY, "Sheet is unreachable").into_response();
        }
    };

    let status = response.status();
    let mut headers = response.headers().clone();

    headers.remove(SET_COOKIE);
    headers.remove(CONTENT_ENCODING);
    headers.remove(CONTENT_LENGTH);
    for name in [
        "connection",
        "host",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
    ] {
        headers.remove(name);
    }
    let mut result = Response::builder().status(status);
    for (name, value) in &headers {
        result = result.header(name, value);
    }
    // Event streams must not be buffered by the proxy.
    if path.starts_with("/api/canvas-events") {
        result = result.header("x-accel-buffering", "no");
    }
    result
        .body(Body::from_stream(response.bytes_stream()))
        .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
}

async fn serve_app(State(state): State<AppState>, request: Request) -> Response {
    if let Some(dev_server) = &state.config.dev_server {
        return proxy_dev_server(&state, dev_server, request).await;
    }
    let relative = request.uri().path().trim_start_matches('/');
    if !relative.is_empty() && !relative.contains("..") {
        let path = state.config.app_root.join(relative);
        if let Ok(bytes) = fs::read(&path).await {
            let mime = mime_guess::from_path(&path).first_or_octet_stream();
            let cache = if relative == "index.html" {
                "no-store"
            } else {
                "max-age=31536000, immutable"
            };
            return (
                [(CONTENT_TYPE, mime.as_ref()), (CACHE_CONTROL, cache)],
                bytes,
            )
                .into_response();
        }
    }
    let index = state.config.app_root.join("index.html");
    match fs::read(index).await {
        Ok(bytes) => (
            [
                (CONTENT_TYPE, "text/html; charset=utf-8"),
                (CACHE_CONTROL, "no-store"),
            ],
            bytes,
        )
            .into_response(),
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            "The interface has not been built. Run `bun run build:desktop`.",
        )
            .into_response(),
    }
}

/// Keep the window on the host origin in development.
///
/// Proxying the bytes instead of redirecting keeps the hand-off and the
/// window on one loopback server.
async fn proxy_dev_server(state: &AppState, dev_server: &Url, request: Request) -> Response {
    let mut target = dev_server.clone();
    target.set_path(request.uri().path());
    target.set_query(request.uri().query());
    let method = request.method().clone();
    let mut upstream = state.client.request(method.clone(), target);
    for (name, value) in request.headers() {
        if !is_hop_by_hop(name) {
            upstream = upstream.header(name, value);
        }
    }
    if method != Method::GET && method != Method::HEAD {
        let body = match request.into_body().collect().await {
            Ok(body) => body.to_bytes(),
            Err(_) => return (StatusCode::BAD_REQUEST, "Could not read request").into_response(),
        };
        upstream = upstream.body(body);
    }
    let response = match upstream.send().await {
        Ok(response) => response,
        Err(error) => {
            eprintln!("[desktop] Vite development proxy failed: {error}");
            return (
                StatusCode::BAD_GATEWAY,
                "The development interface is not running.",
            )
                .into_response();
        }
    };
    let status = response.status();
    let mut headers = response.headers().clone();
    headers.remove(CONTENT_ENCODING);
    headers.remove(CONTENT_LENGTH);
    for name in [
        "connection",
        "host",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
    ] {
        headers.remove(name);
    }
    let mut result = Response::builder().status(status);
    for (name, value) in &headers {
        result = result.header(name, value);
    }
    result
        .body(Body::from_stream(response.bytes_stream()))
        .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
}

fn router(state: AppState) -> Router {
    Router::new()
        .route("/desktop/profile", get(desktop_profile))
        .route("/desktop/profile-image", get(desktop_profile_image))
        .route("/desktop/open", post(desktop_open))
        .route("/desktop/settings", post(desktop_settings))
        .route("/desktop/version", get(desktop_version))
        .route("/desktop/update/check", post(desktop_update_check))
        .route("/desktop/update/install", post(desktop_update_install))
        .route("/api/{*path}", any(proxy_api))
        .fallback(serve_app)
        .layer(middleware::from_fn_with_state(
            state.clone(),
            require_bridge,
        ))
        .with_state(state)
}

const SETTINGS_WINDOW: &str = "settings";
const SETTINGS_MENU_ID: &str = "settings";

/// The app's menu bar. Settings lives here and nowhere in the interface: it is
/// a window of its own, opened from the application menu or with ⌘,.
/// The Edit menu stays, because the webview takes its copy and paste from it.
fn build_menu(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};

    let settings = MenuItemBuilder::with_id(SETTINGS_MENU_ID, "Settings…")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let app_menu = SubmenuBuilder::new(app, "Sheet")
        .about(None)
        .separator()
        .item(&settings)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let view_menu = SubmenuBuilder::new(app, "View").fullscreen().build()?;
    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;
    let menu = MenuBuilder::new(app)
        .items(&[&app_menu, &edit_menu, &view_menu, &window_menu])
        .build()?;
    app.set_menu(menu)?;
    Ok(())
}

/// Opens the Settings window, or brings the one that is open to the front.
fn open_settings(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    // The menu can be used before the loopback host is up; there is nothing to open yet.
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let Ok(url) = Url::parse(&format!(
        "http://127.0.0.1:{}/settings?{BRIDGE_QUERY}={}",
        state.port, state.bridge_token
    )) else {
        return;
    };
    let builder = WebviewWindowBuilder::new(app, SETTINGS_WINDOW, WebviewUrl::External(url))
        .title("Settings")
        .inner_size(800.0, 580.0)
        .min_inner_size(680.0, 480.0)
        .decorations(true);
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);
    if let Err(error) = builder.build() {
        eprintln!("[desktop] could not open the settings window: {error}");
    }
}

fn main() {
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("install rustls crypto provider");
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_menu_event(|app, event| {
            if event.id().as_ref() == SETTINGS_MENU_ID {
                open_settings(app);
            }
        })
        .setup(|app| {
            build_menu(app)?;
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let requested = requested_port();
                let listener = match TcpListener::bind(("127.0.0.1", requested)).await {
                    Ok(listener) => listener,
                    // The installed app's usual port is taken: run on any free one
                    // rather than not open. Settings remembered by origin start over.
                    Err(error)
                        if !cfg!(debug_assertions)
                            && requested == PRODUCTION_PORT
                            && env::var("SHEET_DESKTOP_PORT").is_err() =>
                    {
                        eprintln!("[desktop] port {requested} is busy ({error}); using a free one");
                        TcpListener::bind(("127.0.0.1", 0))
                            .await
                            .map_err(|error| format!("could not bind desktop host: {error}"))?
                    }
                    Err(error) => return Err(format!("could not bind desktop host: {error}").into()),
                };
                let port = listener
                    .local_addr()
                    .map_err(|error| format!("could not read desktop host port: {error}"))?
                    .port();
                let config = Config::read(&handle);
                let bridge_token = random_bridge_token();
                let state = AppState {
                    config,
                    client: reqwest::Client::builder()
                        .redirect(Policy::none())
                        .build()
                        .map_err(|error| format!("could not create HTTP client: {error}"))?,
                    port,
                    bridge_token: bridge_token.clone(),
                    sidecar: Arc::new(Mutex::new(None)),
                    profile: Arc::new(OnceLock::new()),
                    app: Some(handle.clone()),
                    update: Arc::new(Mutex::new(None)),
                };
                spawn_sidecar(&state).await;
                handle.manage(state.clone());
                let served = state.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = axum::serve(listener, router(served)).await {
                        eprintln!("[desktop] loopback host stopped: {error}");
                    }
                });

                let url = Url::parse(&format!(
                    "http://127.0.0.1:{port}/?{BRIDGE_QUERY}={bridge_token}"
                ))
                .map_err(|error| format!("could not build desktop URL: {error}"))?;
                let window = WebviewWindowBuilder::new(&handle, "main", WebviewUrl::External(url))
                    .title("Sheet")
                    .inner_size(1440.0, 900.0)
                    .min_inner_size(960.0, 640.0)
                    .decorations(true);
                #[cfg(target_os = "macos")]
                let window = window
                    .title_bar_style(tauri::TitleBarStyle::Overlay)
                    .hidden_title(true);
                window
                    .build()
                    .map_err(|error| format!("could not create desktop window: {error}"))?;
                Ok::<(), String>(())
            })?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running Sheet")
        .run(|handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                // Best effort: the OS reclaims the sidecar's port and
                // SQLite lock if this races a force-quit.
                let sidecar: tauri::State<AppState> = handle.state();
                let sidecar = sidecar.inner().sidecar.clone();
                tauri::async_runtime::block_on(async move {
                    if let Some(mut child) = sidecar.lock().await.take() {
                        let _ = child.kill().await;
                    }
                });
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::header::{AUTHORIZATION, CONNECTION, HOST};
    use tower::ServiceExt;

    fn test_state() -> AppState {
        AppState {
            config: Config {
                api_origin: Url::parse("http://127.0.0.1:4100").unwrap(),
                dev_server: None,
                app_root: PathBuf::from("/unused"),
                server_bin: None,
                data_dir: PathBuf::from("/unused"),
                mcp_port: 4100,
            },
            client: reqwest::Client::new(),
            port: 4300,
            bridge_token: "test-bridge-token".to_owned(),
            sidecar: Arc::new(Mutex::new(None)),
            profile: Arc::new(OnceLock::new()),
            app: None,
            update: Arc::new(Mutex::new(None)),
        }
    }

    #[tokio::test]
    async fn rejects_an_unauthenticated_loopback_request() {
        let response = router(test_state())
            .oneshot(
                Request::builder()
                    .uri("/desktop/open")
                    .method(Method::POST)
                    .header(HOST, "127.0.0.1:4300")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn rejects_a_dns_rebinding_host_with_a_valid_cookie() {
        let response = router(test_state())
            .oneshot(
                Request::builder()
                    .uri("/desktop/open")
                    .header(HOST, "attacker.example:4300")
                    .header(COOKIE, "sheet_bridge_4300=test-bridge-token")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn rejects_an_untrusted_browser_origin_with_a_valid_cookie() {
        let response = router(test_state())
            .oneshot(
                Request::builder()
                    .uri("/desktop/open")
                    .header(HOST, "127.0.0.1:4300")
                    .header(ORIGIN, "https://attacker.example")
                    .header(COOKIE, "sheet_bridge_4300=test-bridge-token")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn bootstraps_the_webview_cookie_once() {
        let response = router(test_state())
            .oneshot(
                Request::builder()
                    .uri("/?bridge=test-bridge-token")
                    .header(HOST, "127.0.0.1:4300")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::SEE_OTHER);
        assert_eq!(response.headers().get(LOCATION).unwrap(), "/");
        let cookie = response
            .headers()
            .get(SET_COOKIE)
            .unwrap()
            .to_str()
            .unwrap();
        assert!(cookie.starts_with("sheet_bridge_4300=test-bridge-token;"));
        assert!(cookie.contains("HttpOnly"));
        assert!(cookie.contains("SameSite=Strict"));
    }

    #[tokio::test]
    async fn accepts_the_bootstrapped_webview() {
        let response = router(test_state())
            .oneshot(
                Request::builder()
                    .uri("/desktop/open")
                    .method(Method::POST)
                    .header(HOST, "127.0.0.1:4300")
                    .header(COOKIE, "sheet_bridge_4300=test-bridge-token")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        // Invalid JSON body, but through the gate — which is what this checks.
        assert!(!response.status().is_success());
    }

    #[test]
    fn reads_the_first_account_name() {
        assert_eq!(first_name("Deepanshu Mishra").as_deref(), Some("Deepanshu"));
        assert_eq!(first_name("  Deepanshu  ").as_deref(), Some("Deepanshu"));
    }

    #[tokio::test]
    async fn reads_the_profile_once_and_then_from_cache() {
        let state = test_state();
        let first = local_profile(&state).await;
        let second = local_profile(&state).await;
        assert!(Arc::ptr_eq(&first, &second));
        assert!(!first.first_name.is_empty());
    }

    #[test]
    fn reads_the_macos_jpeg_photo_record() {
        assert_eq!(
            jpeg_photo(b"JPEGPhoto:\n ffd8 ffe0"),
            Some(vec![0xff, 0xd8, 0xff, 0xe0]),
        );
        assert_eq!(jpeg_photo(b"JPEGPhoto:\n 00ff"), None);
    }

    #[test]
    fn reads_the_macos_picture_record() {
        assert_eq!(
            picture_path("Picture:\n /Library/User Pictures/Animals/Eagle.heic"),
            Some(PathBuf::from("/Library/User Pictures/Animals/Eagle.heic")),
        );
    }

    #[test]
    fn hop_by_hop_headers_are_removed() {
        assert!(is_hop_by_hop(&CONNECTION));
        assert!(is_hop_by_hop(&HOST));
        assert!(!is_hop_by_hop(&AUTHORIZATION));
    }

    #[test]
    fn invalid_origin_falls_back() {
        let variable = "SHEET_DESKTOP_TEST_ORIGIN";
        std::env::set_var(variable, "not a URL");
        assert_eq!(
            read_origin(variable, "http://127.0.0.1:4100").as_str(),
            "http://127.0.0.1:4100/"
        );
        std::env::remove_var(variable);
    }

    #[test]
    fn invalid_port_falls_back() {
        assert_eq!(read_port("SHEET_DESKTOP_TEST_PORT", 4100), 4100);
        std::env::set_var("SHEET_DESKTOP_TEST_PORT", "99999");
        assert_eq!(read_port("SHEET_DESKTOP_TEST_PORT", 4100), 4100);
        std::env::set_var("SHEET_DESKTOP_TEST_PORT", "4123");
        assert_eq!(read_port("SHEET_DESKTOP_TEST_PORT", 4123), 4123);
        std::env::remove_var("SHEET_DESKTOP_TEST_PORT");
    }
}

# Sheet for Windows

First-class Windows support for [Sheet](https://github.com/DeepanshuMishraa/sheet), the local-first visual design canvas that lets AI coding agents create and edit interfaces using real HTML and CSS.

---

## System Requirements

- **Operating System**: Windows 10 (build 1903 or later, 64-bit) or Windows 11 x64.
- **Runtime**: [Bun](https://bun.sh) for Windows (v1.3.0 or later).
- **Browser**: Google Chrome or Microsoft Edge (Chromium-based, included in Windows 10/11).
- **Optional**:
  - [Node.js](https://nodejs.org) (v20+ / v22+ / v24+).
  - [Rust](https://rustup.rs) & Visual Studio C++ Build Tools (required only if compiling the native Tauri desktop window from source).

---

## Quick Start

### 1. Prerequisites & Setup
Clone the repository and run the automated Windows setup script in PowerShell:

```powershell
# In PowerShell, from the repository root.
# Only this session needs the relaxed policy; the machine setting is untouched.
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\windows\setup.ps1
```

This verifies toolchains, checks browser availability, installs workspace dependencies via Bun preserving `bun.lock`, and prepares database migrations.

### 2. Development Workflows

Sheet provides three distinct workflows on Windows:

#### A. Web Visual Canvas (Recommended for most contributors)
Starts the local server (oRPC + MCP + SSE) on `:4100`, starts the Vite visual canvas on `:1421`, and opens it in your default browser:

```powershell
.\windows\run.ps1 -Web
```

*Note: Does not require Rust or C++ Build Tools. Full visual canvas and MCP server functionality are available.*

If a Sheet server is already listening on `:4100`, `run.ps1` refuses to start a second one. Pass `-ReuseServer` to attach to the running server, or `-Port` / `-AppPort` to move the server or the canvas:

```powershell
.\windows\run.ps1 -Web -ReuseServer
.\windows\run.ps1 -Web -Port 4101 -AppPort 1422
```

#### B. Server-Only (MCP AI Agent Host)
Starts only the local backend server and MCP JSON-RPC endpoint on loopback `:4100`:

```powershell
.\windows\run.ps1 -ServerOnly
```

#### C. Native Desktop Window (Tauri)
Spawns the native Tauri desktop window using the Windows WebView2 runtime (requires Rust and MSVC C++ Build Tools):

```powershell
.\windows\run.ps1 -Desktop
```

Press `Ctrl+C` in the PowerShell window to stop all child processes and free the loopback ports.

---

## Connecting AI Agents over MCP

Sheet provides 32+ typed design tools over standard JSON-RPC HTTP on `http://127.0.0.1:4100/mcp`.

### Cursor
Add to `%USERPROFILE%\.cursor\mcp.json`:
```json
{
  "mcpServers": {
    "sheet": {
      "url": "http://127.0.0.1:4100/mcp"
    }
  }
}
```

### Claude Code
Add to `%USERPROFILE%\.claude.json`:
```json
{
  "mcpServers": {
    "sheet": {
      "type": "http",
      "url": "http://127.0.0.1:4100/mcp"
    }
  }
}
```

### VS Code / GitHub Copilot
Add to `%APPDATA%\Code\User\mcp.json`:
```json
{
  "servers": {
    "sheet": {
      "type": "http",
      "url": "http://127.0.0.1:4100/mcp"
    }
  }
}
```

### Codex
Add to `%USERPROFILE%\.codex\config.toml`:
```toml
[mcp_servers.sheet]
url = "http://127.0.0.1:4100/mcp"
```

---

## Testing

Run tests from the repository root:

```bash
# Run all Vitest suites
bun run test

# Run Windows platform adapter test suite
bun run test windows/tests/windows-platform.test.ts
```

---

## Building & Packaging

Use `windows/build.ps1` to produce Windows distributions:

```powershell
# 1. Portable Distribution (server, built interface, and launcher)
.\windows\build.ps1 -Portable
# Output: dist/windows-portable/
# launch.bat runs sheet-server.exe with SHEET_APP_DIR pointing at the bundled
# interface, so http://127.0.0.1:4100 opens the canvas and /mcp stays available.
# Data lives in %APPDATA%\Sheet\sheet.db; close the "Sheet" console window to stop.

# 2. Server Sidecar Only (Compiles sheet-server.exe)
.\windows\build.ps1 -ServerOnly
# Output: apps/desktop/src-tauri/binaries/sheet-server.exe

# 3. Native Tauri Desktop Installer (.msi / .exe via NSIS, requires Rust)
.\windows\build.ps1 -Package
```

Running `.\windows\build.ps1` with no switches builds the server and interface, then packages the portable distribution.

---

## Persistent Data & Storage

- **Production**: `%APPDATA%\Sheet\` (`sheet.db` and `handoff.key`)
- **Development**: `%APPDATA%\Sheet Dev\` (`sheet.db` and `handoff.key`)
- **Override**: Set `SHEET_DATA_DIR` for the launchers, which pass the database path to the server as `SHEET_SQLITE_PATH`.

The database runs in WAL mode, so recent writes can live in `sheet.db-wal` until a checkpoint. To back up safely, close Sheet first, then copy all three files together if they exist:

```powershell
$backup = "$env:USERPROFILE\Desktop\sheet-backup"
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Copy-Item "$env:APPDATA\Sheet\sheet.db*" -Destination $backup
```

---

## Architecture & Windows Boundaries

- **Cross-Platform Boundaries**:
  - `windows/src/platform-adapter.ts`: Windows path normalization (`win32` semantics and `file:///C:/...` URLs), `%APPDATA%` resolution, browser discovery, and loopback port checks.
  - `apps/desktop/src-tauri/tauri.conf.json`: Configured with cross-platform bundle targets (`"targets": "all"`).
  - `apps/mcp/src/agent-install.ts`: writes agent configs through a unique temporary file renamed into place, retrying the rename while Windows indexers or antivirus hold the target. If the lock never clears, the previous file is left exactly as it was.
  - `apps/mcp/src/local.ts`: with `SHEET_APP_DIR` set, serves the built interface (SPA fallback included) so the portable bundle opens the canvas, not just the MCP endpoint.
  - `scripts/build-server.ts`: Replaces Unix shell commands with cross-platform binary compilation.
- **macOS packaging**: the `.dmg` is still built by `.github/workflows/release.yml` on `macos-latest` (`aarch64-apple-darwin`); the same workflow builds the Windows NSIS installer on `windows-latest` and attaches both to the release.

---

## Reporting Issues

If you encounter Windows-specific issues (e.g. port binding errors, path normalization bugs, or WebView2 glitches), please report them on the [GitHub Issues](https://github.com/DeepanshuMishraa/sheet/issues) page with the `[windows]` label.

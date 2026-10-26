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
# In PowerShell:
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

Press `Ctrl+C` in the PowerShell window to gracefully terminate all child processes and free loopback ports.

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
# 1. Portable Distribution (Standalone folder with sheet-server.exe, assets, and launcher)
.\windows\build.ps1 -Portable
# Output: dist/windows-portable/

# 2. Server Sidecar Only (Compiles sheet-server.exe)
.\windows\build.ps1 -ServerOnly
# Output: apps/desktop/src-tauri/binaries/sheet-server.exe

# 3. Native Tauri Desktop Installer (.msi / .exe via NSIS, requires Rust)
.\windows\build.ps1 -Package
```

---

## Persistent Data & Storage

- **Production**: `%APPDATA%\Sheet\` (`sheet.db` and `handoff.key`)
- **Development**: `%APPDATA%\Sheet Dev\` (`sheet.db` and `handoff.key`)
- **Override**: Set the `SHEET_DATA_DIR` environment variable to point to any custom directory.

Back up your designs by copying the SQLite `sheet.db` file while Sheet is not writing.

---

## Architecture & Windows Boundaries

- **Cross-Platform Boundaries**:
  - `windows/src/platform-adapter.ts`: Encapsulates Windows-specific path normalization, `%APPDATA%` resolution, and file locking mitigation.
  - `apps/desktop/src-tauri/tauri.conf.json`: Configured with cross-platform bundle targets (`"targets": "all"`).
  - `apps/mcp/src/agent-install.ts`: Equipped with atomic file write fallbacks for Windows `EPERM` locks.
  - `scripts/build-server.ts`: Replaces Unix shell commands with cross-platform binary compilation.
- **Reference Preservation**:
  - The existing macOS implementation (`TitleBarStyle::Overlay`, Gatekeeper unquarantining, `.dmg` packaging in `.github/workflows/release.yml`) remains 100% intact and untouched.

---

## Reporting Issues

If you encounter Windows-specific issues (e.g. port binding errors, path normalization bugs, or WebView2 glitches), please report them on the [GitHub Issues](https://github.com/DeepanshuMishraa/sheet/issues) page with the `[windows]` label.

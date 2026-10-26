<#
.SYNOPSIS
    Build and packaging script for Sheet on Windows.
.DESCRIPTION
    Compiles the standalone backend server (sheet-server.exe), builds the
    Vite desktop web interface (dist/app), and creates either a portable
    distribution or a packaged native installer (via Tauri if the Rust
    toolchain is installed).

    With no switches it builds both parts and packages the portable
    distribution.

.PARAMETER ServerOnly
    Builds only the backend server sidecar
    (apps/desktop/src-tauri/binaries/sheet-server.exe). Cannot be combined
    with -AppOnly.
.PARAMETER AppOnly
    Builds only the frontend interface (apps/desktop/dist/app). Cannot be
    combined with -ServerOnly.
.PARAMETER Portable
    Packages a standalone portable distribution into dist/windows-portable.
    This is the default when neither -Portable nor -Package is given.
.PARAMETER Package
    Builds the native Tauri Windows installer (.msi / .exe). Requires Rust.
#>

[CmdletBinding()]
param(
    [switch]$ServerOnly,
    [switch]$AppOnly,
    [switch]$Portable,
    [switch]$Package
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($ServerOnly -and $AppOnly) {
    Write-Host '[Error] -ServerOnly and -AppOnly build different halves of the app.' -ForegroundColor Red
    Write-Host '        Pick one, or run without either switch to build everything.' -ForegroundColor Yellow
    exit 1
}

$RepoRoot = $PSScriptRoot
if ((Split-Path -Leaf $RepoRoot) -eq 'windows') {
    $RepoRoot = Split-Path -Parent $RepoRoot
}

Write-Host '========================================' -ForegroundColor Cyan
Write-Host '     Sheet for Windows — Build Script   ' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

# Locate Bun
$BunExe = $null
if (Get-Command 'bun.exe' -ErrorAction SilentlyContinue) {
    $BunExe = (Get-Command 'bun.exe').Source
} elseif (Get-Command 'bun' -ErrorAction SilentlyContinue) {
    $BunExe = (Get-Command 'bun').Source
} else {
    $DefaultBunPath = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
    if (Test-Path $DefaultBunPath) {
        $BunExe = $DefaultBunPath
    }
}

if (-not $BunExe) {
    Write-Host '[Error] Bun is required to build Sheet on Windows. Run .\windows\setup.ps1 first.' -ForegroundColor Red
    exit 1
}

$BuildServer = -not $AppOnly
$BuildApp = -not $ServerOnly
$TotalSteps = [int]$BuildServer + [int]$BuildApp + 1
$Step = 0

Push-Location $RepoRoot
try {
    # 1. Build Server
    if ($BuildServer) {
        $Step += 1
        Write-Host "[$Step/$TotalSteps] Building backend server sidecar (sheet-server.exe)..." -ForegroundColor Cyan
        & $BunExe run scripts/build-server.ts
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[Error] Server build failed with exit code $LASTEXITCODE" -ForegroundColor Red
            Write-Host '        Fix the compiler error above, then run the build again.' -ForegroundColor Yellow
            exit $LASTEXITCODE
        }
        Write-Host '[OK] Server binary compiled successfully.' -ForegroundColor Green
    }

    if ($ServerOnly) {
        Write-Host ''
        Write-Host '[OK] Server-only build complete: apps/desktop/src-tauri/binaries/sheet-server.exe' -ForegroundColor Green
        exit 0
    }

    # 2. Build Frontend
    if ($BuildApp) {
        $Step += 1
        Write-Host ''
        Write-Host "[$Step/$TotalSteps] Building frontend application bundle (dist/app)..." -ForegroundColor Cyan
        & $BunExe run --cwd apps/desktop build:app
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[Error] Frontend build failed with exit code $LASTEXITCODE" -ForegroundColor Red
            Write-Host '        Fix the bundler error above, then run the build again.' -ForegroundColor Yellow
            exit $LASTEXITCODE
        }
        Write-Host '[OK] Frontend bundle built successfully.' -ForegroundColor Green
    }

    if ($AppOnly) {
        Write-Host ''
        Write-Host '[OK] App-only build complete: apps/desktop/dist/app' -ForegroundColor Green
        exit 0
    }

    # 3. Packaging
    $Step += 1
    Write-Host ''
    Write-Host "[$Step/$TotalSteps] Packaging distribution..." -ForegroundColor Cyan

    if ($Package) {
        # Native Tauri build
        if (-not (Get-Command 'cargo.exe' -ErrorAction SilentlyContinue)) {
            Write-Host '[Error] Rust/Cargo is required to build the native Tauri package.' -ForegroundColor Red
            Write-Host '        Install Rust from https://rustup.rs, or run .\windows\build.ps1 -Portable instead.' -ForegroundColor Yellow
            exit 1
        }
        Write-Host '[package] Building native Tauri Windows bundle (NSIS/MSI)...' -ForegroundColor Cyan
        Push-Location (Join-Path $RepoRoot 'apps\desktop')
        try {
            & $BunExe run build
            if ($LASTEXITCODE -ne 0) {
                Write-Host "[Error] Tauri build failed with exit code $LASTEXITCODE" -ForegroundColor Red
                exit $LASTEXITCODE
            }
            Write-Host '[OK] Native Windows bundle built in apps/desktop/src-tauri/target/release/bundle' -ForegroundColor Green
        } finally {
            Pop-Location
        }
    } else {
        # Create Portable Distribution
        $PortableDir = Join-Path $RepoRoot 'dist\windows-portable'
        Write-Host "[package] Creating portable distribution at: $PortableDir" -ForegroundColor Cyan

        if (Test-Path $PortableDir) {
            # A portable server left running holds sheet-server.exe open; deleting
            # the directory would fail with a bare "file in use" error.
            $RunningServer = $null
            try {
                $RunningServer = Get-Process -Name 'sheet-server' -ErrorAction SilentlyContinue |
                    Where-Object {
                        $_.Path -and $_.Path.StartsWith($PortableDir, [System.StringComparison]::OrdinalIgnoreCase)
                    } |
                    Select-Object -First 1
            } catch {
                $RunningServer = $null
            }
            if ($RunningServer) {
                Write-Host "[Error] A previous portable Sheet server is still running from $PortableDir." -ForegroundColor Red
                Write-Host '        Close its window (or stop sheet-server.exe) and run the build again.' -ForegroundColor Yellow
                Write-Host '        Nothing was removed or overwritten.' -ForegroundColor Yellow
                exit 1
            }
            Remove-Item -Path $PortableDir -Recurse -Force
        }
        $null = New-Item -ItemType Directory -Path $PortableDir -Force

        # Copy server binary
        $ServerBinSource = Join-Path $RepoRoot 'apps\desktop\src-tauri\binaries\sheet-server.exe'
        if (-not (Test-Path $ServerBinSource)) {
            Write-Host "[Error] sheet-server.exe was not found at $ServerBinSource." -ForegroundColor Red
            Write-Host '        Run .\windows\build.ps1 (without -AppOnly) to compile it first.' -ForegroundColor Yellow
            exit 1
        }
        Copy-Item -Path $ServerBinSource -Destination (Join-Path $PortableDir 'sheet-server.exe') -Force

        # Copy web frontend assets
        $AppSource = Join-Path $RepoRoot 'apps\desktop\dist\app'
        if (-not (Test-Path (Join-Path $AppSource 'index.html'))) {
            Write-Host "[Error] The built interface was not found at $AppSource." -ForegroundColor Red
            Write-Host '        Run .\windows\build.ps1 (without -ServerOnly) to build it first.' -ForegroundColor Yellow
            exit 1
        }
        Copy-Item -Path $AppSource -Destination (Join-Path $PortableDir 'app') -Recurse -Force

        # The server serves the interface itself: SHEET_APP_DIR points at the
        # copied bundle, and the database lives where the README promises.
        $LauncherContent = @"
@echo off
setlocal
set SHEET_MCP_PORT=4100
set SHEET_SQLITE_PATH=%APPDATA%\Sheet\sheet.db
set SHEET_APP_DIR=%~dp0app
title Sheet Local Server
echo ========================================
echo   Sheet for Windows Portable
echo   Canvas:       http://127.0.0.1:4100
echo   MCP endpoint: http://127.0.0.1:4100/mcp
echo   Database:     %SHEET_SQLITE_PATH%
echo ========================================
echo.
start "Sheet" "%~dp0sheet-server.exe"
echo Waiting for the local server...
for /l %%i in (1,1,40) do (
  powershell -NoProfile -Command "try { `$r = Invoke-RestMethod -Uri 'http://127.0.0.1:4100/ready' -TimeoutSec 1; if (`$r.ready) { exit 0 } } catch {}; exit 1" >nul 2>&1
  if not errorlevel 1 goto ready
  timeout /t 1 /nobreak >nul
)
echo [Error] Sheet did not become ready on port 4100.
echo         The server window shows why; close it and run launch.bat again.
pause
exit /b 1
:ready
start "" http://127.0.0.1:4100
echo Sheet is running in the "Sheet" console window.
echo Close that window to stop the server.
timeout /t 5 /nobreak >nul
"@
        Set-Content -Path (Join-Path $PortableDir 'launch.bat') -Value $LauncherContent -Encoding Ascii

        Write-Host '[OK] Portable distribution ready in dist/windows-portable' -ForegroundColor Green
        Write-Host '     Run launch.bat to start Sheet and connect agents over MCP.' -ForegroundColor White
    }

    Write-Host ''
    Write-Host '========================================' -ForegroundColor Green
    Write-Host '      Windows Build Complete!           ' -ForegroundColor Green
    Write-Host '========================================' -ForegroundColor Green
    exit 0
} finally {
    Pop-Location
}

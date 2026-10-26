<#
.SYNOPSIS
    Build and packaging script for Sheet on Windows.
.DESCRIPTION
    Compiles the standalone backend server (sheet-server.exe), builds the
    Vite desktop web interface (dist/app), and creates either a portable distribution
    or a packaged native installer (via Tauri if Rust toolchain is installed).

.PARAMETER ServerOnly
    Builds only the backend server sidecar (apps/mcp/dist/sheet-server.exe).
.PARAMETER AppOnly
    Builds only the frontend interface (apps/desktop/dist/app).
.PARAMETER Portable
    Packages a standalone portable distribution into dist/windows-portable.
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
    Write-Error '[Error] Bun is required to build Sheet on Windows. Run .\windows\setup.ps1 first.'
    exit 1
}

Push-Location $RepoRoot
try {
    # 1. Build Server
    if (-not $AppOnly) {
        Write-Host '[1/3] Building backend server sidecar (sheet-server.exe)...' -ForegroundColor Cyan
        & $BunExe run scripts/build-server.ts
        if ($LASTEXITCODE -ne 0) {
            Write-Error "[Error] Server build failed with exit code $LASTEXITCODE"
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
    Write-Host ''
    Write-Host '[2/3] Building frontend application bundle (dist/app)...' -ForegroundColor Cyan
    & $BunExe run --cwd apps/desktop build:app
    if ($LASTEXITCODE -ne 0) {
        Write-Error "[Error] Frontend build failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
    Write-Host '[OK] Frontend bundle built successfully.' -ForegroundColor Green

    if ($AppOnly) {
        Write-Host ''
        Write-Host '[OK] App-only build complete: apps/desktop/dist/app' -ForegroundColor Green
        exit 0
    }

    # 3. Packaging
    Write-Host ''
    Write-Host '[3/3] Packaging distribution...' -ForegroundColor Cyan

    if ($Package) {
        # Native Tauri build
        if (-not (Get-Command 'cargo.exe' -ErrorAction SilentlyContinue)) {
            Write-Error '[Error] Rust/Cargo is required to build the native Tauri package. Install Rust from https://rustup.rs'
            exit 1
        }
        Write-Host '[package] Building native Tauri Windows bundle (NSIS/MSI)...' -ForegroundColor Cyan
        Push-Location (Join-Path $RepoRoot 'apps\desktop')
        try {
            & $BunExe run build
            if ($LASTEXITCODE -ne 0) {
                Write-Error "[Error] Tauri build failed with exit code $LASTEXITCODE"
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
            Remove-Item -Path $PortableDir -Recurse -Force
        }
        $null = New-Item -ItemType Directory -Path $PortableDir -Force

        # Copy server binary
        $ServerBinSource = Join-Path $RepoRoot 'apps\desktop\src-tauri\binaries\sheet-server.exe'
        if (-not (Test-Path $ServerBinSource)) {
            $ServerBinSource = Join-Path $RepoRoot 'apps\mcp\dist\sheet-server.exe'
        }
        Copy-Item -Path $ServerBinSource -Destination (Join-Path $PortableDir 'sheet-server.exe') -Force

        # Copy web frontend assets
        $AppSource = Join-Path $RepoRoot 'apps\desktop\dist\app'
        Copy-Item -Path $AppSource -Destination (Join-Path $PortableDir 'app') -Recurse -Force

        # Create runner script
        $LauncherContent = @"
@echo off
setlocal
set SHEET_MCP_PORT=4100
set SHEET_DATA_DIR=%APPDATA%\Sheet
title Sheet Local Server
echo ========================================
echo   Sheet for Windows Portable
echo   MCP Endpoint: http://127.0.0.1:4100/mcp
echo ========================================
echo.
start "" "%~dp0sheet-server.exe"
timeout /t 2 /nobreak >nul
start http://127.0.0.1:4100
echo Sheet server is running. Close this window to keep server running in background.
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

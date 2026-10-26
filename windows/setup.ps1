<#
.SYNOPSIS
    Setup script for Sheet on Windows.
.DESCRIPTION
    Checks prerequisites, validates repository root, verifies toolchains,
    installs workspace dependencies via Bun preserving bun.lock, and embeds database migrations.
#>

[CmdletBinding()]
param(
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Write-Host '========================================' -ForegroundColor Cyan
Write-Host '    Sheet for Windows - Setup Check     ' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

# 1. Verify Repository Root
$RepoRoot = $PSScriptRoot
if ((Split-Path -Leaf $RepoRoot) -eq 'windows') {
    $RepoRoot = Split-Path -Parent $RepoRoot
}

$PackageJsonPath = Join-Path $RepoRoot 'package.json'
if (-not (Test-Path $PackageJsonPath)) {
    Write-Error "Must run from within the Sheet repository. Could not find $PackageJsonPath"
    exit 1
}

try {
    $PackageData = Get-Content $PackageJsonPath -Raw | ConvertFrom-Json
    if ($PackageData.name -ne 'sheet') {
        Write-Error "package.json does not match Sheet repository (found name '$($PackageData.name)')."
        exit 1
    }
} catch {
    Write-Error "Failed to read package.json: $_"
    exit 1
}

Write-Host '[OK] Repository root verified at: ' -NoNewline -ForegroundColor Green
Write-Host $RepoRoot

# 2. Locate Bun Runtime
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
    Write-Host '[!] Bun is required but was not found on your system.' -ForegroundColor Red
    Write-Host '    Install Bun for Windows by running in PowerShell:' -ForegroundColor Yellow
    Write-Host '    powershell -c "irm bun.sh/install.ps1 | iex"' -ForegroundColor Yellow
    exit 1
}

$BunVersion = & $BunExe --version
Write-Host '[OK] Bun found: ' -NoNewline -ForegroundColor Green
Write-Host "$BunExe (v$BunVersion)"

# 3. Check Node.js
if (Get-Command 'node' -ErrorAction SilentlyContinue) {
    $NodeVersion = & node --version
    Write-Host '[OK] Node.js found: ' -NoNewline -ForegroundColor Green
    Write-Host $NodeVersion
} else {
    Write-Host '[info] Node.js not found in PATH (Bun will handle scripts).' -ForegroundColor DarkGray
}

# 4. Check Web Browsers (Chrome / Edge)
$ChromePaths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)

$FoundBrowser = $null
foreach ($Path in $ChromePaths) {
    if (Test-Path $Path) {
        $FoundBrowser = $Path
        break
    }
}

if ($FoundBrowser) {
    Write-Host '[OK] Chromium-based browser found: ' -NoNewline -ForegroundColor Green
    Write-Host $FoundBrowser
} else {
    Write-Host '[!] No standard Chrome or Edge found. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH if needed.' -ForegroundColor Yellow
}

# 5. Check Rust and Tauri prerequisites (Optional for -Web, required for native desktop build)
$HasCargo = $null -ne (Get-Command 'cargo.exe' -ErrorAction SilentlyContinue)
if ($HasCargo) {
    $CargoVersion = & cargo --version
    Write-Host '[OK] Rust/Cargo found: ' -NoNewline -ForegroundColor Green
    Write-Host "$CargoVersion (Native Tauri desktop builds enabled)"
} else {
    Write-Host '[info] Rust/Cargo not detected.' -ForegroundColor Yellow
    Write-Host '       Web development mode (.\windows\run.ps1 -Web) is fully functional without Rust.' -ForegroundColor Cyan
    Write-Host '       To build the native Tauri desktop package, install Rust: https://rustup.rs' -ForegroundColor DarkGray
}

# 6. Install Dependencies
if (-not $SkipInstall) {
    Write-Host ''
    Write-Host '[setup] Installing workspace dependencies via Bun...' -ForegroundColor Cyan
    Push-Location $RepoRoot
    try {
        & $BunExe install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) {
            Write-Error "bun install failed with exit code $LASTEXITCODE"
            exit $LASTEXITCODE
        }
        Write-Host '[OK] Dependencies installed successfully.' -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

# 7. Embed Migrations
Write-Host ''
Write-Host '[setup] Embedding database migrations...' -ForegroundColor Cyan
Push-Location $RepoRoot
try {
    & $BunExe run --cwd packages/db embed
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Database migration embed failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
    Write-Host '[OK] Migrations embedded.' -ForegroundColor Green
} finally {
    Pop-Location
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Green
Write-Host '    Sheet Windows Setup Complete!       ' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Green
Write-Host ''
Write-Host 'To start developing:' -ForegroundColor Cyan
Write-Host '  .\windows\run.ps1 -Web         # Launch visual canvas in default browser' -ForegroundColor White
Write-Host '  .\windows\run.ps1 -ServerOnly  # Run local server & MCP endpoint on :4100' -ForegroundColor White
if ($HasCargo) {
    Write-Host '  .\windows\run.ps1 -Desktop     # Launch native Tauri window' -ForegroundColor White
}
Write-Host ''
exit 0

<#
.SYNOPSIS
    Setup script for Sheet on Windows.
.DESCRIPTION
    Checks prerequisites, validates repository root, verifies toolchains,
    installs workspace dependencies via Bun preserving bun.lock, and embeds database migrations.
.PARAMETER SkipInstall
    Skip `bun install` and only verify the toolchain and embed migrations.
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
if (-not (Test-Path -LiteralPath $PackageJsonPath)) {
    Write-Host "[Error] Run this from inside the Sheet repository; $PackageJsonPath was not found." -ForegroundColor Red
    exit 1
}

try {
    $PackageData = Get-Content -LiteralPath $PackageJsonPath -Raw | ConvertFrom-Json
} catch {
    Write-Host "[Error] Could not read $PackageJsonPath as JSON: $_" -ForegroundColor Red
    exit 1
}

$PackageName = if ($PackageData.PSObject.Properties['name']) { $PackageData.name } else { $null }
if ($PackageName -ne 'sheet') {
    Write-Host "[Error] package.json does not look like the Sheet repository (found name '$PackageName')." -ForegroundColor Red
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
    if (Test-Path -LiteralPath $DefaultBunPath) {
        $BunExe = $DefaultBunPath
    }
}

if (-not $BunExe) {
    Write-Host '[!] Bun is required but was not found on your system.' -ForegroundColor Red
    Write-Host '    Install Bun for Windows by running in PowerShell:' -ForegroundColor Yellow
    Write-Host '    powershell -c "irm bun.sh/install.ps1 | iex"' -ForegroundColor Yellow
    exit 1
}

$BunVersion = (& $BunExe --version).Trim()
Write-Host '[OK] Bun found: ' -NoNewline -ForegroundColor Green
Write-Host "$BunExe (v$BunVersion)"

# The workspace lockfile and `bun:sqlite` usage need Bun 1.3 or newer.
$BunSemver = $null
if ($BunVersion -match '^(\d+)\.(\d+)\.(\d+)') {
    $BunSemver = [version]"$($Matches[1]).$($Matches[2]).$($Matches[3])"
}
if ($BunSemver -and $BunSemver -lt [version]'1.3.0') {
    Write-Host "[!] Bun $BunVersion is too old; Sheet needs 1.3.0 or newer." -ForegroundColor Red
    Write-Host '    Update with: bun upgrade' -ForegroundColor Yellow
    exit 1
}

# 3. Check Node.js
if (Get-Command 'node' -ErrorAction SilentlyContinue) {
    $NodeVersion = & node --version
    Write-Host '[OK] Node.js found: ' -NoNewline -ForegroundColor Green
    Write-Host $NodeVersion
} else {
    Write-Host '[info] Node.js not found in PATH (Bun runs the workspace scripts).' -ForegroundColor DarkGray
}

# 4. Check Web Browsers (Chrome / Edge)
$ChromePaths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

$FoundBrowser = $null
foreach ($Path in $ChromePaths) {
    if (Test-Path -LiteralPath $Path) {
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

# 5. Check Rust and Tauri prerequisites (optional; only for the native window)
$HasCargo = $null -ne (Get-Command 'cargo.exe' -ErrorAction SilentlyContinue)
if ($HasCargo) {
    $CargoVersion = & cargo --version
    Write-Host '[OK] Rust/Cargo found: ' -NoNewline -ForegroundColor Green
    Write-Host $CargoVersion
    Write-Host '     Native Tauri builds also need the MSVC C++ build tools and WebView2:' -ForegroundColor DarkGray
    Write-Host '     https://tauri.app/start/prerequisites/' -ForegroundColor DarkGray
} else {
    Write-Host '[info] Rust/Cargo not detected.' -ForegroundColor Yellow
    Write-Host '       Web development mode (.\windows\run.ps1 -Web) works without Rust.' -ForegroundColor Cyan
    Write-Host '       For the native window, install Rust (https://rustup.rs) plus the' -ForegroundColor DarkGray
    Write-Host '       "Desktop development with C++" workload from Visual Studio Build Tools.' -ForegroundColor DarkGray
}

# 6. Install Dependencies
if (-not $SkipInstall) {
    Write-Host ''
    Write-Host '[setup] Installing workspace dependencies via Bun...' -ForegroundColor Cyan
    Push-Location $RepoRoot
    try {
        & $BunExe install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[Error] bun install failed with exit code $LASTEXITCODE" -ForegroundColor Red
            Write-Host '        Check the error above; bun.lock is kept as-is.' -ForegroundColor Yellow
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
        Write-Host "[Error] Database migration embed failed with exit code $LASTEXITCODE" -ForegroundColor Red
        Write-Host '        The compiled server would start without migrations; fix the error above.' -ForegroundColor Yellow
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
Write-Host '  .\windows\run.ps1 -Web         # Canvas in your browser (no Rust needed)' -ForegroundColor White
Write-Host '  .\windows\run.ps1 -ServerOnly  # Local server and MCP endpoint on :4100' -ForegroundColor White
if ($HasCargo) {
    Write-Host '  .\windows\run.ps1 -Desktop     # Native Tauri window' -ForegroundColor White
}
Write-Host ''
exit 0

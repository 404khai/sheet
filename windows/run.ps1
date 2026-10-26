<#
.SYNOPSIS
    Development and runtime launcher for Sheet on Windows.
.DESCRIPTION
    Launches Sheet components with port checking, readiness probing,
    and process cleanup on exit.
#>

[CmdletBinding(DefaultParameterSetName = 'Web')]
param(
    [Parameter(ParameterSetName = 'Web')]
    [switch]$Web,

    [Parameter(ParameterSetName = 'ServerOnly')]
    [switch]$ServerOnly,

    [Parameter(ParameterSetName = 'Desktop')]
    [switch]$Desktop,

    [Parameter()]
    [int]$Port = 4100,

    [Parameter()]
    [int]$AppPort = 1421,

    [Parameter()]
    [string]$DataDir
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = $PSScriptRoot
if ((Split-Path -Leaf $RepoRoot) -eq 'windows') {
    $RepoRoot = Split-Path -Parent $RepoRoot
}

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
    Write-Error '[Error] Bun executable not found. Run .\windows\setup.ps1 first.'
    exit 1
}

# Configure environment
$env:SHEET_MCP_PORT = "$Port"
$env:SHEET_DESKTOP_APP_PORT = "$AppPort"
if ($DataDir) {
    $env:SHEET_DATA_DIR = $DataDir
} else {
    $env:SHEET_DATA_DIR = Join-Path $env:APPDATA 'Sheet Dev'
}

$ServerUrl = "http://127.0.0.1:$Port"
$AppUrl = "http://127.0.0.1:$AppPort"

$ModeName = 'Web Canvas'
if ($ServerOnly) {
    $ModeName = 'Server-Only'
} elseif ($Desktop) {
    $ModeName = 'Native Desktop'
}

Write-Host '========================================' -ForegroundColor Cyan
Write-Host '         Sheet for Windows             ' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host "Mode:        $ModeName" -ForegroundColor White
Write-Host "MCP Port:    $Port ($ServerUrl/mcp)" -ForegroundColor White
Write-Host "Data Dir:    $($env:SHEET_DATA_DIR)" -ForegroundColor White
Write-Host ''

# Child process tracking for graceful shutdown
$Script:Processes = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()

function Stop-AllChildren {
    Write-Host ''
    Write-Host '[shutdown] Stopping child processes...' -ForegroundColor Yellow
    foreach ($proc in $Script:Processes) {
        if (-not $proc.HasExited) {
            try {
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            } catch {}
        }
    }
    Write-Host '[shutdown] Clean exit.' -ForegroundColor Green
}

function Test-ServerReady {
    try {
        $res = Invoke-RestMethod -Uri "$ServerUrl/ready" -TimeoutSec 1 -ErrorAction SilentlyContinue
        return ($null -ne $res -and $res.ready -eq $true)
    } catch {
        return $false
    }
}

# 1. Start Server if needed
$ServerAlreadyRunning = Test-ServerReady
$ServerProc = $null

if ($ServerAlreadyRunning) {
    Write-Host "[info] Local server already running at $ServerUrl (reusing it)." -ForegroundColor Green
} else {
    Write-Host "[start] Starting local Sheet server on $ServerUrl..." -ForegroundColor Cyan
    $ServerPsi = [System.Diagnostics.ProcessStartInfo]::new($BunExe)
    $ServerPsi.Arguments = 'run src/local.ts'
    $ServerPsi.WorkingDirectory = Join-Path $RepoRoot 'apps\mcp'
    $ServerPsi.UseShellExecute = $false
    
    $ServerProc = [System.Diagnostics.Process]::Start($ServerPsi)
    $Script:Processes.Add($ServerProc)

    # Wait for /ready
    $Deadline = (Get-Date).AddSeconds(20)
    $Ready = $false
    while ((Get-Date) -lt $Deadline) {
        Start-Sleep -Milliseconds 250
        if (Test-ServerReady) {
            $Ready = $true
            break
        }
    }

    if (-not $Ready) {
        Write-Error '[Error] Server failed to become ready within 20 seconds.'
        Stop-AllChildren
        exit 1
    }
    Write-Host "[OK] Local server ready at $ServerUrl" -ForegroundColor Green
    Write-Host "     MCP Endpoint: $ServerUrl/mcp" -ForegroundColor Green
}

if ($ServerOnly) {
    Write-Host ''
    Write-Host '[info] Server is running. Press Ctrl+C to stop.' -ForegroundColor White
    try {
        while ($true) {
            Start-Sleep -Seconds 1
            if ($ServerProc -and $ServerProc.HasExited) {
                Write-Host '[!] Server process exited.' -ForegroundColor Yellow
                break
            }
        }
    } finally {
        Stop-AllChildren
    }
    exit 0
}

# 2. Launch Interface
if ($Desktop) {
    if (-not (Get-Command 'cargo.exe' -ErrorAction SilentlyContinue)) {
        Write-Error '[Error] Cargo/Rust is required for -Desktop mode. Install Rust from https://rustup.rs or use -Web mode.'
        Stop-AllChildren
        exit 1
    }

    Write-Host '[start] Launching native desktop window via Tauri...' -ForegroundColor Cyan
    Push-Location (Join-Path $RepoRoot 'apps\desktop')
    try {
        $DesktopProc = Start-Process -FilePath $BunExe -ArgumentList 'run dev' -PassThru -NoNewWindow
        $Script:Processes.Add($DesktopProc)
        $DesktopProc.WaitForExit()
    } finally {
        Pop-Location
        Stop-AllChildren
    }
} else {
    Write-Host "[start] Starting visual canvas Vite server on $AppUrl..." -ForegroundColor Cyan
    $VitePsi = [System.Diagnostics.ProcessStartInfo]::new($BunExe)
    $VitePsi.Arguments = 'run dev:web'
    $VitePsi.WorkingDirectory = Join-Path $RepoRoot 'apps\desktop'
    $VitePsi.UseShellExecute = $false

    $ViteProc = [System.Diagnostics.Process]::Start($VitePsi)
    $Script:Processes.Add($ViteProc)

    # Wait for Vite dev server
    $ViteReady = $false
    $Deadline = (Get-Date).AddSeconds(15)
    while ((Get-Date) -lt $Deadline) {
        Start-Sleep -Milliseconds 300
        try {
            $testReq = Invoke-WebRequest -Uri $AppUrl -TimeoutSec 1 -UseBasicParsing -ErrorAction SilentlyContinue
            if ($testReq.StatusCode -eq 200) {
                $ViteReady = $true
                break
            }
        } catch {}
    }

    Write-Host "[OK] Sheet Visual Canvas is live at: $AppUrl" -ForegroundColor Green
    Write-Host '[info] Opening in your default browser...' -ForegroundColor Cyan
    Start-Process $AppUrl

    Write-Host ''
    Write-Host 'Press Ctrl+C to shut down Sheet.' -ForegroundColor DarkGray
    try {
        while ($true) {
            Start-Sleep -Seconds 1
            if ($ViteProc.HasExited) { break }
        }
    } finally {
        Stop-AllChildren
    }
}

exit 0

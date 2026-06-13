# ani-desk Windows diagnostic tool

[CmdletBinding()]
param(
    [string]$InstallDir = "$env:LOCALAPPDATA\ani-desk"
)

$ErrorActionPreference = "Continue"

function Write-Status {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Test-VersionCommand {
    param([string]$Path)

    if (-not $Path) {
        return $false
    }

    try {
        $output = & $Path --version 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Status "  [FAIL] $Path exited with $LASTEXITCODE" "Red"
            return $false
        }
        Write-Status "  [OK] $Path" "Green"
        if ($output) {
            Write-Status "       $($output | Select-Object -First 1)" "DarkGray"
        }
        return $true
    } catch {
        Write-Status "  [FAIL] $Path - $_" "Red"
        return $false
    }
}

function Test-BinaryFile {
    param([string]$Path)

    if ((Test-Path $Path) -and ((Get-Item $Path).Length -gt 0)) {
        Write-Status "  [OK] $Path" "Green"
        return $true
    }

    Write-Status "  [FAIL] Missing or empty: $Path" "Red"
    return $false
}

Write-Status "========================================" "Cyan"
Write-Status "ani-desk Windows diagnostics" "Cyan"
Write-Status "========================================" "Cyan"
Write-Status "Tool directory: $InstallDir"
Write-Status ""

Write-Status "ani-desk app candidates:" "Yellow"
$aniCandidates = New-Object System.Collections.Generic.List[string]
$aniCommand = Get-Command ani-desk -ErrorAction SilentlyContinue
if ($aniCommand) {
    $aniCandidates.Add($aniCommand.Source)
}
$aniCandidates.Add((Join-Path $env:LOCALAPPDATA "Programs\ani-desk\ani-desk.exe"))
$aniCandidates.Add((Join-Path $env:ProgramFiles "ani-desk\ani-desk.exe"))
$aniCandidates.Add((Join-Path ${env:ProgramFiles(x86)} "ani-desk\ani-desk.exe"))

$foundAniDesk = $false
foreach ($candidate in ($aniCandidates | Where-Object { $_ } | Select-Object -Unique)) {
    if (Test-Path $candidate) {
        Test-BinaryFile $candidate | Out-Null
        $foundAniDesk = $true
    } else {
        Write-Status "  [MISS] $candidate" "DarkGray"
    }
}

if (-not $foundAniDesk) {
    Write-Status "  [WARN] ani-desk desktop install was not found in common locations" "Yellow"
    Write-Status "         Reinstall with the latest NSIS setup or MSI release artifact." "DarkGray"
}

Write-Status ""
Write-Status "PATH command:" "Yellow"
if ($aniCommand) {
    Write-Status "  [OK] ani-desk resolves to: $($aniCommand.Source)" "Green"
} else {
    Write-Status "  [INFO] ani-desk is not expected to be on PATH for the desktop installer" "DarkGray"
    Write-Status "         Launch from the Start Menu." "DarkGray"
}

Write-Status ""
Write-Status "mpv candidates:" "Yellow"
$mpvCandidates = New-Object System.Collections.Generic.List[string]
if ($env:ANI_DESK_PLAYER) {
    $mpvCandidates.Add($env:ANI_DESK_PLAYER)
    Write-Status "  ANI_DESK_PLAYER: $env:ANI_DESK_PLAYER" "DarkGray"
} else {
    Write-Status "  ANI_DESK_PLAYER is not set in this terminal" "Yellow"
}

$mpvCommand = Get-Command mpv -ErrorAction SilentlyContinue
if ($mpvCommand) {
    $mpvCandidates.Add($mpvCommand.Source)
}
$mpvCandidates.Add((Join-Path $InstallDir "mpv.exe"))
$mpvCandidates.Add((Join-Path $InstallDir "tools\mpv\mpv.exe"))

$foundMpv = $false
foreach ($candidate in ($mpvCandidates | Select-Object -Unique)) {
    if (Test-Path $candidate) {
        if (Test-VersionCommand $candidate) {
            $foundMpv = $true
        }
    } else {
        Write-Status "  [MISS] $candidate" "DarkGray"
    }
}

if (-not $foundMpv) {
    Write-Status "  [FAIL] No usable mpv.exe found" "Red"
    Write-Status "         Rerun the installer or set ANI_DESK_PLAYER to the full mpv.exe path." "Yellow"
}

Write-Status ""
Write-Status "Recent mpv log:" "Yellow"
$mpvLog = Join-Path $env:TEMP "ani-desk-mpv.log"
if (Test-Path $mpvLog) {
    Write-Status "  $mpvLog" "DarkGray"
    Get-Content $mpvLog -Tail 40
} else {
    Write-Status "  [MISS] No mpv log found at $mpvLog" "DarkGray"
}

Write-Status ""
Write-Status "Environment:" "Yellow"
Write-Status "  PowerShell: $($PSVersionTable.PSVersion)"
Write-Status "  Windows:    $([Environment]::OSVersion.VersionString)"
Write-Status "  TEMP:       $env:TEMP"

Write-Status ""
Write-Status "Recommended reinstall command:" "Cyan"
Write-Status '  powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr -useb https://github.com/silent9669/ani-desk/releases/latest/download/install.ps1 -OutFile install.ps1; .\install.ps1"'

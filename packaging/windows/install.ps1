# ani-desk Windows installer helper
# Downloads the signed-state release installer, installs optional mpv fallback, and leaves ani-desk launchable from Start Menu.

[CmdletBinding()]
param(
    [string]$InstallDir = "$env:LOCALAPPDATA\ani-desk",
    [switch]$Msi,
    [switch]$SkipDependencies
)

$ErrorActionPreference = "Stop"

$AniDeskRepo = "silent9669/ani-desk"
$MpvRepo = "shinchiro/mpv-winbuild-cmake"
$TempRoot = Join-Path $env:TEMP "ani-desk-install"

function Write-Status {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Test-Command {
    param([string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Download {
    param(
        [string]$Uri,
        [string]$OutFile
    )

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutFile) | Out-Null
    Invoke-WebRequest -Uri $Uri -OutFile $OutFile -UseBasicParsing -ErrorAction Stop
}

function Get-GitHubLatestRelease {
    param([string]$Repository)

    Invoke-RestMethod `
        -Uri "https://api.github.com/repos/$Repository/releases/latest" `
        -Headers @{ "User-Agent" = "ani-desk-installer" } `
        -ErrorAction Stop
}

function Get-ReleaseAsset {
    param(
        [object]$Release,
        [string]$NamePattern
    )

    $asset = $Release.assets |
        Where-Object { $_.name -like $NamePattern } |
        Select-Object -First 1

    if (-not $asset) {
        throw "Could not find release asset matching $NamePattern"
    }

    return $asset
}

function Add-UserPathEntry {
    param([string]$PathEntry)

    if (-not $PathEntry -or -not (Test-Path $PathEntry)) {
        return
    }

    $currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    $entries = @()
    if ($currentPath) {
        $entries = $currentPath -split ';' | Where-Object { $_ }
    }

    $normalized = $PathEntry.TrimEnd('\', '/')
    $alreadyPresent = $entries | Where-Object { $_.TrimEnd('\', '/') -ieq $normalized }
    if (-not $alreadyPresent) {
        $newPath = (($entries + $PathEntry) -join ';')
        [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
        Write-Status "[OK] Added to User PATH: $PathEntry" "Green"
    }

    if (($env:PATH -split ';' | Where-Object { $_.TrimEnd('\', '/') -ieq $normalized }).Count -eq 0) {
        $env:PATH = "$env:PATH;$PathEntry"
    }
}

function Test-ExecutableVersion {
    param([string]$Path)

    if (-not $Path) {
        return $false
    }

    try {
        $output = & $Path --version 2>&1
        if ($LASTEXITCODE -ne 0) {
            return $false
        }
        if ($output) {
            Write-Status "      $($output | Select-Object -First 1)" "DarkGray"
        }
        return $true
    } catch {
        return $false
    }
}

function Resolve-MpvPath {
    $candidates = New-Object System.Collections.Generic.List[string]

    if ($env:ANI_DESK_PLAYER) {
        $candidates.Add($env:ANI_DESK_PLAYER)
    }

    $mpvCommand = Get-Command mpv -ErrorAction SilentlyContinue
    if ($mpvCommand) {
        $candidates.Add($mpvCommand.Source)
    }

    $candidates.Add((Join-Path $InstallDir "tools\mpv\mpv.exe"))

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if ((Test-Path $candidate) -and (Test-ExecutableVersion $candidate)) {
            return $candidate
        }
    }

    return $null
}

function Install-VisualCppRedistributable {
    if ((Test-Path "$env:SystemRoot\System32\vcruntime140.dll") -and
        (Test-Path "$env:SystemRoot\System32\msvcp140.dll")) {
        Write-Status "[OK] Visual C++ Redistributable detected" "Green"
        return
    }

    if (-not (Test-Command "winget")) {
        Write-Status "[WARN] winget not found; skipping Visual C++ Redistributable auto-install" "Yellow"
        return
    }

    Write-Status "[..] Installing Visual C++ Redistributable with winget" "Cyan"
    & winget install --id Microsoft.VCRedist.2015+.x64 --exact --silent --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -eq 0) {
        Write-Status "[OK] Visual C++ Redistributable installed" "Green"
    } else {
        Write-Status "[WARN] Visual C++ Redistributable install returned exit code $LASTEXITCODE" "Yellow"
    }
}

function Install-MpvWithWinget {
    if (-not (Test-Command "winget")) {
        Write-Status "[WARN] winget not found; using portable mpv fallback" "Yellow"
        return $null
    }

    Write-Status "[..] Installing mpv with winget package shinchiro.mpv" "Cyan"
    & winget install --id shinchiro.mpv --exact --silent --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
        Write-Status "[WARN] winget mpv install returned exit code $LASTEXITCODE" "Yellow"
        return $null
    }

    $mpvCommand = Get-Command mpv -ErrorAction SilentlyContinue
    if ($mpvCommand -and (Test-ExecutableVersion $mpvCommand.Source)) {
        return $mpvCommand.Source
    }

    Write-Status "[WARN] winget completed, but mpv.exe was not visible in this session" "Yellow"
    return $null
}

function Get-MpvPortableAsset {
    $release = Get-GitHubLatestRelease $MpvRepo
    $pattern = if ([Environment]::Is64BitOperatingSystem) {
        "mpv-x86_64-*.7z"
    } else {
        "mpv-i686-*.7z"
    }

    $asset = $release.assets |
        Where-Object {
            $_.name -like $pattern -and
            $_.name -notlike "*dev*" -and
            $_.name -notlike "*v3*"
        } |
        Select-Object -First 1

    if (-not $asset) {
        throw "Could not find a portable mpv release asset matching $pattern"
    }

    return $asset
}

function Expand-MpvArchive {
    param(
        [string]$ArchivePath,
        [string]$Destination
    )

    New-Item -ItemType Directory -Force -Path $Destination | Out-Null

    if (Test-Command "tar") {
        & tar -xf $ArchivePath -C $Destination
        if ($LASTEXITCODE -eq 0) {
            return
        }
        Write-Status "[WARN] tar could not extract mpv archive; trying 7z if available" "Yellow"
    }

    $sevenZip = Get-Command 7z -ErrorAction SilentlyContinue
    if ($sevenZip) {
        & $sevenZip.Source x $ArchivePath "-o$Destination" -y | Out-Null
        if ($LASTEXITCODE -eq 0) {
            return
        }
    }

    throw "Could not extract mpv .7z archive. Install winget or 7-Zip, then rerun this installer."
}

function Install-MpvPortable {
    Write-Status "[..] Installing portable mpv fallback" "Cyan"

    $asset = Get-MpvPortableAsset
    $archivePath = Join-Path $TempRoot $asset.name
    $extractDir = Join-Path $TempRoot "mpv-extract"
    $targetDir = Join-Path $InstallDir "tools\mpv"

    Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $targetDir -Recurse -Force -ErrorAction SilentlyContinue

    Invoke-Download $asset.browser_download_url $archivePath
    Expand-MpvArchive $archivePath $extractDir

    $mpvExe = Get-ChildItem -Path $extractDir -Filter "mpv.exe" -Recurse |
        Select-Object -First 1

    if (-not $mpvExe) {
        throw "Downloaded mpv archive did not contain mpv.exe"
    }

    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    Copy-Item -Path (Join-Path $mpvExe.DirectoryName '*') -Destination $targetDir -Recurse -Force

    $mpvPath = Join-Path $targetDir "mpv.exe"
    if (-not (Test-ExecutableVersion $mpvPath)) {
        throw "Portable mpv was extracted but did not run: $mpvPath"
    }

    Add-UserPathEntry $targetDir
    return $mpvPath
}

function Install-AniDesk {
    Write-Status "[..] Downloading latest ani-desk desktop installer" "Cyan"

    $release = Get-GitHubLatestRelease $AniDeskRepo
    $pattern = if ($Msi) { "ani-desk_*_x64.msi" } else { "ani-desk_*_x64-setup.exe" }
    $asset = Get-ReleaseAsset $release $pattern
    $installerPath = Join-Path $TempRoot $asset.name

    Invoke-Download $asset.browser_download_url $installerPath

    if ($Msi) {
        Write-Status "[..] Running MSI installer" "Cyan"
        $process = Start-Process -FilePath "msiexec.exe" -ArgumentList @("/i", $installerPath, "/passive", "/norestart") -Wait -PassThru
    } else {
        Write-Status "[..] Running NSIS installer" "Cyan"
        $process = Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait -PassThru
    }

    if ($process.ExitCode -ne 0) {
        throw "ani-desk installer exited with code $($process.ExitCode)"
    }

    Write-Status "[OK] ani-desk desktop installer completed" "Green"
}

Write-Status "========================================" "Cyan"
Write-Status "ani-desk Windows desktop installer" "Cyan"
Write-Status "========================================" "Cyan"

New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

if (-not $SkipDependencies) {
    Install-VisualCppRedistributable
}

Install-AniDesk

$mpvPath = Resolve-MpvPath
if (-not $mpvPath -and -not $SkipDependencies) {
    $mpvPath = Install-MpvWithWinget
}
if (-not $mpvPath -and -not $SkipDependencies) {
    $mpvPath = Install-MpvPortable
}
if ($mpvPath) {
    [Environment]::SetEnvironmentVariable("ANI_DESK_PLAYER", $mpvPath, "User")
    $env:ANI_DESK_PLAYER = $mpvPath
    Write-Status "[OK] ANI_DESK_PLAYER set to: $mpvPath" "Green"
} else {
    Write-Status "[WARN] mpv was not found. Built-in playback still works; install mpv for fallback playback." "Yellow"
}

Remove-Item $TempRoot -Recurse -Force -ErrorAction SilentlyContinue

Write-Status ""
Write-Status "========================================" "Green"
Write-Status "Installation complete" "Green"
Write-Status "========================================" "Green"
Write-Status "Launch ani-desk from the Start Menu." "Cyan"
Write-Status "Unsigned v1.0 artifacts may trigger Windows SmartScreen on first launch." "Yellow"
Write-Status "If fallback playback fails, inspect: $env:TEMP\ani-desk-mpv.log" "Cyan"

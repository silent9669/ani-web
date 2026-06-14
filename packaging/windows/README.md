# Windows Installation Guide

## Recommended Installer

Download the latest `ani-desk_1.0.1_x64-setup.exe` from the GitHub Release and run it.
The installer creates Start Menu entries and uses the generated `logo.png` app icon.

PowerShell helper:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr -useb https://github.com/silent9669/ani-desk/releases/latest/download/install.ps1 -OutFile install.ps1; .\install.ps1"
```

The helper:

- downloads and runs the latest NSIS desktop installer
- verifies Visual C++ Redistributable when winget is available
- installs or locates `mpv` for fallback video playback
- falls back to a portable shinchiro mpv build under `%LOCALAPPDATA%\ani-desk\tools\mpv`
- sets `ANI_DESK_PLAYER` to the resolved `mpv.exe`

Launch ani-desk from the Start Menu after installation.

For MSI validation or enterprise-style install testing, use the release `ani-desk_1.0.1_x64.msi` artifact or run the helper with `-Msi`.

The v1.0 installers are unsigned, so Windows SmartScreen may ask you to approve the first launch.

## Troubleshooting

Run the diagnostic script:

```powershell
iwr -useb https://raw.githubusercontent.com/silent9669/ani-desk/master/packaging/windows/diagnose.ps1 | iex
```

If video playback does not open an mpv window, inspect:

```powershell
$env:TEMP\ani-desk-mpv.log
```

You can also force a specific player:

```powershell
[Environment]::SetEnvironmentVariable("ANI_DESK_PLAYER", "C:\path\to\mpv.exe", "User")
```

## Legacy Scripts

`install-complete.ps1`, `install-easy.ps1`, `install-all.bat`, and `install.bat` are compatibility wrappers. New documentation and releases should point to the NSIS setup, MSI, or `install.ps1`.

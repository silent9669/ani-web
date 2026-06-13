@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://github.com/silent9669/ani-desk/releases/latest/download/install.ps1' -OutFile '%TEMP%\ani-desk-install.ps1' -UseBasicParsing; & '%TEMP%\ani-desk-install.ps1'"
exit /b %ERRORLEVEL%

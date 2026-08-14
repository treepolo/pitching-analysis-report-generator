@echo off
setlocal EnableExtensions

cd /d "%~dp0"

where npm.cmd >nul 2>&1
if errorlevel 1 goto npm_missing

if exist "node_modules\electron\package.json" goto start_app

echo [INFO] Electron dependency not found. Installing dependencies...
call npm.cmd install
if errorlevel 1 goto install_failed
if not exist "node_modules\electron\package.json" goto install_incomplete

:start_app
set "PITCHING_DISABLE_GPU=1"
call npm.cmd start -- --disable-gpu
if errorlevel 1 goto start_failed
endlocal
exit /b 0

:npm_missing
echo [ERROR] npm.cmd was not found on PATH.
echo Please install Node.js and npm, then try again.
pause
endlocal
exit /b 1

:install_failed
set "exitCode=%ERRORLEVEL%"
echo [ERROR] npm.cmd install failed. Exit code: %exitCode%
pause
endlocal
exit /b %exitCode%

:install_incomplete
echo [ERROR] npm install completed but Electron is still missing.
pause
endlocal
exit /b 1

:start_failed
set "exitCode=%ERRORLEVEL%"
echo [ERROR] Electron failed to start. Exit code: %exitCode%
pause
endlocal
exit /b %exitCode%

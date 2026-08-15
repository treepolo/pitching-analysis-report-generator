@echo off
setlocal EnableExtensions
chcp 65001 >nul

set "PROJECT_ROOT=%~dp0"
if exist "%PROJECT_ROOT%package.json" goto project_root_ready

set "COPY_ROOT=%~dp0投球報告輸出器"
if exist "%COPY_ROOT%\package.json" goto copy_root_ready

if not defined PITCHING_REPORT_PROJECT_ROOT goto package_missing
if not exist "%PITCHING_REPORT_PROJECT_ROOT%\package.json" goto package_missing
set "PROJECT_ROOT=%PITCHING_REPORT_PROJECT_ROOT%"
goto project_root_ready

:copy_root_ready
set "PROJECT_ROOT=%COPY_ROOT%"

:project_root_ready
pushd "%PROJECT_ROOT%" >nul 2>&1
if errorlevel 1 goto project_dir_failed
set "PITCHING_PUSHED=1"

where npm.cmd >nul 2>&1
if errorlevel 1 goto npm_missing

if exist "node_modules\electron\package.json" goto start_app

echo [INFO] Electron dependency not found. Installing dependencies...
call npm.cmd install
if errorlevel 1 goto install_failed
if not exist "node_modules\electron\package.json" goto install_incomplete

:start_app
set "PITCHING_DISABLE_GPU=1"
echo [INFO] Starting Pitching Report Generator...
call npm.cmd start -- --disable-gpu
if errorlevel 1 goto start_failed
set "exitCode=0"
goto finish

:project_dir_failed
set "exitCode=1"
echo [ERROR] Could not change to the selected project directory.
pause
goto finish

:package_missing
set "exitCode=1"
echo [ERROR] package.json was not found in the launcher directory.
echo [ERROR] The direct child folder named Pitching Report Generator was not found.
echo [ERROR] PITCHING_REPORT_PROJECT_ROOT is unset or does not point to a project.
echo [ERROR] Put this launcher back in the project folder or set that environment variable.
pause
goto finish

:npm_missing
set "exitCode=1"
echo [ERROR] npm.cmd was not found on PATH.
echo [ERROR] Install Node.js and npm, then try again.
pause
goto finish

:install_failed
set "exitCode=%ERRORLEVEL%"
echo [ERROR] npm install failed. Exit code: %exitCode%
pause
goto finish

:install_incomplete
set "exitCode=1"
echo [ERROR] npm install completed but Electron is still missing.
pause
goto finish

:start_failed
set "exitCode=%ERRORLEVEL%"
echo [ERROR] Electron failed to start. Exit code: %exitCode%
pause
goto finish

:finish
if defined PITCHING_PUSHED popd >nul 2>&1
endlocal & exit /b %exitCode%

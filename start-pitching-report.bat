@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm was not found on PATH.
  echo 請先安裝 Node.js/npm，再重新啟動。
  pause
  endlocal & exit /b 2
)

if not exist "node_modules\electron\package.json" (
  echo [INFO] Electron dependency is missing. Installing dependencies...
  echo 正在安裝 Electron 依賴，請稍候...
  call npm install
  set "installExitCode=!ERRORLEVEL!"
  if not "!installExitCode!"=="0" (
    echo [ERROR] npm install failed. Exit code: !installExitCode!
    echo npm install 失敗，請檢查上方錯誤訊息。
    pause
    endlocal & exit /b !installExitCode!
  )
)

if not exist "node_modules\electron\package.json" (
  echo [錯誤] 找不到 Electron 依賴。
  echo [ERROR] Electron dependency was not found.
  echo 請先執行 npm install，再重新啟動。
  echo Please run npm install first, then start the application again.
  pause
  endlocal & exit /b 1
)

set "PITCHING_DISABLE_GPU=1"
call npm start -- --disable-gpu
set "exitCode=%ERRORLEVEL%"
if not "%exitCode%"=="0" (
  echo [ERROR] Electron failed to start. Exit code: %exitCode%
  echo 啟動失敗，請查看上方錯誤訊息。
  pause
)
endlocal & exit /b %exitCode%

@echo off
setlocal

cd /d "%~dp0"
if not exist "node_modules\electron\package.json" (
  echo [錯誤] 找不到 Electron 依賴。
  echo [ERROR] Electron dependency was not found.
  echo 請先執行 npm install，再重新啟動。
  echo Please run npm install first, then start the application again.
  endlocal & exit /b 1
)

call npm start -- --disable-gpu
set "exitCode=%ERRORLEVEL%"
if not "%exitCode%"=="0" (
  echo [ERROR] Electron failed to start. Exit code: %exitCode%
  echo 啟動失敗，請查看上方錯誤訊息。
  pause
)
endlocal & exit /b %exitCode%

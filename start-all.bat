@echo off
setlocal
rem ==========================================================================
rem  Starts the User backend (http://localhost:5090) and frontend
rem  (http://localhost:5173), each in its own window, then opens the browser.
rem  Close the two windows (or press Ctrl+C in them) to stop.
rem ==========================================================================

set "ROOT=%~dp0"

rem Use the portable Node.js if it exists on this machine, otherwise the installed one.
if exist "D:\work\tools\node-v26.5.0-win-x64\node.exe" set "PATH=D:\work\tools\node-v26.5.0-win-x64;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 22 or newer from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist "%ROOT%user-backend\.env" (
  echo user-backend\.env is missing. Copy user-backend\.env.example to .env and set DB_USER / DB_PASSWORD.
  pause
  exit /b 1
)

rem Install packages the first time.
if not exist "%ROOT%user-backend\node_modules" (
  echo Installing backend packages...
  pushd "%ROOT%user-backend" && call npm install && popd
)
if not exist "%ROOT%user-frontend\node_modules" (
  echo Installing frontend packages...
  pushd "%ROOT%user-frontend" && call npm install && popd
)

echo Starting backend...
start "User Backend (5090)" /D "%ROOT%user-backend" cmd /k npm start

rem Wait up to 30 seconds for the backend to answer.
set /a tries=0
:wait_backend
curl -s -o nul http://localhost:5090/api/games/hot >nul 2>nul
if not errorlevel 1 goto backend_up
set /a tries+=1
if %tries% geq 30 (
  echo The backend did not start. Check the "User Backend" window for the error
  echo ^(usually a wrong DB_PASSWORD in user-backend\.env or MySQL not running^).
  pause
  exit /b 1
)
ping -n 2 127.0.0.1 >nul
goto wait_backend

:backend_up
echo Backend is up on http://localhost:5090
echo Starting frontend...
start "User Frontend (5173)" /D "%ROOT%user-frontend" cmd /k npm run dev

ping -n 5 127.0.0.1 >nul
start "" http://localhost:5173

echo.
echo Both are running. Sign in with  user / @12345#$%%
echo To stop, close the "User Backend" and "User Frontend" windows.
endlocal

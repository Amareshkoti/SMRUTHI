@echo off
setlocal EnableDelayedExpansion
title SMRUTI

rem ===========================================================================
rem  Starts everything SMRUTI needs on Windows, with one double-click.
rem
rem    start.bat            phone and laptop on the same Wi-Fi (or your hotspot)
rem    start.bat --mock     same, but no NVIDIA calls at all (offline demo)
rem    start.bat --web      no phone at all -- open the app in Chrome instead
rem
rem  Metro runs in this window, so the QR code appears here. Closing this
rem  window, or pressing Ctrl-C, stops the API server too.
rem
rem  This is the Windows twin of dev.sh, which does the same thing under WSL.
rem ===========================================================================

cd /d "%~dp0"
set "ROOT=%~dp0"
set "MOCK=0"
set "WEB=0"

:parseargs
if "%~1"=="" goto argsdone
if /i "%~1"=="--mock" (
  set "MOCK=1"
  shift
  goto parseargs
)
if /i "%~1"=="--web" (
  set "WEB=1"
  shift
  goto parseargs
)
if /i "%~1"=="-h" goto usage
if /i "%~1"=="--help" goto usage
echo unknown option: %~1
exit /b 2
:argsdone

rem --- node ------------------------------------------------------------------
where node >NUL 2>&1
if errorlevel 1 (
  echo.
  echo Node is not on your PATH. Install the LTS build from https://nodejs.org
  echo and open a NEW terminal window afterwards.
  echo.
  pause
  exit /b 1
)

rem --- the NVIDIA key --------------------------------------------------------
rem Without it the server refuses to start, so catch it here rather than let it
rem fail eight lines into a stack trace.
if "%MOCK%"=="1" goto envok
if exist "%ROOT%server\.env" goto envok

echo.
echo   server\.env is missing, so there is no NVIDIA API key to answer with.
echo.
rem The WSL account name is not the Windows one, so ask WSL where its own home
rem is rather than guessing at /home/%USERNAME%.
wsl.exe -d Ubuntu-24.04 bash -lc "test -f ~/smruti/server/.env" >NUL 2>&1
if not errorlevel 1 (
  set "WSLENV_PATH="
  for /f "usebackq tokens=* delims=" %%i in (`wsl.exe -d Ubuntu-24.04 bash -lc "wslpath -w ~/smruti/server/.env"`) do set "WSLENV_PATH=%%i"
  echo   One already exists in your WSL copy at ~/smruti/server/.env
  set /p "COPYENV=  Copy it over to this folder? [Y/n] "
  if /i "!COPYENV!"=="n" goto envhelp
  copy /y "!WSLENV_PATH!" "%ROOT%server\.env" >NUL 2>&1
  if exist "%ROOT%server\.env" (
    echo   Copied. It is gitignored, so it will not be committed.
    echo.
    goto envok
  )
  echo   Could not copy it automatically.
)

:envhelp
echo   Do one of these:
echo     - copy server\.env.example to server\.env and put your key in it
echo       ^(get one at https://build.nvidia.com^)
echo     - or re-run as:  start.bat --mock    to demo with no NVIDIA calls
echo.
pause
exit /b 1
:envok

rem --- dependencies ----------------------------------------------------------
if not exist "%ROOT%server\node_modules" (
  echo Installing server dependencies, this happens once...
  pushd "%ROOT%server"
  call npm install
  popd
  if not exist "%ROOT%server\node_modules" (
    echo npm install failed in server\. Scroll up for the reason.
    pause
    exit /b 1
  )
)
if not exist "%ROOT%mobile\node_modules" (
  echo Installing app dependencies, this takes a few minutes the first time...
  pushd "%ROOT%mobile"
  call npm install
  popd
  if not exist "%ROOT%mobile\node_modules" (
    echo npm install failed in mobile\. Scroll up for the reason.
    pause
    exit /b 1
  )
)

rem --- the address the phone dials -------------------------------------------
rem Ask the routing table which source address actually reaches the internet.
rem Taking the first adapter instead would hand the phone a WSL or Hyper-V
rem address that it cannot route to.
set "LAN="
for /f "usebackq tokens=* delims=" %%i in (`powershell -NoProfile -Command "(Find-NetRoute -RemoteIPAddress 1.1.1.1 -ErrorAction SilentlyContinue)[0].IPAddress" 2^>NUL`) do set "LAN=%%i"
if defined SMRUTI_HOST set "LAN=%SMRUTI_HOST%"

if not defined LAN (
  echo.
  echo Could not work out this machine's network address.
  echo Set it by hand:   set SMRUTI_HOST=192.168.1.23 ^&^& start.bat
  echo.
  pause
  exit /b 1
)

echo ================================================================
echo   SMRUTI
echo ================================================================
if "%MOCK%"=="1" (
  echo   this machine : %LAN%
  echo   mode         : offline ^(no NVIDIA calls^)
) else (
  echo   this machine : %LAN%
  echo   mode         : live
)
echo.

rem --- clear anything still holding the ports --------------------------------
call :freeport 8787
call :freeport 8081
call :freeport 8090

rem --- API server ------------------------------------------------------------
echo starting API server...
set "SMRUTI_MOCK=%MOCK%"
start "SMRUTI API" /min /D "%ROOT%server" cmd /c "npx tsx src/index.ts > ..\server.log 2>&1"

for /l %%i in (1,1,60) do (
  curl.exe -s -m 2 -o NUL http://127.0.0.1:8787/api/health >NUL 2>&1
  if not errorlevel 1 goto serverup
  timeout /t 1 /nobreak >NUL
)

echo.
echo The API server did not start. Last lines of server.log:
echo ----------------------------------------------------------------
powershell -NoProfile -Command "if (Test-Path '%ROOT%server.log') { Get-Content '%ROOT%server.log' -Tail 15 }"
echo ----------------------------------------------------------------
call :freeport 8787
pause
exit /b 1

:serverup
echo   API ready on http://%LAN%:8787
echo.

rem --- web mode --------------------------------------------------------------
if "%WEB%"=="1" (
  echo starting the cross-origin-isolated proxy...
  start "SMRUTI web proxy" /min /D "%ROOT%mobile" cmd /c "node web-dev-proxy.js > ..\proxy.log 2>&1"
  echo.
  echo ================================================================
  echo   Open this in Chrome:
  echo.
  echo       http://localhost:8090
  echo.
  echo   NOT http://localhost:8081 -- without the proxy's isolation
  echo   headers every database call hangs forever.
  echo ================================================================
  echo.
  pushd "%ROOT%mobile"
  call npx expo start --web --port 8081
  popd
  echo.
  echo stopping...
  call :freeport 8787
  call :freeport 8090
  exit /b 0
)

rem --- Metro -----------------------------------------------------------------
echo ================================================================
echo   On your phone, open Expo Go and either scan the QR below,
echo   or tap "Enter URL manually" and type:
echo.
echo       exp://%LAN%:8081
echo.
echo   Phone and laptop must be on the SAME network.
echo ================================================================
echo.

set "REACT_NATIVE_PACKAGER_HOSTNAME=%LAN%"
pushd "%ROOT%mobile"
call npx expo start --lan --port 8081
popd

rem Metro has exited (Ctrl-C or 'q'); take the server down with it.
echo.
echo stopping...
call :freeport 8787
exit /b 0

rem ---------------------------------------------------------------------------
:freeport
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort %~1 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >NUL 2>&1
exit /b 0

:usage
echo.
echo   start.bat            phone and laptop on the same Wi-Fi (or your hotspot)
echo   start.bat --mock     same, but no NVIDIA calls at all (offline demo)
echo   start.bat --web      no phone at all -- open the app in Chrome instead
echo.
echo   Metro runs in this window, so the QR code appears here.
echo   Ctrl-C stops both the app and the API server.
echo.
exit /b 0

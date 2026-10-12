@echo off
setlocal EnableExtensions
title JGasFlow launcher
cd /d "%~dp0"

set "ROOT=%~dp0"
set "BACKEND=%ROOT%jgasflowlite-backend"
set "FRONTEND=%ROOT%jgasflowlite-frontend"
set "APP_URL=http://localhost:5002"
set "XAMPP=C:\xampp"

echo.
echo  =============================================
echo     JGasFlow - starting backend + frontend
echo  =============================================
echo.

where node >nul 2>&1 || (
  echo  [X] Node.js is not installed or not on PATH. Install it from https://nodejs.org
  pause
  exit /b 1
)

rem ---- 1. MySQL (XAMPP) -------------------------------------------------------
call :listening 3306
if errorlevel 1 (
  if exist "%XAMPP%\mysql\bin\mysqld.exe" (
    echo  [..] Starting MySQL from XAMPP...
    start "JGasFlow MySQL" /min /D "%XAMPP%" "%XAMPP%\mysql\bin\mysqld.exe" --defaults-file="%XAMPP%\mysql\bin\my.ini" --standalone
    call :wait 3306 30 MySQL || goto :fail
  ) else (
    echo  [!] MySQL is not running and XAMPP was not found at %XAMPP%.
    echo      Start your MySQL server, then run this file again.
    pause
    exit /b 1
  )
) else (
  echo  [OK] MySQL already running
)

rem ---- 1b. Database (created once; tables are made by the API on start) -------
if exist "%XAMPP%\mysql\bin\mysql.exe" (
  "%XAMPP%\mysql\bin\mysql.exe" -uroot --host=127.0.0.1 -e "CREATE DATABASE IF NOT EXISTS jgasflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" >nul 2>&1
)

rem ---- 2. Dependencies (first run only) ---------------------------------------
if not exist "%BACKEND%\node_modules" (
  echo  [..] Installing backend packages - first run only...
  pushd "%BACKEND%" && call npm install --no-audit --no-fund && popd
)
if not exist "%FRONTEND%\node_modules" (
  echo  [..] Installing frontend packages - first run only...
  pushd "%FRONTEND%" && call npm install --no-audit --no-fund && popd
)
if not exist "%BACKEND%\.env" (
  echo  [!] jgasflowlite-backend\.env is missing. Copying .env.example - review DB settings.
  copy /y "%BACKEND%\.env.example" "%BACKEND%\.env" >nul
  echo  [!] Put a long random value in TOKEN_SECRET inside jgasflowlite-backend\.env
)

rem ---- 3. Backend API (port 5000) ---------------------------------------------
call :listening 5000
if errorlevel 1 (
  echo  [..] Starting backend API...
  start "JGasFlow API" /D "%BACKEND%" cmd /k npm run start:dev
) else (
  echo  [OK] Backend already running
)

rem ---- 4. Frontend (port 5002) ------------------------------------------------
call :listening 5002
if errorlevel 1 (
  echo  [..] Starting frontend...
  start "JGasFlow Frontend" /D "%FRONTEND%" cmd /k npm run dev
) else (
  echo  [OK] Frontend already running
)

call :wait 5000 120 "Backend API" || goto :fail
call :wait 5002 60 Frontend || goto :fail

rem ---- 5. Open the app ---------------------------------------------------------
echo.
echo  [OK] JGasFlow is ready: %APP_URL%
start "" "%APP_URL%"
echo.
echo  Close the "JGasFlow API" and "JGasFlow Frontend" windows to stop.
timeout /t 5 >nul
exit /b 0

rem ============================================================================
:listening
rem errorlevel 0 when something listens on port %1
netstat -ano | findstr /r /c:":%~1 .*LISTENING" >nul
exit /b %errorlevel%

:wait
rem :wait <port> <seconds> <label>
set /a "_left=%~2"
echo  [..] Waiting for %~3 on port %~1...
:wait_loop
call :listening %~1
if not errorlevel 1 (
  echo  [OK] %~3 is up
  exit /b 0
)
if %_left% LEQ 0 (
  echo  [X] %~3 did not start within %~2 seconds. Check its window for errors.
  exit /b 1
)
set /a "_left-=1"
timeout /t 1 /nobreak >nul
goto :wait_loop

:fail
echo.
pause
exit /b 1

@echo off
setlocal enabledelayedexpansion
title ERP App - Production Server
color 0A

echo ============================================================
echo   ERP App - Production Server
echo ============================================================
echo.

:: ── Step 0: Kill any existing Next.js server ─────────────────
echo [0/5] Stopping any existing server...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 "') do (
    if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3001 "') do (
    if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul
echo    Done.
echo.

:: ── Step 1: Pull latest code ──────────────────────────────────
cd /d "C:\Users\Ahsan\OneDrive - Syed Contracting LLC\Documents\ERP-APP"

echo [1/5] Pulling latest code from main...
for /f %%i in ('git rev-parse HEAD') do set BEFORE_HASH=%%i
git pull origin main
if %errorlevel% neq 0 (
    echo WARNING: git pull failed. Running on existing code.
)
for /f %%i in ('git rev-parse HEAD') do set AFTER_HASH=%%i
echo.

:: ── Step 2: Install dependencies ─────────────────────────────
cd erp-app

echo [2/5] Checking dependencies...
call npm install --prefer-offline
if %errorlevel% neq 0 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
)
echo.

:: ── Step 3: Regenerate Prisma client ─────────────────────────
echo [3/5] Syncing Prisma client...
call npx prisma generate >nul 2>&1
echo    Done.
echo.

:: ── Step 4: Build only if code changed or no build exists ─────
echo [4/5] Checking if build is up to date...

set BUILD_HASH_FILE=.next\last-build-hash.txt
set NEEDS_BUILD=0

:: No .next folder = first run, must build
if not exist ".next" set NEEDS_BUILD=1

:: No hash file = build is stale
if not exist "%BUILD_HASH_FILE%" set NEEDS_BUILD=1

:: New commits were pulled = must rebuild
if not "%BEFORE_HASH%"=="%AFTER_HASH%" set NEEDS_BUILD=1

if "%NEEDS_BUILD%"=="0" (
    :: Double-check: compare stored hash with current HEAD
    set /p STORED_HASH=<"%BUILD_HASH_FILE%"
    if not "!STORED_HASH!"=="%AFTER_HASH%" set NEEDS_BUILD=1
)

if "%NEEDS_BUILD%"=="1" (
    echo    Code changed — building optimised bundle...
    echo    (takes ~30-60s once, then skipped until next update^)
    echo.
    call npm run build
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: Build failed. Check errors above.
        pause
        exit /b 1
    )
    :: Save current commit hash so next launch skips the build
    echo %AFTER_HASH%> "%BUILD_HASH_FILE%"
    echo.
) else (
    echo    Build is current — skipping rebuild. Starting instantly.
    echo.
)

:: ── Step 5: Start production server ──────────────────────────
echo [5/5] Starting server...
echo.
echo ============================================================
echo   App running at: http://localhost:3000
echo   Press Ctrl+C to stop
echo ============================================================
echo.

call npm run start

echo.
echo Server stopped.
pause

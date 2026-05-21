@echo off
title ERP App - Production Server
color 0A

echo ============================================================
echo   ERP App - Production Server (fast load)
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
git pull origin main
if %errorlevel% neq 0 (
    echo WARNING: git pull failed. Running on existing code.
)
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
call npx prisma generate
if %errorlevel% neq 0 (
    echo WARNING: prisma generate failed. Continuing anyway...
)
echo.

:: ── Step 4: Build for production ─────────────────────────────
echo [4/5] Building optimised production bundle...
echo       (this takes ~30-60 seconds, only runs when code changes)
echo.
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Build failed. Check the errors above.
    pause
    exit /b 1
)
echo.

:: ── Step 5: Start production server ──────────────────────────
echo [5/5] Starting production server...
echo.
echo ============================================================
echo   App running at: http://localhost:3000
echo   Pages load instantly in production mode
echo   Press Ctrl+C to stop the server
echo ============================================================
echo.

call npm run start

echo.
echo Server stopped.
pause

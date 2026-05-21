@echo off
title ERP App - Dev Server
color 0A

echo ============================================================
echo   ERP App - Local Development Server
echo ============================================================
echo.

:: Navigate to repo root
cd /d "C:\Users\Ahsan\OneDrive - Syed Contracting LLC\ERP-APP"

:: Pull latest code
echo [1/4] Pulling latest code from main...
git pull origin main
if %errorlevel% neq 0 (
    echo WARNING: git pull failed. Running on existing code.
    echo.
)

:: Navigate to app directory
cd erp-app

:: Install / update dependencies if package.json changed
echo.
echo [2/4] Checking dependencies...
call npm install --prefer-offline
if %errorlevel% neq 0 (
    echo ERROR: npm install failed. Check your connection and try again.
    pause
    exit /b 1
)

:: Regenerate Prisma client in case schema changed
echo.
echo [3/4] Syncing Prisma client...
call npx prisma generate
if %errorlevel% neq 0 (
    echo WARNING: prisma generate failed. Continuing anyway...
)

:: Start dev server
echo.
echo [4/4] Starting Next.js dev server...
echo.
echo ============================================================
echo   App running at: http://localhost:3000
echo   Press Ctrl+C to stop the server
echo ============================================================
echo.
call npm run dev

:: Keep window open if server exits unexpectedly
echo.
echo Server stopped.
pause

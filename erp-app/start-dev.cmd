@echo off
cd /d "C:\Users\Ahsan\OneDrive - Syed Contracting LLC\Documents\ERP-APP\erp-app"

REM Touch all route files so Turbopack registers them after a cache clear
for /r "src\app\api" %%f in (route.ts) do copy /b "%%f" +,, >nul 2>&1

"C:\Program Files\nodejs\node.exe" node_modules\next\dist\bin\next dev

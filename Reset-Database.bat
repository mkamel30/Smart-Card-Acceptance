@echo off
title Card Settlement System - Factory Reset
color 4f
cls
echo ========================================================
echo        Card Settlement System - Factory Reset
echo ========================================================
echo.
echo [DANGER] This will DELETE ALL DATA permanently!
echo          - All Settlements and Transactions
echo          - All Uploaded Receipt Images
echo.
echo This cannot be undone.
echo.
echo Press CTRL+C to Cancel, or any key to PROCEED with DELETION.
pause

cd backend

echo.
echo [1/2] Resetting Database...
call npx prisma migrate reset --force
if %errorlevel% neq 0 (
    echo [ERROR] Failed to reset database.
    pause
    exit
)

echo.
echo [2/2] Deleting Uploaded Images...
if exist "uploads" (
    del /q "uploads\*.*"
    for /d %%x in ("uploads\*") do @rd /s /q "%%x"
    echo [OK] Uploads folder cleared.
)

echo.
echo ========================================================
echo        System Reset Complete (Factory Settings)
echo ========================================================
pause

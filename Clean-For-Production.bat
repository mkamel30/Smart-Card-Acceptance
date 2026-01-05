@echo off
title Card Settlement System - Cleanup Tool
color 0e
cls
echo ========================================================
echo        Card Settlement System - Cleanup
echo ========================================================
echo.
echo [INFO] This script will reduce project size for production.
echo [INFO] It deletes 'frontend/node_modules' (Development Tools).
echo.
echo [WARNING] If you want to EDIT the frontend code later, 
echo           you will need to run 'npm install' again inside frontend.
echo.
echo Press any key to continue cleanup...
pause >nul

echo.
echo [1/2] Cleaning Frontend dependencies...
if exist "frontend\node_modules" (
    rmdir /s /q "frontend\node_modules"
    echo [OK] Deleted frontend/node_modules.
) else (
    echo [INFO] Already clean.
)

echo.
echo [2/2] Cleaning Cache...
if exist "frontend\.vite" (
    rmdir /s /q "frontend\.vite"
)

echo.
echo [3/3] Optimizing Backend dependencies...
if exist "backend\node_modules" (
    cd backend
    call npm prune --production
    cd ..
    echo [OK] Removed development dependencies from Backend.
)

echo.
echo ========================================================
echo        Cleanup Complete!
echo ========================================================
echo [TIP] Now the project size should be much smaller.
echo [TIP] Backend kept ONLY necessary files to run the server.
echo.
pause

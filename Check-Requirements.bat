@echo off
title Checking System Requirements
color 0f
cls
echo ========================================================
echo        Checking System Prerequisites
echo ========================================================
echo.

:CHECK_NODE
echo [1/2] Checking for Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0c
    echo [ERROR] Node.js is NOT installed!
    echo.
    echo This program requires Node.js to run.
    echo Please download and install the "LTS" version from:
    echo https://nodejs.org/
    echo.
    echo After installing, restart this script.
    pause
    exit
) else (
    echo [OK] Node.js is installed.
)

:CHECK_MODULES
echo [2/2] Checking project dependencies...
if exist "backend\node_modules" (
    echo [OK] Backend dependencies found.
) else (
    echo [WARNING] Dependencies missing. Installing now (this may take a minute)...
    cd backend
    call npm install
    cd ..
    echo [OK] Dependencies installed.
)

echo.
echo ========================================================
echo        All Systems Ready!
echo ========================================================
echo.
echo You can now run "Start-System.bat".
echo.
pause

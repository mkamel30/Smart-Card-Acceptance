@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
title Card Settlement System - Setup

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║     Card Settlement System - Setup Wizard                ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"
set "PROJECT_DIR=%~dp0"

:: ============================================================
:: Step 1: Check Python
:: ============================================================
echo  [Step 1/5] Checking Python installation...

where python >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VER=%%i
    echo            ✓ Python !PYTHON_VER! found
) else (
    if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python311\Scripts;%PATH%"
        echo            ✓ Python found, added to PATH
    ) else if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\Python\Python310;%LOCALAPPDATA%\Programs\Python\Python310\Scripts;%PATH%"
        echo            ✓ Python found, added to PATH
    ) else (
        echo            ✗ Python not found!
        echo.
        echo  Python is required for OCR. Please install from:
        echo  https://www.python.org/downloads/
        echo.
        choice /c YN /m "Open Python download page? (Y/N)"
        if !errorlevel! equ 1 start https://www.python.org/downloads/
        pause
        exit /b 1
    )
)

:: ============================================================
:: Step 2: Check Node.js
:: ============================================================
echo  [Step 2/5] Checking Node.js installation...

where node >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=1" %%i in ('node --version 2^>^&1') do set NODE_VER=%%i
    echo            ✓ Node.js !NODE_VER! found
) else (
    echo            ✗ Node.js not found!
    echo.
    echo  Node.js is required. Please install from:
    echo  https://nodejs.org/
    echo.
    choice /c YN /m "Open Node.js download page? (Y/N)"
    if !errorlevel! equ 1 start https://nodejs.org/
    pause
    exit /b 1
)

:: ============================================================
:: Step 3: Install Python OCR dependencies
:: ============================================================
echo  [Step 3/5] Installing Python OCR dependencies...
echo            (First run may take a few minutes to download models)

cd "%PROJECT_DIR%ocr-service"
pip install -r requirements.txt -q 2>nul
if %errorlevel% neq 0 (
    pip install -r requirements.txt --user -q 2>nul
)
echo            ✓ Python dependencies ready
cd "%PROJECT_DIR%"

:: ============================================================
:: Step 4: Install Node.js dependencies
:: ============================================================
echo  [Step 4/5] Installing Node.js dependencies...

cd "%PROJECT_DIR%backend"
if not exist "node_modules" (
    call npm install --silent 2>nul
)
echo            Running Prisma generate...
call npx prisma generate --schema=prisma/schema.prisma 2>nul
echo            ✓ Backend ready
cd "%PROJECT_DIR%"

cd "%PROJECT_DIR%frontend"
if not exist "node_modules" (
    call npm install --silent 2>nul
)
echo            ✓ Frontend ready
cd "%PROJECT_DIR%"

:: ============================================================
:: Step 5: Start all services
:: ============================================================
echo  [Step 5/5] Starting all services...
echo.

start "OCR-Service" /min cmd /k "cd /d "%PROJECT_DIR%ocr-service" && python main.py"
timeout /t 5 /nobreak >nul

start "Backend" /min cmd /k "cd /d "%PROJECT_DIR%backend" && npm run dev"
timeout /t 3 /nobreak >nul

start "Frontend" /min cmd /k "cd /d "%PROJECT_DIR%frontend" && npm run dev"
timeout /t 3 /nobreak >nul

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║                    Setup Complete!                       ║
echo  ╠══════════════════════════════════════════════════════════╣
echo  ║                                                          ║
echo  ║   OCR Service:   http://localhost:5000                   ║
echo  ║   Backend API:   http://localhost:3000                   ║
echo  ║   Frontend:      http://localhost:5173                   ║
echo  ║                                                          ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.

timeout /t 2 /nobreak >nul
start http://localhost:5173

echo  Press any key to exit (services will keep running)...
pause >nul

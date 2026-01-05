@echo off
title Card Settlement System Server
color 0f
cls
echo ========================================================
echo        Card Settlement System - Server Startup
echo ========================================================
echo.
echo [INFO] Starting Database and Web Server...
echo.
echo [TIP]  After the server starts, open your browser and go to:
echo        Local:   http://localhost:3000
echo        Network: http://YOUR_PC_IP:3000
echo.

cd backend
call npm start

pause

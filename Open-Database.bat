@echo off
title Card Settlement System - Database Manager
color 0e
cls
echo ========================================================
echo        Card Settlement System - Database Manager
echo ========================================================
echo.
echo [INFO] Opening Database Inspector (Prisma Studio)...
echo [TIP]  This will open a dashboard in your browser to view/edit data.
echo.

cd backend
call npx prisma studio

pause

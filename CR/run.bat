@echo off
echo Starting Car Rental App...

echo Starting Backend...
cd /d D:\cr\backend
start cmd /k "cd /d D:\cr\backend && C:\apache-maven-3.9.9\bin\mvn.cmd clean spring-boot:run"

echo Waiting for backend to start...
timeout /t 15 >nul

echo Starting Frontend...
cd /d D:\cr\frontend
start cmd /k "cd /d D:\cr\frontend && npm run dev"

echo Waiting for frontend to start...
timeout /t 8 >nul

echo Opening browser...
start "" "http://localhost:5173"

echo Both servers started! You can close this window.
pause

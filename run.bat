@echo off
echo Starting Car Rental App...

echo Starting Backend...
start cmd /k "cd /d D:\cr\backend && "C:\apache-maven-3.9.9\bin\mvn.cmd" spring-boot:run"

timeout /t 5 >nul

echo Starting Frontend...
start cmd /k "cd /d D:\cr\frontend && npm run dev"

echo Both servers started!

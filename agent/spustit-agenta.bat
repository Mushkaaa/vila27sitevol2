@echo off
title Vila 27 - tlac objednavok
cd /d "%~dp0"
:loop
node print-agent.js
echo.
echo Agent sa ukoncil. Restartujem o 5 sekund... (zavri okno pre ukoncenie)
timeout /t 5 >nul
goto loop

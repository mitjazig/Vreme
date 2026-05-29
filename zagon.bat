@echo off
title Vreme Koper PWA
cd /d "%~dp0"
echo.
echo  Vreme Koper - lokalni streznik
echo  ==============================
echo.
echo  Ne zapirajte tega okna med uporabo aplikacije!
echo.
npx --yes serve -l 3456 .
pause

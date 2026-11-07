@echo off
chcp 65001 >nul
title Panel de control - APOKELIPSIS SMP
cd /d "%~dp0"

call "panel\preparar-node.cmd"
if errorlevel 1 exit /b 1

echo.
echo Abriendo el panel de control...
"herramientas\node\node.exe" "panel\servidor.js"
if errorlevel 1 (
  echo.
  echo El panel se cerro con un error. Copia el mensaje de arriba y pasaselo a Claude.
  pause
)

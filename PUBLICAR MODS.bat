@echo off
chcp 65001 >nul
title Publicar mods - APOKELIPSIS SMP
cd /d "%~dp0"

if not exist "generate-manifest.js" (
  echo.
  echo ERROR: no encuentro generate-manifest.js.
  echo Este archivo tiene que estar dentro de la carpeta del repositorio, junto a la carpeta "mods".
  echo.
  pause
  exit /b 1
)

call "panel\preparar-node.cmd"
if errorlevel 1 exit /b 1

echo.
echo Generando la lista de mods...
echo.
"herramientas\node\node.exe" generate-manifest.js
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)

echo.
echo ================================================================
echo  Listo. Ahora abre GitHub Desktop:
echo   1. Abajo a la izquierda escribe un nombre, por ejemplo: mods
echo   2. Toca el boton azul "Commit to main"
echo   3. Arriba toca "Push origin" y espera a que termine
echo  Los jugadores reciben los cambios la proxima vez que abren el launcher.
echo ================================================================
echo.
if /i not "%1"=="/nopause" pause
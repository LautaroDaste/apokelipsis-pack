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

if not exist "herramientas\node\node.exe" (
  echo Preparando la herramienta para generar la lista ^(solo la primera vez, puede tardar un minuto^)...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; $z=Join-Path $env:TEMP 'node-apk.zip'; Invoke-WebRequest 'https://nodejs.org/dist/v22.11.0/node-v22.11.0-win-x64.zip' -OutFile $z; $d=Join-Path $env:TEMP 'node-apk'; Expand-Archive $z $d -Force; New-Item -ItemType Directory -Force 'herramientas\node' | Out-Null; Copy-Item (Join-Path $d 'node-v22.11.0-win-x64\node.exe') 'herramientas\node\node.exe'; Remove-Item $z, $d -Recurse -Force"
  if not exist "herramientas\node\node.exe" (
    echo.
    echo ERROR: no se pudo descargar la herramienta. Revisa tu conexion a internet y vuelve a intentar.
    pause
    exit /b 1
  )
)

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
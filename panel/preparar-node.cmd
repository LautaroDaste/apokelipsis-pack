@echo off
rem Prepara herramientas\node\node.exe (lo usan "PUBLICAR MODS.bat" y "PANEL DE CONTROL.bat").
rem Se llama desde la carpeta del repositorio.

rem Version de Node y su huella SHA-256 oficial (https://nodejs.org/dist/v22.23.4/SHASUMS256.txt).
rem Si el archivo descargado no coincide, no se usa.
set "NODE_VER=v22.23.4"
set "NODE_SHA256=cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20"
set "NEED_NODE=1"
if exist "herramientas\node\node.exe" (
  for /f "delims=" %%v in ('"herramientas\node\node.exe" --version 2^>nul') do if "%%v"=="%NODE_VER%" set "NEED_NODE="
)

if defined NEED_NODE (
  echo Preparando la herramienta ^(solo una vez, puede tardar un minuto^)...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $v=$env:NODE_VER; $tmp=Join-Path $env:TEMP ('node-apk-'+[guid]::NewGuid()); New-Item -ItemType Directory $tmp | Out-Null; try { $z=Join-Path $tmp 'node.zip'; Invoke-WebRequest ('https://nodejs.org/dist/'+$v+'/node-'+$v+'-win-x64.zip') -OutFile $z -UseBasicParsing; if ((Get-FileHash $z -Algorithm SHA256).Hash -ne $env:NODE_SHA256) { throw 'la descarga de Node no coincide con la huella oficial' }; Expand-Archive $z (Join-Path $tmp 'x'); New-Item -ItemType Directory -Force 'herramientas\node' | Out-Null; Copy-Item (Join-Path $tmp ('x\node-'+$v+'-win-x64\node.exe')) 'herramientas\node\node.exe' -Force } catch { Write-Host ('ERROR: '+$_); exit 1 } finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }"
  if errorlevel 1 (
    echo.
    echo ERROR: no se pudo preparar la herramienta. Revisa tu conexion a internet y vuelve a intentar.
    pause
    exit /b 1
  )
  if not exist "herramientas\node\node.exe" (
    echo.
    echo ERROR: no se pudo descargar la herramienta. Revisa tu conexion a internet y vuelve a intentar.
    pause
    exit /b 1
  )
)
exit /b 0

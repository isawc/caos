@echo off
cd /d "%~dp0"

set "CODEX_NODE=C:\Users\Desktop\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

where node >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:3000
  node server.js
  exit /b
)

if exist "%CODEX_NODE%" (
  start "" http://localhost:3000
  "%CODEX_NODE%" server.js
  exit /b
)

echo Node.js nao foi encontrado.
echo Instale o Node.js ou rode pelo ambiente do Codex.
pause

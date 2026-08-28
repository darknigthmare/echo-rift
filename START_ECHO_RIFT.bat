@echo off
setlocal
cd /d "%~dp0"
title ECHO RIFT
where node >nul 2>nul
if %errorlevel%==0 (
  node local-server.js
  goto :eof
)
where py >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:8765/"
  py -m http.server 8765 --bind 127.0.0.1
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:8765/"
  python -m http.server 8765 --bind 127.0.0.1
  goto :eof
)
echo Node.js et Python ne sont pas installes. Ouverture de la version autonome.
start "" "JOUER_ECHO_RIFT.html"

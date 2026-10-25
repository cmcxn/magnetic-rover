@echo off
setlocal
cd /d "%~dp0"
set "SKYNET_ROOT=./runtime/"
set "ROVER_SERVER=./server/"
set "ROVER_CLIENT=./client/dist"
if not defined ROVER_BIND set "ROVER_BIND=0.0.0.0"
if not defined ROVER_BASE_SPEED set "ROVER_BASE_SPEED=480"
set "SSL_CERT_FILE=%~dp0runtime\certs\ca-bundle.crt"
set "SSL_CERT_DIR=%~dp0runtime\certs"
echo Magnetic Rover - Windows x64
echo Open http://127.0.0.1:18080 in your browser after the server starts.
echo LAN players: use this PC's IPv4 address on port 18080.
echo Keep this window open. Press Ctrl+C to stop the server.
echo.
runtime\skynet.exe server/config
set "result=%errorlevel%"
if not "%result%"=="0" (
  echo Server exited with code %result%. Check whether port 18080 is in use.
  pause
)
exit /b %result%

@echo off
REM Uso: regen-certs.bat 192.168.0.17
REM Poi: docker restart rapportini-nginx

if "%~1"=="" (
  echo Passa l'IP LAN: regen-certs.bat 192.168.0.17
  exit /b 1
)

set "OPENSSL=C:\Program Files\Git\usr\bin\openssl.exe"
if not exist "%OPENSSL%" set "OPENSSL=openssl"

if not exist "%~dp0certs" mkdir "%~dp0certs"

set MSYS_NO_PATHCONV=1
"%OPENSSL%" req -x509 -newkey rsa:2048 -nodes -days 365 -keyout "%~dp0certs\key.pem" -out "%~dp0certs\cert.pem" -subj "/CN=rapportini" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:%~1"
if errorlevel 1 exit /b 1

echo Certificato generato per: localhost, 127.0.0.1, %~1
echo Riavvia nginx: docker restart rapportini-nginx

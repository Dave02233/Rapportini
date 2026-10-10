@echo off
REM Genera un JWT_SECRET_KEY da mettere in .env
REM Uso: regen-jwt.bat

python -c "import secrets; print(secrets.token_urlsafe(64))"

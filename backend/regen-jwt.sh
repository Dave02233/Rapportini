#!/bin/sh
# Genera un JWT_SECRET_KEY da mettere in .env
# Uso: ./regen-jwt.sh

python3 -c "import secrets; print(secrets.token_urlsafe(64))"

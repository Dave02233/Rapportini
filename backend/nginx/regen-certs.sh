#!/bin/sh
# Uso: ./regen-certs.sh 192.168.0.17
# Poi: docker restart rapportini-nginx

set -e
IP="$1"
if [ -z "$IP" ]; then
  echo "Passa l'IP LAN: ./regen-certs.sh 192.168.0.17"
  exit 1
fi

DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
mkdir -p "$DIR/certs"

openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout "$DIR/certs/key.pem" \
  -out "$DIR/certs/cert.pem" \
  -subj "/CN=rapportini" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$IP"

echo "Certificato generato per: localhost, 127.0.0.1, $IP"
echo "Riavvia nginx: docker restart rapportini-nginx"

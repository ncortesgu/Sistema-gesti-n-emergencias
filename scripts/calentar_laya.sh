#!/usr/bin/env sh
set -eu

URL="${1:-http://127.0.0.1:8000}"
echo "Cargando el modelo de Laya en $URL. La primera vez puede tardar varios minutos..."
curl -fsS -X POST "$URL/calentar"
echo

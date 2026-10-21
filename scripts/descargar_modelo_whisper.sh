#!/usr/bin/env sh
set -eu

MODELO="${1:-small}"
DESTINO="${2:-./modelos-whisper}"
mkdir -p "$DESTINO"
DESTINO="$(cd "$DESTINO" && pwd)"

echo "Descargando ggml-$MODELO.bin en $DESTINO ..."
docker run --rm -v "$DESTINO:/models" ghcr.io/ggml-org/whisper.cpp:main \
    /app/models/download-ggml-model.sh "$MODELO" /models
echo "Listo."

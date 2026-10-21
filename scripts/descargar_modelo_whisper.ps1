param(
    [string]$Modelo = "small",
    [string]$Destino = "$PSScriptRoot\..\modelos-whisper"
)

$ruta = [System.IO.Path]::GetFullPath($Destino)
New-Item -ItemType Directory -Force -Path $ruta | Out-Null
Write-Host "Descargando ggml-$Modelo.bin en $ruta ..."
docker run --rm -v "${ruta}:/models" ghcr.io/ggml-org/whisper.cpp:main /app/models/download-ggml-model.sh $Modelo /models
if ($LASTEXITCODE -ne 0) {
    Write-Error "Falló la descarga del modelo Whisper."
    exit $LASTEXITCODE
}
Write-Host "Listo."

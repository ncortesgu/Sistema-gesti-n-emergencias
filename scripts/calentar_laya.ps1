param(
    [string]$Url = "http://127.0.0.1:8000"
)

Write-Host "Cargando el modelo de Laya en $Url. La primera vez puede tardar varios minutos..."
try {
    $respuesta = Invoke-RestMethod -Method Post -Uri "$Url/calentar" -TimeoutSec 1200
    $respuesta | ConvertTo-Json -Depth 5
}
catch {
    Write-Error "No se pudo calentar Laya: $($_.Exception.Message)"
    exit 1
}

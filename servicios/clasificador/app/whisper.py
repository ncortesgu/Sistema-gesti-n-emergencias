from __future__ import annotations

import httpx

from .config import Configuracion


class ErrorWhisper(RuntimeError):
    """Fallo al comunicarse con whisper.cpp."""


class ClienteWhisper:
    def __init__(self, configuracion: Configuracion) -> None:
        self.configuracion = configuracion

    async def transcribir(
        self,
        nombre: str,
        contenido: bytes,
        tipo_contenido: str | None = None,
    ) -> tuple[str, int | None]:
        archivos = {
            "file": (
                nombre or "audio.wav",
                contenido,
                tipo_contenido or "audio/wav",
            )
        }
        datos = {
            "language": self.configuracion.whisper_idioma,
            "response_format": "json",
            "temperature": "0.0",
        }
        url = f"{self.configuracion.whisper_url}/inference"
        try:
            async with httpx.AsyncClient(timeout=self.configuracion.timeout_whisper) as cliente:
                respuesta = await cliente.post(url, files=archivos, data=datos)
        except httpx.HTTPError as exc:
            raise ErrorWhisper(
                f"No se pudo contactar a whisper.cpp en {url}: {exc}"
            ) from exc

        if respuesta.status_code != 200:
            detalle = respuesta.text[:400].strip()
            raise ErrorWhisper(
                f"whisper.cpp respondió {respuesta.status_code}: {detalle or 'sin detalle'}"
            )

        try:
            resultado = respuesta.json()
        except ValueError as exc:
            raise ErrorWhisper("whisper.cpp devolvió una respuesta que no es JSON.") from exc

        texto = str(resultado.get("text") or "").strip()
        if not texto:
            raise ErrorWhisper(
                "No se detectó voz en el audio. Verifica el archivo o vuelve a grabar."
            )

        duracion_ms: int | None = None
        segmentos = resultado.get("segments")
        if isinstance(segmentos, list) and segmentos:
            ultimo = segmentos[-1]
            if isinstance(ultimo, dict) and isinstance(ultimo.get("end"), (int, float)):
                duracion_ms = int(float(ultimo["end"]) * 1000)

        return texto, duracion_ms

    async def salud(self) -> bool:
        url = f"{self.configuracion.whisper_url}/"
        try:
            async with httpx.AsyncClient(timeout=3.0) as cliente:
                respuesta = await cliente.get(url)
            return respuesta.status_code < 500
        except httpx.HTTPError:
            return False

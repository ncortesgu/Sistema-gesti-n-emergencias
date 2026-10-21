from __future__ import annotations

import time

import httpx

from ..config import Configuracion
from ..decisiones import Decisiones, ErrorProveedor, interpretar_respuestas
from ..prompts import construir_estado, construir_preguntas


class ProveedorJev:
    """Clasificación remota con Jev a través de OpenRouter (Decisions API)."""

    def __init__(self, configuracion: Configuracion) -> None:
        self.configuracion = configuracion

    def clasificar(self, texto: str) -> Decisiones:
        if not self.configuracion.openrouter_api_key:
            raise ErrorProveedor(
                "Falta OPENROUTER_API_KEY para usar Jev. Configúrala en el archivo .env."
            )

        carga = {
            "model": self.configuracion.jev_modelo,
            "state": construir_estado(texto),
            "questions": construir_preguntas(incluir_criterios_noul=True),
        }
        cabeceras = {
            "Authorization": f"Bearer {self.configuracion.openrouter_api_key}",
            "Content-Type": "application/json",
            "X-Title": "Sistema Gestion Emergencias",
        }
        tiempo = httpx.Timeout(self.configuracion.timeout_llm)

        respuesta: httpx.Response | None = None
        with httpx.Client(timeout=tiempo) as cliente:
            for intento in range(2):
                try:
                    respuesta = cliente.post(
                        self.configuracion.openrouter_url,
                        json=carga,
                        headers=cabeceras,
                    )
                except httpx.HTTPError as exc:
                    raise ErrorProveedor(f"No se pudo contactar a OpenRouter: {exc}") from exc

                if respuesta.status_code in {429, 500, 502, 503, 524, 529} and intento == 0:
                    time.sleep(1.0)
                    continue
                break

        if respuesta is None:
            raise ErrorProveedor("OpenRouter no devolvió respuesta.")
        if respuesta.status_code != 200:
            detalle = respuesta.text[:400].strip()
            raise ErrorProveedor(
                f"OpenRouter respondió {respuesta.status_code}: {detalle or 'sin detalle'}"
            )

        try:
            datos = respuesta.json()
        except ValueError as exc:
            raise ErrorProveedor("OpenRouter devolvió una respuesta que no es JSON.") from exc

        respuestas = datos.get("answers")
        if not isinstance(respuestas, dict):
            raise ErrorProveedor("La respuesta de Jev no contiene 'answers'.")

        return interpretar_respuestas(
            respuestas,
            proveedor="jev",
            modelo=str(datos.get("model") or self.configuracion.jev_modelo),
            umbral_apoyo=self.configuracion.umbral_apoyo,
        )

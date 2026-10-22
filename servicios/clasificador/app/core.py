from __future__ import annotations

from typing import Any

import httpx


class ErrorCore(RuntimeError):
    def __init__(self, codigo: int, detalle: str) -> None:
        super().__init__(detalle)
        self.codigo = codigo
        self.detalle = detalle


class ClienteCore:
    """Cliente HTTP hacia el servidor C++ que posee colas y recursos reales."""

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    async def _solicitar(
        self,
        metodo: str,
        ruta: str,
        *,
        json: Any | None = None,
        params: dict[str, Any] | None = None,
        timeout: float = 20.0,
    ) -> Any:
        url = f"{self.base_url}{ruta}"
        try:
            async with httpx.AsyncClient(timeout=timeout) as cliente:
                respuesta = await cliente.request(
                    metodo,
                    url,
                    json=json,
                    params=params,
                )
        except httpx.HTTPError as exc:
            raise ErrorCore(
                503,
                f"No se pudo conectar con el motor C++ en {url}: {exc}",
            ) from exc

        if respuesta.status_code >= 400:
            detalle = respuesta.text[:400].strip()
            try:
                datos = respuesta.json()
                if isinstance(datos, dict) and isinstance(datos.get("detail"), str):
                    detalle = datos["detail"]
            except ValueError:
                pass
            raise ErrorCore(
                respuesta.status_code,
                detalle or f"El motor C++ respondió {respuesta.status_code}.",
            )

        if not respuesta.content:
            return {}
        try:
            return respuesta.json()
        except ValueError as exc:
            raise ErrorCore(502, "El motor C++ devolvió una respuesta no JSON.") from exc

    async def salud(self) -> bool:
        try:
            await self._solicitar("GET", "/api/salud", timeout=3.0)
            return True
        except ErrorCore:
            return False

    async def listar_colas(self) -> list[dict]:
        datos = await self._solicitar("GET", "/api/colas")
        return datos.get("emergencias", []) if isinstance(datos, dict) else []

    async def listar_emergencias(
        self,
        estado: str | None = None,
        departamento: str | None = None,
    ) -> list[dict]:
        params = {}
        if estado:
            params["estado"] = estado
        if departamento:
            params["departamento"] = departamento
        datos = await self._solicitar("GET", "/api/emergencias", params=params)
        return datos.get("emergencias", []) if isinstance(datos, dict) else []

    async def obtener_emergencia(self, identificador: str) -> dict:
        return await self._solicitar("GET", f"/api/emergencias/{identificador}")

    async def crear_emergencia(self, datos: dict) -> dict:
        return await self._solicitar("POST", "/api/emergencias", json=datos)

    async def atender_emergencia(
        self,
        identificador: str,
        departamento: str,
        atendida: bool = True,
    ) -> dict:
        return await self._solicitar(
            "POST",
            f"/api/emergencias/{identificador}/atender",
            json={"departamento": departamento, "atendida": atendida},
        )

    async def listar_unidades(self) -> list[dict]:
        datos = await self._solicitar("GET", "/api/unidades")
        return datos.get("unidades", []) if isinstance(datos, dict) else []

    async def registrar_unidad(self, datos: dict) -> dict:
        return await self._solicitar("POST", "/api/unidades", json=datos)

    async def liberar_unidad(self, identificador: str) -> dict:
        return await self._solicitar(
            "POST", f"/api/unidades/{identificador}/liberar"
        )

    async def reiniciar(self) -> dict:
        return await self._solicitar("POST", "/api/operaciones/reiniciar")

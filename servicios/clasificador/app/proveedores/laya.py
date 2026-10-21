from __future__ import annotations

import importlib.util
import threading

from ..config import Configuracion
from ..decisiones import Decisiones, ErrorProveedor, interpretar_respuestas
from ..prompts import construir_estado, construir_preguntas


class ProveedorLaya:
    """Clasificación local con Laya (System One, checkpoint multilingual)."""

    def __init__(self, configuracion: Configuracion) -> None:
        self.configuracion = configuracion
        self._router = None
        self._cargado = False
        self._lock = threading.Lock()
        self._prediccion_lock = threading.Lock()

    @property
    def instalado(self) -> bool:
        return importlib.util.find_spec("laya") is not None

    @property
    def listo(self) -> bool:
        return self._cargado

    def calentar(self) -> None:
        router = self._obtener_router()
        preguntas = construir_preguntas(incluir_criterios_noul=False, conciso=True)
        estado = construir_estado(
            "Esto es una prueba de calentamiento del clasificador.",
            conciso=True,
        )
        try:
            with self._prediccion_lock:
                router.predict(
                    estado,
                    preguntas,
                    model=self.configuracion.laya_modelo,
                    max_len=self.configuracion.laya_max_len,
                )
            self._cargado = True
        except Exception as exc:  # pragma: no cover - requiere pesos/modelo
            raise ErrorProveedor(f"Laya no pudo cargar el modelo: {exc}") from exc

    def _obtener_router(self):
        if self._router is not None:
            return self._router
        with self._lock:
            if self._router is not None:
                return self._router
            if not self.instalado:
                raise ErrorProveedor(
                    "Laya no está instalado en el contenedor. "
                    "Reconstruye con WITH_LAYA=1 o usa PROVEEDOR=jev."
                )
            try:
                from laya import Router

                argumentos: dict = {"max_loaded": 1}
                if self.configuracion.laya_dispositivo:
                    argumentos["device"] = self.configuracion.laya_dispositivo
                self._router = Router(**argumentos)
                return self._router
            except Exception as exc:  # pragma: no cover - depende de torch/modelo
                raise ErrorProveedor(f"No se pudo inicializar Laya: {exc}") from exc

    def clasificar(self, texto: str) -> Decisiones:
        router = self._obtener_router()
        estado = construir_estado(texto, conciso=True)
        preguntas = construir_preguntas(incluir_criterios_noul=False, conciso=True)
        try:
            with self._prediccion_lock:
                resultado = router.predict(
                    estado,
                    preguntas,
                    model=self.configuracion.laya_modelo,
                    max_len=self.configuracion.laya_max_len,
                )
        except Exception as exc:  # pragma: no cover - requiere pesos/modelo
            raise ErrorProveedor(f"Laya falló al clasificar: {exc}") from exc

        if not isinstance(resultado, dict) or "answers" not in resultado:
            raise ErrorProveedor("Laya devolvió una respuesta inesperada.")

        ruteo = resultado.get("routing") or {}
        modelo = ruteo.get("model") or self.configuracion.laya_modelo
        self._cargado = True
        return interpretar_respuestas(
            resultado["answers"],
            proveedor="laya",
            modelo=f"laya-{modelo}",
            umbral_apoyo=self.configuracion.umbral_apoyo,
        )

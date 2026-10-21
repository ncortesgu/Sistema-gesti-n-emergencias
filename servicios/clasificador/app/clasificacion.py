from __future__ import annotations

import time

from .config import Configuracion
from .decisiones import Decisiones, ErrorProveedor, etiqueta_severidad
from .esquemas import RespuestaClasificacion
from .guardarrailes import aplicar_guardarrailes
from .proveedores import ProveedorJev, ProveedorLaya
from .reglas import clasificar_con_reglas

PROVEEDORES_VALIDOS = {"laya", "jev", "reglas"}


class ServicioClasificacion:
    def __init__(self, configuracion: Configuracion) -> None:
        self.configuracion = configuracion
        self.proveedores = {
            "laya": ProveedorLaya(configuracion),
            "jev": ProveedorJev(configuracion),
        }

    def clasificar(
        self,
        texto: str,
        proveedor: str | None = None,
    ) -> RespuestaClasificacion:
        texto = texto.strip()
        nombre = (proveedor or self.configuracion.proveedor).strip().lower()
        if nombre not in PROVEEDORES_VALIDOS:
            raise ValueError(
                f"Proveedor desconocido: {nombre}. Usa laya, jev o reglas."
            )

        inicio = time.perf_counter()
        advertencia: str | None = None

        try:
            if nombre == "reglas":
                decisiones = clasificar_con_reglas(texto)
            else:
                decisiones = self.proveedores[nombre].clasificar(texto)
        except ErrorProveedor as exc:
            if not self.configuracion.fallback_reglas:
                raise
            decisiones = clasificar_con_reglas(texto)
            advertencia = (
                f"{nombre} no pudo clasificar ({exc}). "
                "Se usó el clasificador de reglas con confianza baja."
            )

        decisiones = aplicar_guardarrailes(texto, decisiones)

        return self._construir_respuesta(texto, decisiones, advertencia, inicio)

    def _construir_respuesta(
        self,
        texto: str,
        decisiones: Decisiones,
        advertencia: str | None,
        inicio: float,
    ) -> RespuestaClasificacion:
        latencia = int((time.perf_counter() - inicio) * 1000)
        requiere_revision = (
            decisiones.confianza < self.configuracion.confianza_minima
            or decisiones.proveedor == "reglas"
        )
        return RespuestaClasificacion(
            texto=texto,
            transcripcion=None,
            severidad=decisiones.severidad,
            severidad_etiqueta=etiqueta_severidad(decisiones.severidad),
            departamento_principal=decisiones.departamento_principal,
            departamentos=decisiones.departamentos,
            confianza=decisiones.confianza,
            requiere_revision=requiere_revision,
            proveedor=decisiones.proveedor,
            modelo=decisiones.modelo,
            advertencia=advertencia,
            latencia_ms=latencia,
        )

    def calentar(self, proveedor: str = "laya") -> None:
        nombre = proveedor.strip().lower()
        if nombre != "laya":
            return
        self.proveedores["laya"].calentar()

    def estado(self) -> dict:
        return {
            "laya_instalado": self.proveedores["laya"].instalado,
            "laya_listo": self.proveedores["laya"].listo,
            "proveedor": self.configuracion.proveedor,
        }

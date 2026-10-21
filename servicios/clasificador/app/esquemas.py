from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DEPARTAMENTOS = ("bomberos", "policia", "ambulancia", "defensa_civil")
DEPARTAMENTO_DEFECTO = "defensa_civil"

SEVERIDAD_ETIQUETAS = {
    1: "Crítica",
    2: "Alta",
    3: "Media",
    4: "Baja",
    5: "Informativa",
}

Proveedor = Literal["laya", "jev", "reglas"]


class SolicitudClasificacion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    texto: str = Field(min_length=3, max_length=8000)
    proveedor: Proveedor | None = None


class RespuestaClasificacion(BaseModel):
    texto: str
    transcripcion: str | None = None
    severidad: int = Field(ge=1, le=5)
    severidad_etiqueta: str
    departamento_principal: str
    departamentos: list[str]
    confianza: float = Field(ge=0.0, le=1.0)
    requiere_revision: bool
    proveedor: str
    modelo: str
    advertencia: str | None = None
    latencia_ms: int


class RespuestaTranscripcion(BaseModel):
    texto: str
    idioma: str
    duracion_ms: int | None = None


class RespuestaSalud(BaseModel):
    estado: Literal["ok", "degradado"]
    proveedor: str
    laya_instalado: bool
    laya_listo: bool
    whisper_listo: bool
    modelo_laya: str
    modelo_jev: str
    detalle: str | None = None

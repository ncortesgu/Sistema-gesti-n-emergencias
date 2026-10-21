from __future__ import annotations

from dataclasses import dataclass, field

from .esquemas import DEPARTAMENTO_DEFECTO, DEPARTAMENTOS, SEVERIDAD_ETIQUETAS
from .prompts import ID_DEPARTAMENTO, ID_SEVERIDAD


class ErrorProveedor(RuntimeError):
    """Fallo controlado de un proveedor de clasificación."""


@dataclass
class Decisiones:
    departamento_principal: str
    departamentos: list[str]
    severidad: int
    confianza: float
    modelo: str
    proveedor: str
    probabilidades: dict[str, float] = field(default_factory=dict)


def _confianza(respuesta: dict, defecto: float = 0.5) -> float:
    valor = respuesta.get("confidence", defecto)
    try:
        return max(0.0, min(1.0, float(valor)))
    except (TypeError, ValueError):
        return defecto


def _probabilidad(respuesta: dict, defecto: float = 0.0) -> float:
    valor = respuesta.get("noul", defecto)
    try:
        return max(0.0, min(1.0, float(valor)))
    except (TypeError, ValueError):
        return defecto


def interpretar_respuestas(
    respuestas: dict,
    *,
    proveedor: str,
    modelo: str,
    umbral_apoyo: float = 0.55,
) -> Decisiones:
    """Convierte las respuestas tipadas en una decisión de negocio validada."""
    if not isinstance(respuestas, dict):
        raise ErrorProveedor("El proveedor devolvió una respuesta que no es un objeto JSON.")

    pregunta_departamento = respuestas.get(ID_DEPARTAMENTO)
    pregunta_severidad = respuestas.get(ID_SEVERIDAD)
    if not isinstance(pregunta_departamento, dict) or not isinstance(pregunta_severidad, dict):
        raise ErrorProveedor("La respuesta no incluye departamento y severidad.")

    principal = str(pregunta_departamento.get("choice", "")).strip().lower()
    if principal not in DEPARTAMENTOS:
        principal = DEPARTAMENTO_DEFECTO

    try:
        posicion = float(pregunta_severidad.get("score", 2))
    except (TypeError, ValueError):
        posicion = 2.0
    severidad = round(posicion) + 1
    severidad = max(1, min(5, severidad))

    confianza = min(
        _confianza(pregunta_departamento),
        _confianza(pregunta_severidad),
    )

    departamentos = [principal]
    probabilidades: dict[str, float] = {}
    for departamento in DEPARTAMENTOS:
        respuesta_apoyo = respuestas.get(f"apoyo_{departamento}")
        if not isinstance(respuesta_apoyo, dict):
            continue
        probabilidad = _probabilidad(respuesta_apoyo)
        probabilidades[departamento] = probabilidad
        if probabilidad >= umbral_apoyo and departamento not in departamentos:
            departamentos.append(departamento)

    return Decisiones(
        departamento_principal=principal,
        departamentos=departamentos,
        severidad=severidad,
        confianza=round(confianza, 4),
        modelo=modelo,
        proveedor=proveedor,
        probabilidades={k: round(v, 4) for k, v in probabilidades.items()},
    )


def etiqueta_severidad(severidad: int) -> str:
    return SEVERIDAD_ETIQUETAS.get(severidad, "Media")

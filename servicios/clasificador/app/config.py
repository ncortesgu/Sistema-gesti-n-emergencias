from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


def _entero(nombre: str, defecto: int) -> int:
    valor = os.getenv(nombre, "").strip()
    if not valor:
        return defecto
    try:
        return int(valor)
    except ValueError:
        return defecto


def _flotante(nombre: str, defecto: float) -> float:
    valor = os.getenv(nombre, "").strip()
    if not valor:
        return defecto
    try:
        return float(valor)
    except ValueError:
        return defecto


def _booleano(nombre: str, defecto: bool) -> bool:
    valor = os.getenv(nombre, "").strip().lower()
    if not valor:
        return defecto
    return valor in {"1", "true", "yes", "si", "sí", "on"}


@dataclass(frozen=True)
class Configuracion:
    proveedor: str = "laya"
    fallback_reglas: bool = True
    confianza_minima: float = 0.55
    umbral_apoyo: float = 0.55

    laya_modelo: str = "multilingual"
    laya_dispositivo: str = ""
    laya_max_len: int = 1024
    laya_precargar: bool = False

    openrouter_api_key: str = ""
    openrouter_url: str = "https://openrouter.ai/api/alpha/decisions"
    jev_modelo: str = "typesafe/jev-1.14"
    timeout_llm: int = 45

    core_url: str = "http://127.0.0.1:9000"

    whisper_url: str = "http://127.0.0.1:8080"
    whisper_idioma: str = "es"
    timeout_whisper: int = 300
    max_audio_mb: int = 30

    @classmethod
    def desde_entorno(cls) -> Configuracion:
        return cls(
            proveedor=os.getenv("PROVEEDOR", "laya").strip().lower() or "laya",
            fallback_reglas=_booleano("FALLBACK_REGLAS", True),
            confianza_minima=_flotante("CONFIANZA_MINIMA", 0.55),
            umbral_apoyo=_flotante("UMBRAL_APOYO", 0.55),
            laya_modelo=os.getenv("LAYA_MODEL", "multilingual").strip() or "multilingual",
            laya_dispositivo=os.getenv("LAYA_DEVICE", "").strip(),
            laya_max_len=_entero("LAYA_MAX_LEN", 1024),
            laya_precargar=_booleano("LAYA_PRELOAD", False),
            openrouter_api_key=os.getenv("OPENROUTER_API_KEY", "").strip(),
            openrouter_url=os.getenv(
                "OPENROUTER_URL", "https://openrouter.ai/api/alpha/decisions"
            ).strip(),
            jev_modelo=os.getenv("JEV_MODEL", "typesafe/jev-1.14").strip()
            or "typesafe/jev-1.14",
            timeout_llm=_entero("TIMEOUT_LLM", 45),
            core_url=os.getenv("CORE_URL", "http://127.0.0.1:9000").strip().rstrip("/"),
            whisper_url=os.getenv("WHISPER_URL", "http://127.0.0.1:8080").strip().rstrip("/"),
            whisper_idioma=os.getenv("WHISPER_LANGUAGE", "es").strip() or "es",
            timeout_whisper=_entero("TIMEOUT_WHISPER", 300),
            max_audio_mb=_entero("MAX_AUDIO_MB", 30),
        )


@lru_cache(maxsize=1)
def obtener_configuracion() -> Configuracion:
    return Configuracion.desde_entorno()

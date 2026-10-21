from __future__ import annotations

import pytest

from app.clasificacion import ServicioClasificacion
from app.config import Configuracion
from app.decisiones import ErrorProveedor
from app.proveedores import ProveedorJev, ProveedorLaya


class RouterFalso:
    def __init__(self) -> None:
        self.llamada: dict | None = None

    def predict(self, estado, preguntas, **kwargs):
        self.llamada = {"estado": estado, "preguntas": preguntas, **kwargs}
        return {
            "routing": {"model": "multilingual"},
            "answers": {
                "departamento_principal": {
                    "type": "choice",
                    "choice": "bomberos",
                    "confidence": 0.92,
                },
                "severidad": {"type": "score", "score": 0.0, "confidence": 0.9},
                "apoyo_bomberos": {"type": "noul", "noul": 0.96},
                "apoyo_policia": {"type": "noul", "noul": 0.1},
                "apoyo_ambulancia": {"type": "noul", "noul": 0.7},
                "apoyo_defensa_civil": {"type": "noul", "noul": 0.2},
            },
        }


def test_laya_usa_modelo_multilingual_y_preguntas_sin_criterios_noul():
    proveedor = ProveedorLaya(Configuracion())
    router = RouterFalso()
    proveedor._router = router
    proveedor._cargado = True

    resultado = proveedor.clasificar("Se está quemando una casa")

    assert resultado.proveedor == "laya"
    assert resultado.modelo == "laya-multilingual"
    assert resultado.departamentos == ["bomberos", "ambulancia"]
    assert router.llamada is not None
    assert router.llamada["model"] == "multilingual"
    assert isinstance(router.llamada["estado"], str)
    assert "criteria" not in router.llamada["preguntas"]["apoyo_bomberos"]


def test_laya_calentar_ejecuta_una_prediccion_real():
    proveedor = ProveedorLaya(Configuracion())
    router = RouterFalso()
    proveedor._router = router

    proveedor.calentar()

    assert proveedor.listo is True
    assert router.llamada is not None
    assert isinstance(router.llamada["estado"], str)


class RespuestaFalsa:
    status_code = 200
    text = ""

    def json(self):
        return {
            "model": "typesafe/jev-1.14-20260101",
            "answers": {
                "departamento_principal": {
                    "type": "choice",
                    "choice": "policia",
                    "confidence": 0.8,
                },
                "severidad": {"type": "score", "score": 1.0, "confidence": 0.75},
                "apoyo_policia": {"type": "noul", "noul": 0.9},
                "apoyo_bomberos": {"type": "noul", "noul": 0.05},
                "apoyo_ambulancia": {"type": "noul", "noul": 0.1},
                "apoyo_defensa_civil": {"type": "noul", "noul": 0.1},
            },
        }


class ClienteJevFalso:
    ultima_llamada: dict | None = None

    def __init__(self, timeout=None):
        self.timeout = timeout

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def post(self, url, json, headers):
        ClienteJevFalso.ultima_llamada = {
            "url": url,
            "json": json,
            "headers": headers,
        }
        return RespuestaFalsa()


def test_jev_envia_criterios_y_lee_la_respuesta(monkeypatch):
    monkeypatch.setattr("app.proveedores.jev.httpx.Client", ClienteJevFalso)
    proveedor = ProveedorJev(
        Configuracion(openrouter_api_key="sk-or-prueba", proveedor="jev")
    )

    resultado = proveedor.clasificar("Hay un hombre con un cuchillo")

    assert resultado.proveedor == "jev"
    assert resultado.departamento_principal == "policia"
    assert resultado.severidad == 2
    assert ClienteJevFalso.ultima_llamada is not None
    llamada = ClienteJevFalso.ultima_llamada
    assert llamada["url"].endswith("/api/alpha/decisions")
    assert llamada["headers"]["Authorization"] == "Bearer sk-or-prueba"
    assert llamada["json"]["model"] == "typesafe/jev-1.14"
    assert "criteria" in llamada["json"]["questions"]["apoyo_bomberos"]
    assert llamada["json"]["state"]["texto_emergencia"] == "Hay un hombre con un cuchillo"


def test_jev_sin_api_key_falla():
    proveedor = ProveedorJev(Configuracion(proveedor="jev"))
    with pytest.raises(ErrorProveedor):
        proveedor.clasificar("Hay un incendio")


class ProveedorQueFalla:
    def clasificar(self, texto):
        raise ErrorProveedor("servicio no disponible")


def test_servicio_usa_reglas_si_el_proveedor_falla():
    servicio = ServicioClasificacion(Configuracion(proveedor="laya"))
    servicio.proveedores["laya"] = ProveedorQueFalla()

    resultado = servicio.clasificar("Se inundó el barrio")

    assert resultado.proveedor == "reglas"
    assert resultado.advertencia is not None
    assert resultado.requiere_revision is True
    assert resultado.departamento_principal == "defensa_civil"

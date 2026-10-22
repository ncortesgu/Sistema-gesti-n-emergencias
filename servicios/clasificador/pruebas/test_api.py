from fastapi.testclient import TestClient
from pytest import fixture

from app.esquemas import RespuestaClasificacion
from app.main import app, obtener_core, obtener_servicio, obtener_whisper


class ServicioFalso:
    def clasificar(self, texto: str, proveedor: str | None = None):
        return RespuestaClasificacion(
            texto=texto,
            transcripcion=None,
            severidad=2,
            severidad_etiqueta="Alta",
            departamento_principal="bomberos",
            departamentos=["bomberos", "ambulancia"],
            confianza=0.88,
            requiere_revision=False,
            proveedor=proveedor or "laya",
            modelo="falso",
            latencia_ms=1,
        )

    def estado(self) -> dict:
        return {"laya_instalado": True, "laya_listo": True, "proveedor": "laya"}

    def calentar(self, proveedor: str = "laya") -> None:
        return None


class WhisperFalso:
    async def transcribir(self, nombre, contenido, tipo=None):
        return "Hay humo en el edificio", 1200

    async def salud(self) -> bool:
        return True


class CoreFalso:
    async def salud(self) -> bool:
        return True


app.dependency_overrides[obtener_servicio] = lambda: ServicioFalso()
app.dependency_overrides[obtener_whisper] = lambda: WhisperFalso()
app.dependency_overrides[obtener_core] = lambda: CoreFalso()


@fixture
def cliente():
    with TestClient(app) as test_client:
        yield test_client


def test_clasificar_texto(cliente):
    respuesta = cliente.post(
        "/clasificar",
        json={"texto": "Hay humo en el edificio", "proveedor": "laya"},
    )
    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["departamento_principal"] == "bomberos"
    assert datos["severidad"] == 2


def test_rechaza_texto_corto(cliente):
    respuesta = cliente.post("/clasificar", json={"texto": "  "})
    assert respuesta.status_code == 422


def test_rechaza_proveedor_desconocido(cliente):
    respuesta = cliente.post(
        "/clasificar",
        json={"texto": "Hay un incendio", "proveedor": "otro"},
    )
    assert respuesta.status_code == 422


def test_procesar_audio(cliente):
    respuesta = cliente.post(
        "/procesar-audio",
        files={"archivo": ("emergencia.wav", b"RIFF....WAVE", "audio/wav")},
        data={"proveedor": "laya"},
    )
    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["transcripcion"] == "Hay humo en el edificio"
    assert datos["departamento_principal"] == "bomberos"


def test_rechaza_formato_de_audio(cliente):
    respuesta = cliente.post(
        "/procesar-audio",
        files={"archivo": ("notas.txt", b"texto", "text/plain")},
    )
    assert respuesta.status_code == 415


def test_salud(cliente):
    respuesta = cliente.get("/salud")
    assert respuesta.status_code == 200
    assert respuesta.json()["estado"] == "ok"

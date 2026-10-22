from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
from pytest import fixture

from app.core import ErrorCore
from app.main import app, obtener_core

EMERGENCIA = {
    "id": "EMG-1001",
    "reporte_id": "REP-1",
    "texto": "Incendio con persona atrapada",
    "transcripcion": None,
    "informe": "Riesgo vital",
    "justificacion": "Fuego y víctima",
    "severidad": 1,
    "departamentos": ["bomberos", "ambulancia"],
    "confianza": 0.91,
    "fecha": "2026-10-21T20:00:00+00:00",
    "origen": "texto",
    "x": 640,
    "y": 310,
    "atenciones": {"bomberos": False, "ambulancia": False},
    "unidad": None,
    "estado": "pendiente",
}


class CoreFalso:
    def __init__(self) -> None:
        self.llamadas: list[tuple] = []
        self.emergencias = [dict(EMERGENCIA)]

    async def salud(self) -> bool:
        return True

    async def listar_colas(self) -> list[dict]:
        return list(self.emergencias)

    async def listar_emergencias(self, estado=None, departamento=None) -> list[dict]:
        self.llamadas.append(("listar", estado, departamento))
        return list(self.emergencias)

    async def obtener_emergencia(self, identificador: str) -> dict:
        for item in self.emergencias:
            if item["id"] == identificador:
                return item
        raise ErrorCore(404, "Emergencia no encontrada.")

    async def crear_emergencia(self, datos: dict) -> dict:
        self.llamadas.append(("crear", datos))
        return dict(EMERGENCIA)

    async def atender_emergencia(
        self,
        identificador: str,
        departamento: str,
        atendida: bool = True,
    ) -> dict:
        self.llamadas.append(("atender", identificador, departamento, atendida))
        item = dict(EMERGENCIA)
        item["atenciones"] = {"bomberos": True, "ambulancia": False}
        return item

    async def listar_unidades(self) -> list[dict]:
        return [
            {
                "id": "AMB-001",
                "nombre": "AMB-001",
                "departamento": "ambulancia",
                "disponible": True,
                "estado": "disponible",
                "x": 690,
                "y": 380,
            }
        ]

    async def liberar_unidad(self, identificador: str) -> dict:
        return {"estado": "liberada", "unidad": identificador}

    async def reiniciar(self) -> dict:
        return {"estado": "reiniciado"}


@fixture
def core_falso():
    return CoreFalso()


@fixture
def cliente(core_falso):
    app.dependency_overrides[obtener_core] = lambda: core_falso
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(obtener_core, None)


def _payload() -> dict:
    return {
        "reporte_id": "REP-1",
        "texto": "Incendio con persona atrapada",
        "clasificacion": {
            "departamento": "bomberos",
            "departamentos": ["bomberos", "ambulancia"],
            "severidad": 1,
            "confianza": 0.91,
            "informe": "Riesgo vital",
        },
        "severidad": 1,
        "departamentos": ["bomberos", "ambulancia"],
        "confianza": 0.91,
        "x": 640,
        "y": 310,
    }


def test_proxy_crear_y_listar(cliente, core_falso):
    creada = cliente.post("/api/emergencias", json=_payload())
    assert creada.status_code == 200
    assert creada.json()["id"] == "EMG-1001"

    colas = cliente.get("/api/colas")
    assert colas.status_code == 200
    assert colas.json()["emergencias"][0]["id"] == "EMG-1001"
    assert any(llamada[0] == "crear" for llamada in core_falso.llamadas)


def test_proxy_atender(cliente, core_falso):
    respuesta = cliente.post(
        "/api/emergencias/EMG-1001/atender",
        json={"departamento": "bomberos", "atendida": True},
    )
    assert respuesta.status_code == 200
    assert respuesta.json()["atenciones"]["bomberos"] is True
    assert ("atender", "EMG-1001", "bomberos", True) in core_falso.llamadas


def test_proxy_filtros(cliente, core_falso):
    respuesta = cliente.get("/api/emergencias?estado=pendiente&departamento=bomberos")
    assert respuesta.status_code == 200
    assert ("listar", "pendiente", "bomberos") in core_falso.llamadas


def test_proxy_unidades(cliente):
    respuesta = cliente.get("/api/unidades")
    assert respuesta.status_code == 200
    assert respuesta.json()["unidades"][0]["id"] == "AMB-001"


def test_proxy_propaga_errores_del_core(cliente):
    respuesta = cliente.get("/api/emergencias/NO-EXISTE")
    assert respuesta.status_code == 404
    assert respuesta.json()["detail"] == "Emergencia no encontrada."


class CoreCaido:
    async def salud(self) -> bool:
        return False

    async def listar_colas(self):
        raise ErrorCore(503, "Core no disponible")


def test_salud_reporta_core_caido():
    app.dependency_overrides[obtener_core] = lambda: CoreCaido()
    try:
        with TestClient(app) as test_client:
            respuesta = test_client.get("/salud")
            assert respuesta.status_code == 200
            datos = respuesta.json()
            assert datos["checks"]["colas"] is False
            assert "motor C++" in (datos["detalle"] or "")
    finally:
        app.dependency_overrides.pop(obtener_core, None)


def test_panel_servido_por_el_mismo_origen(cliente):
    ruta_panel = Path.cwd().parent.parent / "Panel-de-Emergencias-Pixel" / "index.html"
    if not ruta_panel.exists():
        return
    respuesta = cliente.get("/panel/")
    assert respuesta.status_code == 200
    assert "SGE" in respuesta.text
    assert cliente.get("/panel").status_code in {200, 307, 308}

import pytest

from app.decisiones import ErrorProveedor, interpretar_respuestas


def _respuestas(choice: str, score: float, apoyos: dict[str, float] | None = None) -> dict:
    datos = {
        "departamento_principal": {
            "type": "choice",
            "choice": choice,
            "confidence": 0.9,
        },
        "severidad": {"type": "score", "score": score, "confidence": 0.8},
    }
    for departamento, probabilidad in (apoyos or {}).items():
        datos[f"apoyo_{departamento}"] = {"type": "noul", "noul": probabilidad}
    return datos


def test_mapea_severidad_y_apoyos():
    resultado = interpretar_respuestas(
        _respuestas(
            "bomberos",
            0.0,
            {"bomberos": 0.95, "ambulancia": 0.8, "policia": 0.1, "defensa_civil": 0.2},
        ),
        proveedor="laya",
        modelo="laya-multilingual",
    )
    assert resultado.departamento_principal == "bomberos"
    assert resultado.severidad == 1
    assert resultado.departamentos == ["bomberos", "ambulancia"]
    assert resultado.confianza == 0.8


def test_score_alto_se_convierte_en_severidad_informativa():
    resultado = interpretar_respuestas(
        _respuestas("defensa_civil", 4.0),
        proveedor="jev",
        modelo="typesafe/jev-1.14",
    )
    assert resultado.severidad == 5


def test_score_fuera_de_rango_se_recorta():
    resultado = interpretar_respuestas(
        _respuestas("policia", 99.0),
        proveedor="laya",
        modelo="laya-multilingual",
    )
    assert resultado.severidad == 5


def test_departamento_invalido_usa_defecto():
    resultado = interpretar_respuestas(
        _respuestas("transito", 2.0),
        proveedor="laya",
        modelo="laya-multilingual",
    )
    assert resultado.departamento_principal == "defensa_civil"


def test_respuesta_sin_preguntas_falla():
    with pytest.raises(ErrorProveedor):
        interpretar_respuestas({}, proveedor="laya", modelo="laya-multilingual")

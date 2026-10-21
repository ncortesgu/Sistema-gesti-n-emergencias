from app.decisiones import Decisiones
from app.guardarrailes import aplicar_guardarrailes


def _decision(
    severidad: int,
    departamento: str = "bomberos",
    departamentos: list[str] | None = None,
    confianza: float = 0.2,
    proveedor: str = "laya",
) -> Decisiones:
    return Decisiones(
        departamento_principal=departamento,
        departamentos=departamentos or [departamento],
        severidad=severidad,
        confianza=confianza,
        modelo="laya-multilingual",
        proveedor=proveedor,
        probabilidades={"bomberos": 0.5, "policia": 0.1, "ambulancia": 0.4, "defensa_civil": 0.9},
    )


def test_incendio_con_persona_atrapada_se_fuerza_a_critico():
    resultado = aplicar_guardarrailes(
        "Se esta incendiando un apartamento y hay una persona atrapada",
        _decision(4, "bomberos", ["bomberos", "defensa_civil"]),
    )
    assert resultado.severidad == 1
    assert resultado.departamento_principal == "bomberos"
    assert "ambulancia" in resultado.departamentos
    assert "defensa_civil" not in resultado.departamentos
    assert resultado.confianza >= 0.7


def test_robo_de_ayer_se_baja_a_severidad_4():
    resultado = aplicar_guardarrailes(
        "Me robaron el celular ayer",
        _decision(2, "policia"),
    )
    assert resultado.severidad == 4
    assert resultado.departamento_principal == "policia"


def test_broma_se_marca_informativa():
    resultado = aplicar_guardarrailes(
        "Es una broma, no pasa nada",
        _decision(2, "bomberos"),
    )
    assert resultado.severidad == 5
    assert resultado.departamentos == ["defensa_civil"]


def test_inundacion_corrige_departamento():
    resultado = aplicar_guardarrailes(
        "Se inundo todo el barrio",
        _decision(3, "bomberos"),
    )
    assert resultado.departamento_principal == "defensa_civil"
    assert resultado.departamentos == ["defensa_civil"]
    assert resultado.severidad == 2


def test_humo_se_prioriza_como_alta():
    resultado = aplicar_guardarrailes(
        "Hay humo en el pasillo, no hay fuego",
        _decision(4, "bomberos"),
    )
    assert resultado.severidad == 2
    assert resultado.departamento_principal == "bomberos"


def test_choque_sin_heridos_no_agrega_ambulancia():
    resultado = aplicar_guardarrailes(
        "Chocaron dos motos, nadie salio herido",
        _decision(2, "bomberos"),
    )
    assert resultado.departamento_principal == "policia"
    assert resultado.severidad == 3
    assert "ambulancia" not in resultado.departamentos


def test_texto_ambiguo_conserva_decision_del_proveedor():
    resultado = aplicar_guardarrailes(
        "Una persona esta gritando en la calle",
        _decision(3, "policia", confianza=0.8),
    )
    assert resultado.severidad == 3
    assert resultado.departamento_principal == "policia"


def test_baja_confianza_sin_evidencia_va_a_revision():
    resultado = aplicar_guardarrailes(
        "Un texto sin palabras de emergencia",
        _decision(3, "bomberos", confianza=0.2),
    )
    assert resultado.severidad == 4
    assert resultado.departamentos == ["defensa_civil"]
    assert resultado.confianza == 0.2


def test_consulta_explicita_se_marca_informativa():
    resultado = aplicar_guardarrailes(
        "Cual es el numero de los bomberos?",
        _decision(2, "bomberos"),
    )
    assert resultado.severidad == 5
    assert resultado.departamentos == ["defensa_civil"]


def test_decision_de_reglas_no_se_modifica():
    original = _decision(4, "policia", proveedor="reglas", confianza=0.35)
    resultado = aplicar_guardarrailes("Hay un incendio", original)
    assert resultado is original

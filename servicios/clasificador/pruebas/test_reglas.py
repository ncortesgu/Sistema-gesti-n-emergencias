from app.reglas import clasificar_con_reglas


def test_incendio_con_persona_atrapada_es_critico():
    resultado = clasificar_con_reglas(
        "Se está quemando la casa y hay un niño atrapado"
    )
    assert resultado.departamento_principal == "bomberos"
    assert resultado.severidad == 1
    assert "bomberos" in resultado.departamentos


def test_robo_de_ayer_es_prioridad_baja():
    resultado = clasificar_con_reglas("Me robaron el celular ayer")
    assert resultado.departamento_principal == "policia"
    assert resultado.severidad == 4


def test_choque_sin_heridos_no_activa_ambulancia():
    resultado = clasificar_con_reglas(
        "Chocaron dos motos, nadie salió herido, están discutiendo"
    )
    assert resultado.departamento_principal == "policia"
    assert "ambulancia" not in resultado.departamentos
    assert resultado.severidad == 3


def test_frase_informativa_no_es_emergencia():
    resultado = clasificar_con_reglas("¿Cuál es el número de los bomberos?")
    assert resultado.severidad == 5
    assert resultado.departamento_principal == "defensa_civil"


def test_desmayo_es_alta_gravedad():
    resultado = clasificar_con_reglas("Mi mamá se desmayó y no responde")
    assert resultado.departamento_principal == "ambulancia"
    assert resultado.severidad == 1


def test_humo_activa_bomberos_aunque_niegue_fuego():
    resultado = clasificar_con_reglas("No hay fuego, solo humo en el pasillo")
    assert resultado.departamento_principal == "bomberos"
    assert resultado.severidad == 2


def test_inundacion_activa_defensa_civil():
    resultado = clasificar_con_reglas("Se inundó todo el barrio")
    assert resultado.departamento_principal == "defensa_civil"
    assert resultado.severidad == 2


def test_mencion_de_bombero_no_es_emergencia():
    resultado = clasificar_con_reglas("Mi papá es bombero")
    assert resultado.severidad == 5
    assert resultado.departamento_principal == "defensa_civil"


def test_arma_blanca_activa_policia():
    resultado = clasificar_con_reglas(
        "Hay un hombre con un cuchillo amenazando a la gente"
    )
    assert resultado.departamento_principal == "policia"
    assert resultado.severidad == 2


def test_broma_es_informativa():
    resultado = clasificar_con_reglas("Es una broma, no pasa nada")
    assert resultado.severidad == 5

from app.prompts import construir_estado, construir_preguntas


def test_laya_no_envia_criterios_en_noul():
    preguntas = construir_preguntas(incluir_criterios_noul=False)
    for nombre, pregunta in preguntas.items():
        if nombre.startswith("apoyo_"):
            assert pregunta["type"] == "noul"
            assert "criteria" not in pregunta


def test_laya_conciso_usa_texto_limpio_y_criterios_cortos():
    estado = construir_estado("Hay un incendio", conciso=True)
    preguntas = construir_preguntas(incluir_criterios_noul=False, conciso=True)
    assert isinstance(estado, str)
    assert estado == "Hay un incendio"
    assert len(preguntas["severidad"]["criteria"]) == 5
    assert "criteria" not in preguntas["apoyo_bomberos"]


def test_jev_envia_criterios_en_noul():
    preguntas = construir_preguntas(incluir_criterios_noul=True)
    for nombre, pregunta in preguntas.items():
        if nombre.startswith("apoyo_"):
            assert pregunta["type"] == "noul"
            assert set(pregunta["criteria"]) == {"true", "false"}


def test_cuatro_departamentos_y_sin_transito():
    preguntas = construir_preguntas(incluir_criterios_noul=True)
    criterios = preguntas["departamento_principal"]["criteria"]
    assert set(criterios) == {"bomberos", "policia", "ambulancia", "defensa_civil"}
    assert "transito" not in criterios

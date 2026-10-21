from __future__ import annotations

from .decisiones import Decisiones
from .reglas import (
    clasificar_con_reglas,
    departamentos_evidentes,
    es_informativa_explicita,
)


def aplicar_guardarrailes(texto: str, decision: Decisiones) -> Decisiones:
    """Corrige errores evidentes de un modelo de decisión.

    Laya es rápido y útil para casos ambiguos, pero en pruebas confundió
    incendios con personas atrapadas y denuncias pasadas. Esta capa usa las
    palabras explícitas del relato para fijar los casos que no admiten duda.
    """
    if decision.proveedor == "reglas":
        return decision

    reglas = clasificar_con_reglas(texto)
    evidentes = departamentos_evidentes(texto)

    if evidentes:
        principal = reglas.departamento_principal
        if principal not in evidentes:
            principal = evidentes[0]

        departamentos = [principal]
        for departamento in evidentes:
            if departamento not in departamentos:
                departamentos.append(departamento)

        severidad = reglas.severidad
        if severidad == 5:
            severidad = 3

        return Decisiones(
            departamento_principal=principal,
            departamentos=departamentos,
            severidad=severidad,
            confianza=max(decision.confianza, 0.72),
            modelo=decision.modelo,
            proveedor=decision.proveedor,
            probabilidades=decision.probabilidades,
        )

    if es_informativa_explicita(texto):
        return Decisiones(
            departamento_principal="defensa_civil",
            departamentos=["defensa_civil"],
            severidad=5,
            confianza=max(decision.confianza, 0.8),
            modelo=decision.modelo,
            proveedor=decision.proveedor,
            probabilidades=decision.probabilidades,
        )

    if decision.confianza < 0.35 and reglas.severidad != 1:
        return Decisiones(
            departamento_principal="defensa_civil",
            departamentos=["defensa_civil"],
            severidad=max(decision.severidad, 4),
            confianza=decision.confianza,
            modelo=decision.modelo,
            proveedor=decision.proveedor,
            probabilidades=decision.probabilidades,
        )

    severidad = decision.severidad
    if reglas.severidad == 1:
        severidad = 1
    elif reglas.severidad == 4:
        severidad = max(severidad, 4)

    departamentos = [decision.departamento_principal or "defensa_civil"]
    for departamento, probabilidad in decision.probabilidades.items():
        if (
            probabilidad >= 0.8
            and departamento not in departamentos
            and departamento != "defensa_civil"
        ):
            departamentos.append(departamento)

    if severidad == 5:
        departamentos = ["defensa_civil"]

    confianza = decision.confianza
    if severidad == 1 and decision.severidad > 1:
        confianza = max(confianza, 0.65)

    return Decisiones(
        departamento_principal=departamentos[0],
        departamentos=departamentos,
        severidad=severidad,
        confianza=confianza,
        modelo=decision.modelo,
        proveedor=decision.proveedor,
        probabilidades=decision.probabilidades,
    )

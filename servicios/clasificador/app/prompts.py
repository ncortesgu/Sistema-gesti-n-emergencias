"""Preguntas y contexto compartidos para Laya y Jev.

Los modelos System One no generan texto: responden preguntas tipadas. Por eso
toda la calidad de la clasificación vive en estas instrucciones y criterios.
"""

from __future__ import annotations

from .esquemas import DEPARTAMENTOS

REGLAS_ESTADO = [
    "Actúas como despachador experto del sistema de emergencias de Bogotá, Colombia.",
    "Clasifica únicamente lo que el relato afirma de forma explícita o razonablemente evidente. No inventes datos.",
    "El texto puede venir de una transcripción de voz: ignora muletillas, repeticiones, titubeos y errores menores de transcripción.",
    "Distingue una emergencia real de una broma, una prueba, una noticia, una pregunta, una queja, un relato del pasado remoto o una mención hipotética.",
    "Las negaciones importan: 'no hay heridos', 'sin humo' o 'nadie está atrapado' no deben activar bomberos ni ambulancia.",
    "Si el relato menciona varias situaciones, clasifica la más urgente y marca como apoyo a los organismos que también deban responder.",
    "No deduzcas el organismo por una palabra aislada: 'mi papá es bombero' no es un incendio; 'vi un policía' no es un delito.",
    "Ante una duda real entre dos niveles de gravedad, elige el más grave solo si existe riesgo plausible para la vida o para la integridad de las personas.",
    "Si el texto no describe una emergencia, usa severidad 5 (Informativa) y departamento defensa_civil.",
    "Responde en español y usa exactamente las etiquetas permitidas.",
]

INSTRUCCION_DEPARTAMENTO = (
    "Identifica el organismo que debe atender PRINCIPALMENTE esta emergencia. "
    "Elige exactamente una opción, incluso si el relato es dudoso o incompleto. "
    "Prioriza el organismo que resolvería el riesgo inmediato, no el que aparece mencionado de pasada. "
    "Si hay personas lesionadas o enfermas, la atención médica suele ser principal; si hay fuego, "
    "explosión, humo o personas atrapadas, bomberos suele ser principal; si hay un delito, arma o "
    "violencia en curso, policía suele ser principal; si es un riesgo natural, estructural o una "
    "situación no cubierta por los otros cuerpos, defensa_civil."
)

CRITERIOS_DEPARTAMENTOS = {
    "bomberos": (
        "Incendios, humo, explosiones, olor fuerte a gas o combustible, fugas de gas, materiales "
        "peligrosos, personas atrapadas o rescate urbano, colapso de estructuras con riesgo, "
        "quemaduras graves. Ejemplos: 'se está quemando el apartamento', 'hay humo en el pasillo', "
        "'se siente olor a gas', 'un niño quedó atrapado en un ascensor'. "
        "No elegir bomberos solo porque alguien sea bombero o porque se mencione un extintor."
    ),
    "policia": (
        "Delitos en curso o recientes, robos, asaltos, disparos, riñas, agresiones, violencia "
        "intrafamiliar, amenazas creíbles, personas armadas, grupos sospechosos, disturbios, "
        "allanamientos, extorsión, secuestro, personas desaparecidas recientes. También control "
        "de tránsito cuando un accidente no deja heridos. Ejemplos: 'me están robando', "
        "'hay un hombre con un cuchillo', 'escuché disparos', 'mi pareja me está agrediendo', "
        "'chocaron dos carros y están discutiendo, nadie salió herido'."
    ),
    "ambulancia": (
        "Personas heridas, enfermas o en riesgo médico: dolor de pecho, dificultad para respirar, "
        "desmayo, convulsiones, intoxicación, sobredosis, hemorragia, parto en curso, accidente con "
        "lesionados, crisis de salud mental con riesgo, personas inconscientes. Ejemplos: "
        "'mi mamá se desmayó y no responde', 'hay un ciclista atropellado y sangra', "
        "'una señora está teniendo un bebé en la calle', 'alguien se tomó pastillas'."
    ),
    "defensa_civil": (
        "Riesgos naturales o estructurales y coordinación general: inundaciones, deslizamientos, "
        "derrumbes, temblores con daños, vendavales, árboles caídos sobre viviendas, búsqueda y "
        "rescate en zonas de difícil acceso, albergue, emergencias comunitarias, situaciones que no "
        "son claramente fuego, delito o salud. También se usa para reportes informativos o textos "
        "que no describen una emergencia real. Ejemplos: 'se inundó el barrio', 'se cayó un muro y "
        "hay casas en riesgo', 'está temblando y se agrietaron las paredes', 'solo quería saber a "
        "dónde llamo para reportar basura'."
    ),
}

INSTRUCCION_SEVERIDAD = (
    "Evalúa la gravedad INMEDIATA de la situación descrita, no la importancia del tema ni la "
    "gravedad de lo que podría pasar en el futuro. Usa la siguiente escala ordenada de menor a "
    "mayor gravedad. Si el relato es ambiguo, no eleves la gravedad por suposiciones."
)

CRITERIOS_SEVERIDAD = [
    (
        "1 - Crítica: riesgo actual y directo de muerte o de lesiones graves; personas atrapadas, "
        "inconscientes o con hemorragia abundante; incendio descontrolado; explosión; disparos o "
        "violencia armada en curso; derrumbe con víctimas; persona que no respira. "
        "Ejemplo: 'hay un niño atrapado en la casa que se está incendiando'."
    ),
    (
        "2 - Alta: riesgo significativo que requiere respuesta inmediata aunque no haya víctimas "
        "confirmadas; humo denso que obliga a evacuar; persona desaparecida hace pocas horas; "
        "accidente con heridos leves; amenaza creíble con arma; fuga de gas perceptible; "
        "inundación que entra a las viviendas; persona con dolor de pecho o dificultad para respirar. "
        "Ejemplo: 'se siente mucho olor a gas en todo el edificio'."
    ),
    (
        "3 - Media: emergencia contenida o sin riesgo inmediato para la vida; incendio pequeño ya "
        "controlado; accidente sin heridos; fuga menor de agua; ruido o conflicto vecinal sin "
        "violencia; persona desorientada pero acompañada y a salvo. "
        "Ejemplo: 'chocaron dos motos, están de pie y discutiendo, nadie salió herido'."
    ),
    (
        "4 - Baja: situación que puede requerir atención pero no es urgente; denuncia de un hecho "
        "pasado sin riesgo actual; reporte preventivo; solicitud de información o de un servicio "
        "no urgente; animal en riesgo sin personas involucradas. "
        "Ejemplo: 'me robaron el celular ayer y quiero poner la denuncia'."
    ),
    (
        "5 - Informativa: no es una emergencia; pregunta, saludo, broma, prueba del sistema, "
        "noticia, comentario, publicidad o texto sin ningún riesgo para personas o bienes. "
        "Ejemplo: '¿cuál es el número de los bomberos?' o 'esto es una prueba, no pasa nada'."
    ),
]

CRITERIOS_APOYO = {
    "bomberos": {
        "true": (
            "El relato indica fuego, humo, explosión, olor a gas o combustible, materiales "
            "peligrosos, personas atrapadas o necesidad de rescate."
        ),
        "false": (
            "No hay fuego, humo, explosión, fuga de gas, materiales peligrosos ni necesidad de "
            "rescate; o el relato solo menciona a un bombero sin describir una emergencia."
        ),
    },
    "policia": {
        "true": (
            "El relato indica un delito, violencia, armas, amenaza, agresión, persona sospechosa, "
            "disturbio o necesidad de control del orden público."
        ),
        "false": (
            "No hay delito, violencia, arma, amenaza ni alteración del orden; o solo se menciona a "
            "un policía sin que ocurra nada."
        ),
    },
    "ambulancia": {
        "true": (
            "El relato indica personas heridas, enfermas, inconscientes, con dolor intenso, "
            "dificultad para respirar, intoxicación, parto o crisis de salud."
        ),
        "false": (
            "No hay personas lesionadas o enfermas; o el relato niega explícitamente que haya "
            "heridos ('no hay heridos', 'nadie salió lesionado')."
        ),
    },
    "defensa_civil": {
        "true": (
            "El relato indica inundación, deslizamiento, derrumbe, sismo con daños, vendaval, "
            "árbol caído sobre una vivienda, búsqueda y rescate, albergue o coordinación de una "
            "emergencia comunitaria."
        ),
        "false": (
            "No hay riesgo natural o estructural, ni necesidad de coordinación, albergue o "
            "búsqueda y rescate."
        ),
    },
}

INSTRUCCIONES_APOYO = {
    "bomberos": (
        "¿Se requiere también la presencia de bomberos para atender esta emergencia? "
        "Responde sí solo si hay fuego, humo, explosión, fuga de gas, materiales peligrosos, "
        "personas atrapadas o rescate. Si bomberos ya es el organismo principal, responde sí."
    ),
    "policia": (
        "¿Se requiere también la presencia de la policía para atender esta emergencia? "
        "Responde sí solo si hay un delito, violencia, armas, amenaza, agresión, disturbio o "
        "riesgo de alteración del orden. Si la policía ya es el organismo principal, responde sí."
    ),
    "ambulancia": (
        "¿Se requiere también atención médica de emergencia (ambulancia) para esta emergencia? "
        "Responde sí solo si hay personas heridas, enfermas, inconscientes, intoxicadas, con dolor "
        "intenso o en crisis de salud. Respeta las negaciones: 'no hay heridos' significa no. "
        "Si la ambulancia ya es el organismo principal, responde sí."
    ),
    "defensa_civil": (
        "¿Se requiere también la coordinación de defensa civil para esta emergencia? "
        "Responde sí solo si hay inundación, deslizamiento, derrumbe, sismo con daños, vendaval, "
        "búsqueda y rescate, albergue o una emergencia comunitaria que requiera coordinación. "
        "Si defensa civil ya es el organismo principal, responde sí."
    ),
}

ID_DEPARTAMENTO = "departamento_principal"
ID_SEVERIDAD = "severidad"

CRITERIOS_DEPARTAMENTOS_CONCISOS = {
    "bomberos": "fuego, humo, explosion, fuga de gas, personas atrapadas, rescate",
    "policia": "robo, arma, violencia, amenaza, agresion, delito",
    "ambulancia": "herido, enfermo, desmayo, intoxicacion, dolor de pecho, parto",
    "defensa_civil": "inundacion, derrumbe, sismo, vendaval, albergue, no es emergencia",
}

CRITERIOS_SEVERIDAD_CONCISOS = [
    "Critica: riesgo inmediato de muerte o lesion grave",
    "Alta: requiere atencion inmediata",
    "Media: emergencia moderada o contenida",
    "Baja: hecho pasado o sin riesgo actual",
    "Informativa: no es una emergencia",
]

INSTRUCCIONES_APOYO_CONCISAS = {
    "bomberos": "Se necesita bomberos por fuego, humo, explosion, gas o personas atrapadas?",
    "policia": "Se necesita policia por robo, arma, violencia, amenaza o delito?",
    "ambulancia": (
        "Se necesita ambulancia por heridos, enfermedad, desmayo o intoxicacion? "
        "Responde no si el texto dice que no hay heridos."
    ),
    "defensa_civil": (
        "Se necesita defensa civil por inundacion, derrumbe, sismo, vendaval o albergue?"
    ),
}


def construir_estado(texto: str, conciso: bool = False):
    """Contexto para el proveedor.

    Laya funciona mejor con el texto limpio: si recibe las reglas y los ejemplos,
    puede confundir esas palabras con el contenido real de la emergencia. Jev
    aprovecha el contexto completo con las reglas.
    """
    if conciso:
        return texto
    return {
        "rol": "Despachador experto del sistema de emergencias de Bogotá, Colombia.",
        "tarea": (
            "Clasificar el relato de un ciudadano para decidir qué organismos deben atenderlo y "
            "qué tan grave es la situación."
        ),
        "texto_emergencia": texto,
        "reglas": REGLAS_ESTADO,
        "departamentos_validos": list(DEPARTAMENTOS),
    }


def construir_preguntas(
    incluir_criterios_noul: bool = False,
    conciso: bool = False,
) -> dict:
    """Preguntas tipadas para Laya (sin criterios de noul) o Jev (con criterios)."""
    if conciso:
        preguntas: dict = {
            ID_DEPARTAMENTO: {
                "type": "choice",
                "instructions": "Que organismo debe atender principalmente esta emergencia?",
                "criteria": CRITERIOS_DEPARTAMENTOS_CONCISOS,
            },
            ID_SEVERIDAD: {
                "type": "score",
                "instructions": "Que tan grave es la emergencia en este momento?",
                "criteria": CRITERIOS_SEVERIDAD_CONCISOS,
            },
        }
        for departamento, instruccion in INSTRUCCIONES_APOYO_CONCISAS.items():
            preguntas[f"apoyo_{departamento}"] = {
                "type": "noul",
                "instructions": instruccion,
            }
        return preguntas

    preguntas = {
        ID_DEPARTAMENTO: {
            "type": "choice",
            "instructions": INSTRUCCION_DEPARTAMENTO,
            "criteria": CRITERIOS_DEPARTAMENTOS,
        },
        ID_SEVERIDAD: {
            "type": "score",
            "instructions": INSTRUCCION_SEVERIDAD,
            "criteria": CRITERIOS_SEVERIDAD,
        },
    }

    for departamento, instruccion in INSTRUCCIONES_APOYO.items():
        pregunta = {
            "type": "noul",
            "instructions": instruccion,
        }
        if incluir_criterios_noul:
            pregunta["criteria"] = CRITERIOS_APOYO[departamento]
        preguntas[f"apoyo_{departamento}"] = pregunta

    return preguntas

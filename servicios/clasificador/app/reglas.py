"""Clasificador determinista de respaldo.

No sustituye a Laya ni a Jev: solo evita que la consola quede inservible si el
proveedor principal no responde. Sus decisiones se marcan con confianza baja y
requieren revisión humana.
"""

from __future__ import annotations

import re
import unicodedata

from .decisiones import Decisiones
from .esquemas import DEPARTAMENTOS

FRASES_NO_EMERGENCIA = [
    r"no es una emergencia",
    r"es una broma",
    r"solo era una broma",
    r"es una prueba",
    r"estoy probando",
    r"solo queria saber",
    r"solo queria preguntar",
    r"solo es una pregunta",
    r"cual es el numero",
    r"como llamo a",
    r"no pasa nada",
    r"falsa alarma",
    r"vi en las noticias",
    r"segun las noticias",
]

PATRONES = {
    "bomberos": [
        r"incendio",
        r"se esta quemando",
        r"se quemo",
        r"se estan quemando",
        r"fuego",
        r"humo",
        r"explosion",
        r"exploto",
        r"fuga de gas",
        r"olor a gas",
        r"atrapad[oa]s?",
        r"rescate",
        r"materiales? peligrosos?",
        r"quemadura",
    ],
    "policia": [
        r"robo",
        r"robando",
        r"robaron",
        r"asalto",
        r"asaltaron",
        r"disparo",
        r"disparando",
        r"arma",
        r"cuchillo",
        r"pistola",
        r"agresion",
        r"agrediendo",
        r"violencia",
        r"amenaz\w*",
        r"secuestro",
        r"desaparecid[oa]",
        r"disturbio",
        r"pelea",
        r"rina",
        r"allanamiento",
        r"extorsion",
        r"choc\w*",
        r"accidente de transito",
        r"accidente vial",
    ],
    "ambulancia": [
        r"herid[oa]s?",
        r"lesionad[oa]s?",
        r"sangr",
        r"desmay\w*",
        r"inconsciente",
        r"no respira",
        r"dolor de pecho",
        r"dificultad para respirar",
        r"convulsion",
        r"intoxicad",
        r"sobredosis",
        r"parto",
        r"embarazada",
        r"atropell",
        r"enferm[oa]",
        r"me siento mal",
        r"crisis nerviosa",
        r"suicid",
        r"pastillas",
        r"quemadura",
    ],
    "defensa_civil": [
        r"inund\w*",
        r"deslizamiento",
        r"derrumbe",
        r"temblor",
        r"sismo",
        r"terremoto",
        r"vendaval",
        r"arbol caido",
        r"granizada",
        r"albergue",
        r"evacuar",
        r"colapso",
        r"grietas?",
    ],
}

EVIDENTES = {
    "bomberos": [
        r"incendio",
        r"se esta quemando",
        r"se quemo",
        r"se estan quemando",
        r"fuego",
        r"humo",
        r"explosion",
        r"exploto",
        r"fuga de gas",
        r"olor a gas",
        r"atrapad[oa]s?",
        r"rescate",
        r"quemadura",
    ],
    "policia": [
        r"robo",
        r"robando",
        r"robaron",
        r"asalto",
        r"asaltaron",
        r"disparo",
        r"disparando",
        r"arma",
        r"cuchillo",
        r"pistola",
        r"agresion",
        r"agrediendo",
        r"violencia",
        r"amenaz\w*",
        r"secuestro",
        r"desaparecid[oa]",
        r"choc\w*",
    ],
    "ambulancia": [
        r"herid[oa]s?",
        r"lesionad[oa]s?",
        r"sangr",
        r"desmay\w*",
        r"inconsciente",
        r"no respira",
        r"no responde",
        r"muriendo",
        r"muert[oa]s?",
        r"cadaver",
        r"dolor de pecho",
        r"dificultad para respirar",
        r"convulsion",
        r"intoxicad",
        r"sobredosis",
        r"parto",
        r"atropell",
        r"enferm[oa]",
    ],
    "defensa_civil": [
        r"inund\w*",
        r"deslizamiento",
        r"derrumbe",
        r"temblor",
        r"sismo",
        r"terremoto",
        r"vendaval",
        r"arbol caido",
        r"granizada",
        r"albergue",
        r"colapso",
        r"grietas?",
    ],
}

CRITICOS = [
    r"no respira",
    r"no responde",
    r"inconsciente",
    r"atrapad[oa]s?",
    r"muriendo",
    r"muert[oa]s?",
    r"cadaver",
    r"explosion",
    r"disparando",
    r"disparos",
    r"derrumbe con (gente|personas|victimas)",
    r"sangrando mucho",
    r"hemorragia",
    r"sobredosis",
    r"se esta ahogando",
    r"ahogandose",
    r"incendio (grande|descontrolado|en toda la casa)",
]

ALTOS = [
    r"incendio",
    r"fuego",
    r"humo",
    r"herid[oa]s?",
    r"sangr",
    r"dolor de pecho",
    r"dificultad para respirar",
    r"desaparecid[oa]",
    r"arma",
    r"cuchillo",
    r"pistola",
    r"amenaz\w*",
    r"inund\w*",
    r"desmay\w*",
    r"deslizamiento",
    r"derrumbe",
    r"temblor",
    r"fuga de gas",
    r"olor a gas",
    r"parto",
    r"convulsion",
    r"accidente",
]

BAJOS = [
    r"ayer",
    r"la semana pasada",
    r"hace (un|una|varios|muchos) (dia|dias|semana|semanas|ano|anos|mes|meses)",
    r"denuncia",
    r"reporte",
    r"informacion",
    r"consulta",
    r"solo queria",
]

NEGACIONES = re.compile(r"(?:^|\s)(no|sin|nadie|ningun|ninguna|ni)(?:\s|$)")

CONECTORES = (" y ", " pero ", " aunque ", " sino ")


def normalizar(texto: str) -> str:
    sin_tildes = "".join(
        caracter
        for caracter in unicodedata.normalize("NFKD", texto.lower())
        if not unicodedata.combining(caracter)
    )
    return re.sub(r"[^a-z0-9ñ.,;:!?]+", " ", sin_tildes).strip()


def _patron(patron: str) -> re.Pattern[str]:
    return re.compile(rf"(?<!\w){patron}(?!\w)")


def _hay(normalizado: str, patron: str) -> bool:
    return _patron(patron).search(normalizado) is not None


def _hay_sin_negacion(normalizado: str, patron: str) -> bool:
    for coincidencia in _patron(patron).finditer(normalizado):
        inicio = max(0, coincidencia.start() - 45)
        contexto = normalizado[inicio : coincidencia.start()]
        cortes = [contexto.rfind(marca) for marca in ",.;:!?"]
        cortes.extend(contexto.rfind(conector) for conector in CONECTORES)
        corte = max(cortes)
        if corte >= 0:
            contexto = contexto[corte + 1 :]
        if not NEGACIONES.search(contexto):
            return True
    return False


def _puntajes(normalizado: str) -> dict[str, int]:
    puntajes: dict[str, int] = {}
    for departamento, patrones in PATRONES.items():
        puntajes[departamento] = sum(
            1 for patron in patrones if _hay_sin_negacion(normalizado, patron)
        )
    return puntajes


def es_informativa_explicita(texto: str) -> bool:
    normalizado = normalizar(texto)
    return any(_hay(normalizado, patron) for patron in FRASES_NO_EMERGENCIA)


def departamentos_evidentes(texto: str) -> list[str]:
    """Departamentos claramente sugeridos por palabras explícitas del relato."""
    normalizado = normalizar(texto)
    encontrados: list[str] = []
    for departamento, patrones in EVIDENTES.items():
        if any(_hay_sin_negacion(normalizado, patron) for patron in patrones):
            encontrados.append(departamento)

    if "bomberos" in encontrados and any(
        _hay_sin_negacion(normalizado, patron)
        for patron in (r"atrapad[oa]s?", r"persona", r"nino", r"gente")
    ):
        encontrados.append("ambulancia")

    if "policia" in encontrados and any(
        _hay_sin_negacion(normalizado, patron)
        for patron in (r"herid[oa]s?", r"sangr", r"atropell")
    ):
        encontrados.append("ambulancia")

    return [departamento for departamento in DEPARTAMENTOS if departamento in encontrados]


def clasificar_con_reglas(texto: str) -> Decisiones:
    normalizado = normalizar(texto)
    if len(normalizado) < 3:
        return Decisiones(
            departamento_principal="defensa_civil",
            departamentos=["defensa_civil"],
            severidad=5,
            confianza=0.2,
            modelo="reglas",
            proveedor="reglas",
        )

    hay_critico = any(_hay_sin_negacion(normalizado, patron) for patron in CRITICOS)
    hay_alto = any(_hay_sin_negacion(normalizado, patron) for patron in ALTOS)
    hay_bajo = any(_hay(normalizado, patron) for patron in BAJOS)
    frases_informativas = any(_hay(normalizado, patron) for patron in FRASES_NO_EMERGENCIA)

    puntajes = _puntajes(normalizado)
    mejor_puntaje = max(puntajes.values())
    if mejor_puntaje == 0:
        return Decisiones(
            departamento_principal="defensa_civil",
            departamentos=["defensa_civil"],
            severidad=5,
            confianza=0.3,
            modelo="reglas",
            proveedor="reglas",
        )

    if frases_informativas and not hay_critico and not hay_alto:
        return Decisiones(
            departamento_principal="defensa_civil",
            departamentos=["defensa_civil"],
            severidad=5,
            confianza=0.35,
            modelo="reglas",
            proveedor="reglas",
        )

    if hay_critico:
        severidad = 1
    elif hay_alto:
        severidad = 2
    elif hay_bajo:
        severidad = 4
    else:
        severidad = 3

    prioridad = ["ambulancia", "bomberos", "policia", "defensa_civil"]
    principal = max(
        DEPARTAMENTOS,
        key=lambda departamento: (puntajes.get(departamento, 0), -prioridad.index(departamento)),
    )
    if puntajes.get(principal, 0) == 0:
        principal = "defensa_civil"

    departamentos = [principal]
    for departamento in DEPARTAMENTOS:
        if departamento != principal and puntajes.get(departamento, 0) > 0:
            departamentos.append(departamento)

    return Decisiones(
        departamento_principal=principal,
        departamentos=departamentos,
        severidad=severidad,
        confianza=0.35,
        modelo="reglas",
        proveedor="reglas",
        probabilidades={k: min(1.0, v / 4) for k, v in puntajes.items()},
    )


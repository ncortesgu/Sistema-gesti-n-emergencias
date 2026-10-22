from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from .clasificacion import PROVEEDORES_VALIDOS, ServicioClasificacion
from .config import Configuracion, obtener_configuracion
from .core import ClienteCore, ErrorCore
from .decisiones import ErrorProveedor
from .esquemas import (
    AtenderSolicitud,
    NuevaEmergencia,
    RespuestaClasificacion,
    RespuestaSalud,
    RespuestaTranscripcion,
    SolicitudClasificacion,
)
from .whisper import ClienteWhisper, ErrorWhisper

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("clasificador")

EXTENSIONES_AUDIO = {".wav", ".mp3", ".m4a", ".ogg", ".flac", ".webm", ".aac"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    configuracion = obtener_configuracion()
    app.state.configuracion = configuracion
    app.state.servicio = ServicioClasificacion(configuracion)
    app.state.whisper = ClienteWhisper(configuracion)
    app.state.core = ClienteCore(configuracion.core_url)

    tarea_precarga: asyncio.Task | None = None
    if configuracion.laya_precargar:
        tarea_precarga = asyncio.create_task(_precargar_laya(app.state.servicio))
    yield
    if tarea_precarga is not None and not tarea_precarga.done():
        tarea_precarga.cancel()


async def _precargar_laya(servicio: ServicioClasificacion) -> None:
    try:
        await asyncio.to_thread(servicio.calentar, "laya")
        logger.info("Modelo de Laya cargado en memoria.")
    except Exception as exc:  # pragma: no cover - depende del modelo
        logger.warning("No se pudo precargar Laya: %s", exc)


app = FastAPI(
    title="Clasificador de emergencias",
    description="Clasificación de texto y voz en gravedad y organismo responsable.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _resolver_panel() -> Path | None:
    candidatos: list[Path] = []
    configurado = os.getenv("PANEL_DIR", "").strip()
    if configurado:
        candidatos.append(Path(configurado))
    candidatos.extend(
        [
            Path.cwd() / "Panel-de-Emergencias-Pixel",
            Path.cwd().parent / "Panel-de-Emergencias-Pixel",
        ]
    )
    archivo = Path(__file__).resolve()
    if len(archivo.parents) > 3:
        candidatos.append(archivo.parents[3] / "Panel-de-Emergencias-Pixel")
    for candidato in candidatos:
        try:
            ruta = candidato.expanduser().resolve()
        except OSError:
            continue
        if (ruta / "index.html").is_file():
            return ruta
    return None


PANEL_DIR = _resolver_panel()
if PANEL_DIR is not None:

    @app.get("/panel", include_in_schema=False)
    async def redirigir_panel():
        return RedirectResponse(url="/panel/")

    app.mount(
        "/panel",
        StaticFiles(directory=str(PANEL_DIR), html=True),
        name="panel",
    )
    logger.info("Panel servido desde %s", PANEL_DIR)


def obtener_servicio(request: Request) -> ServicioClasificacion:
    return request.app.state.servicio


def obtener_whisper(request: Request) -> ClienteWhisper:
    return request.app.state.whisper


def obtener_config(request: Request) -> Configuracion:
    return request.app.state.configuracion


def obtener_core(request: Request) -> ClienteCore:
    return request.app.state.core


def _error_core(exc: ErrorCore) -> HTTPException:
    return HTTPException(status_code=exc.codigo, detail=exc.detalle)


def _validar_proveedor(proveedor: str | None) -> str | None:
    if proveedor is None:
        return None
    proveedor = proveedor.strip().lower()
    if proveedor not in PROVEEDORES_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Proveedor desconocido: {proveedor}. Usa laya, jev o reglas.",
        )
    return proveedor


async def _leer_audio(
    archivo: UploadFile,
    configuracion: Configuracion,
) -> tuple[str, bytes, str | None]:
    nombre = archivo.filename or "audio.wav"
    extension = Path(nombre).suffix.lower()
    if extension not in EXTENSIONES_AUDIO:
        raise HTTPException(
            status_code=415,
            detail=f"Formato de audio no soportado: {extension or 'sin extensión'}.",
        )

    contenido = await archivo.read()
    if not contenido:
        raise HTTPException(status_code=422, detail="El archivo de audio está vacío.")
    limite = configuracion.max_audio_mb * 1024 * 1024
    if len(contenido) > limite:
        raise HTTPException(
            status_code=413,
            detail=f"El audio supera el límite de {configuracion.max_audio_mb} MB.",
        )
    return nombre, contenido, archivo.content_type


@app.get("/", include_in_schema=False)
async def raiz():
    if PANEL_DIR is not None:
        return RedirectResponse(url="/panel/")
    return {
        "servicio": "clasificador de emergencias",
        "version": "1.0.0",
        "endpoints": [
            "POST /clasificar",
            "POST /procesar-audio",
            "POST /transcribir",
            "GET /salud",
            "POST /calentar",
            "GET /api/colas",
            "POST /api/emergencias",
            "GET /api/emergencias",
            "GET /api/emergencias/{id}",
            "POST /api/emergencias/{id}/atender",
            "GET /api/unidades",
        ],
        "panel": "/panel/" if PANEL_DIR is not None else None,
    }


@app.get("/salud", response_model=RespuestaSalud)
async def salud(
    servicio: ServicioClasificacion = Depends(obtener_servicio),
    whisper: ClienteWhisper = Depends(obtener_whisper),
    configuracion: Configuracion = Depends(obtener_config),
    core: ClienteCore = Depends(obtener_core),
):
    estado_servicio = servicio.estado()
    whisper_listo = await whisper.salud()
    core_listo = await core.salud()
    detalles: list[str] = []

    if not whisper_listo:
        detalles.append("whisper.cpp no responde; la voz no estará disponible.")
    if not core_listo:
        detalles.append("El motor C++ no responde; las colas y unidades no están disponibles.")
    if configuracion.proveedor == "laya" and not estado_servicio["laya_instalado"]:
        detalles.append("Laya no está instalado; se usará el clasificador de reglas.")
    if configuracion.proveedor == "jev" and not configuracion.openrouter_api_key:
        detalles.append("OPENROUTER_API_KEY no configurada para Jev.")

    if configuracion.proveedor == "jev":
        modelo = configuracion.jev_modelo
    elif configuracion.proveedor == "laya":
        modelo = configuracion.laya_modelo
    else:
        modelo = "reglas"

    return RespuestaSalud(
        estado="degradado" if detalles else "ok",
        proveedor=configuracion.proveedor,
        laya_instalado=estado_servicio["laya_instalado"],
        laya_listo=estado_servicio["laya_listo"],
        whisper_listo=whisper_listo,
        modelo_laya=configuracion.laya_modelo,
        modelo_jev=configuracion.jev_modelo,
        modelo=modelo,
        checks={
            "clasificador": True,
            "audio": whisper_listo,
            "colas": core_listo,
            "unidades": core_listo,
        },
        detalle=" ".join(detalles) or None,
    )


@app.post("/clasificar", response_model=RespuestaClasificacion)
async def clasificar(
    solicitud: SolicitudClasificacion,
    servicio: ServicioClasificacion = Depends(obtener_servicio),
):
    texto = solicitud.texto.strip()
    if len(texto) < 3:
        raise HTTPException(status_code=422, detail="El texto es demasiado corto.")
    proveedor = _validar_proveedor(solicitud.proveedor)
    try:
        return await asyncio.to_thread(servicio.clasificar, texto, proveedor)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ErrorProveedor as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/transcribir", response_model=RespuestaTranscripcion)
async def transcribir(
    archivo: UploadFile = File(...),
    whisper: ClienteWhisper = Depends(obtener_whisper),
    configuracion: Configuracion = Depends(obtener_config),
):
    nombre, contenido, tipo = await _leer_audio(archivo, configuracion)
    try:
        texto, duracion = await whisper.transcribir(nombre, contenido, tipo)
    except ErrorWhisper as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return RespuestaTranscripcion(
        texto=texto,
        idioma=configuracion.whisper_idioma,
        duracion_ms=duracion,
    )


@app.post("/procesar-audio", response_model=RespuestaClasificacion)
async def procesar_audio(
    archivo: UploadFile = File(...),
    proveedor: str | None = Form(default=None),
    servicio: ServicioClasificacion = Depends(obtener_servicio),
    whisper: ClienteWhisper = Depends(obtener_whisper),
    configuracion: Configuracion = Depends(obtener_config),
):
    nombre, contenido, tipo = await _leer_audio(archivo, configuracion)
    proveedor_validado = _validar_proveedor(proveedor)

    try:
        texto, _ = await whisper.transcribir(nombre, contenido, tipo)
    except ErrorWhisper as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    try:
        resultado = await asyncio.to_thread(
            servicio.clasificar, texto, proveedor_validado
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ErrorProveedor as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return resultado.model_copy(update={"transcripcion": texto})


@app.post("/calentar")
async def calentar(
    proveedor: str = "laya",
    servicio: ServicioClasificacion = Depends(obtener_servicio),
    configuracion: Configuracion = Depends(obtener_config),
):
    nombre = _validar_proveedor(proveedor) or "laya"
    if nombre != "laya":
        return {"estado": "sin_cambio", "detalle": "Solo Laya requiere calentamiento."}
    try:
        await asyncio.to_thread(servicio.calentar, nombre)
    except ErrorProveedor as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"estado": "listo", "modelo": configuracion.laya_modelo}


@app.get("/api/colas")
async def listar_colas(core: ClienteCore = Depends(obtener_core)):
    try:
        return {"emergencias": await core.listar_colas()}
    except ErrorCore as exc:
        raise _error_core(exc) from exc


@app.get("/api/emergencias")
async def listar_emergencias(
    estado: str | None = None,
    departamento: str | None = None,
    core: ClienteCore = Depends(obtener_core),
):
    try:
        return {
            "emergencias": await core.listar_emergencias(
                estado=estado,
                departamento=departamento,
            )
        }
    except ErrorCore as exc:
        raise _error_core(exc) from exc


@app.post("/api/emergencias")
async def crear_emergencia(
    datos: NuevaEmergencia,
    core: ClienteCore = Depends(obtener_core),
):
    try:
        return await core.crear_emergencia(datos.model_dump(exclude_none=True))
    except ErrorCore as exc:
        raise _error_core(exc) from exc


@app.get("/api/emergencias/{identificador}")
async def obtener_emergencia(
    identificador: str,
    core: ClienteCore = Depends(obtener_core),
):
    try:
        return await core.obtener_emergencia(identificador)
    except ErrorCore as exc:
        raise _error_core(exc) from exc


@app.post("/api/emergencias/{identificador}/atender")
async def atender_emergencia(
    identificador: str,
    datos: AtenderSolicitud,
    core: ClienteCore = Depends(obtener_core),
):
    try:
        return await core.atender_emergencia(
            identificador,
            datos.departamento,
            datos.atendida,
        )
    except ErrorCore as exc:
        raise _error_core(exc) from exc


@app.patch("/api/emergencias/{identificador}")
async def actualizar_emergencia(
    identificador: str,
    datos: AtenderSolicitud,
    core: ClienteCore = Depends(obtener_core),
):
    try:
        return await core.atender_emergencia(
            identificador,
            datos.departamento,
            datos.atendida,
        )
    except ErrorCore as exc:
        raise _error_core(exc) from exc


@app.get("/api/unidades")
async def listar_unidades(core: ClienteCore = Depends(obtener_core)):
    try:
        return {"unidades": await core.listar_unidades()}
    except ErrorCore as exc:
        raise _error_core(exc) from exc


@app.post("/api/unidades")
async def registrar_unidad(datos: dict, core: ClienteCore = Depends(obtener_core)):
    try:
        return await core.registrar_unidad(datos)
    except ErrorCore as exc:
        raise _error_core(exc) from exc


@app.post("/api/unidades/{identificador}/liberar")
async def liberar_unidad(
    identificador: str,
    core: ClienteCore = Depends(obtener_core),
):
    try:
        return await core.liberar_unidad(identificador)
    except ErrorCore as exc:
        raise _error_core(exc) from exc


@app.post("/api/operaciones/reiniciar")
async def reiniciar_operaciones(core: ClienteCore = Depends(obtener_core)):
    try:
        return await core.reiniciar()
    except ErrorCore as exc:
        raise _error_core(exc) from exc


@app.middleware("http")
async def medir_tiempo(request: Request, call_next):
    inicio = time.perf_counter()
    respuesta = await call_next(request)
    respuesta.headers["X-Tiempo-Ms"] = str(int((time.perf_counter() - inicio) * 1000))
    respuesta.headers["Cache-Control"] = "no-store"
    return respuesta

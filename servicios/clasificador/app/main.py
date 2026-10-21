from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .clasificacion import PROVEEDORES_VALIDOS, ServicioClasificacion
from .config import Configuracion, obtener_configuracion
from .decisiones import ErrorProveedor
from .esquemas import (
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


def obtener_servicio(request: Request) -> ServicioClasificacion:
    return request.app.state.servicio


def obtener_whisper(request: Request) -> ClienteWhisper:
    return request.app.state.whisper


def obtener_config(request: Request) -> Configuracion:
    return request.app.state.configuracion


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


@app.get("/")
async def raiz():
    return {
        "servicio": "clasificador de emergencias",
        "version": "1.0.0",
        "endpoints": [
            "POST /clasificar",
            "POST /procesar-audio",
            "POST /transcribir",
            "GET /salud",
            "POST /calentar",
        ],
    }


@app.get("/salud", response_model=RespuestaSalud)
async def salud(
    servicio: ServicioClasificacion = Depends(obtener_servicio),
    whisper: ClienteWhisper = Depends(obtener_whisper),
    configuracion: Configuracion = Depends(obtener_config),
):
    estado_servicio = servicio.estado()
    whisper_listo = await whisper.salud()
    detalles: list[str] = []

    if not whisper_listo:
        detalles.append("whisper.cpp no responde; la voz no estará disponible.")
    if configuracion.proveedor == "laya" and not estado_servicio["laya_instalado"]:
        detalles.append("Laya no está instalado; se usará el clasificador de reglas.")
    if configuracion.proveedor == "jev" and not configuracion.openrouter_api_key:
        detalles.append("OPENROUTER_API_KEY no configurada para Jev.")

    return RespuestaSalud(
        estado="degradado" if detalles else "ok",
        proveedor=configuracion.proveedor,
        laya_instalado=estado_servicio["laya_instalado"],
        laya_listo=estado_servicio["laya_listo"],
        whisper_listo=whisper_listo,
        modelo_laya=configuracion.laya_modelo,
        modelo_jev=configuracion.jev_modelo,
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


@app.middleware("http")
async def medir_tiempo(request: Request, call_next):
    inicio = time.perf_counter()
    respuesta = await call_next(request)
    respuesta.headers["X-Tiempo-Ms"] = str(int((time.perf_counter() - inicio) * 1000))
    return respuesta

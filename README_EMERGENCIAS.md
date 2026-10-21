# Sistema de gestión de emergencias

> Guía rápida para compañeros y conexión del frontend: [`README.md`](README.md).

Extensión del proyecto de estructuras de datos para recibir emergencias por texto o voz,
clasificarlas en **gravedad** y **organismo responsable**, y encolarlas en las colas de
prioridad existentes (`GestorDepartamentos`).

El código original no se modificó. Toda la funcionalidad nueva vive en archivos nuevos.

## Arquitectura

```
Consola C++ (src/ui/main_emergencias.cpp)
  |  texto / archivo de audio / micrófono
  v
ClienteClasificador (cpp-httplib + nlohmann/json)
  |  HTTP
  v
Servicio Python FastAPI (servicios/clasificador)
  |-- Laya local (modelo multilingual)  -> decisión local
  |-- Jev vía OpenRouter                -> decisión remota
  |-- Clasificador de reglas            -> respaldo determinista
  |  HTTP
  v
whisper.cpp (whisper-server)  <- audio
  |
  v
GestorDepartamentos (colas de prioridad existentes)
```

- La consola C++ mantiene una **cola FIFO de entrada** con textos y audios sin clasificar.
- Al procesar una solicitud, el servicio responde con severidad, departamentos y confianza.
- El C++ genera datos sintéticos del reportante: nombre, cédula, teléfono y coordenadas.
- La emergencia se registra en la cola de prioridad de cada departamento seleccionado.
- `atenderSiguiente` sigue usando el `GestorDepartamentos` original.

## Clasificación

Proveedores:

| Proveedor | Dónde corre | Requisitos |
|---|---|---|
| `laya` | Contenedor Python | `WITH_LAYA=1`, descarga del checkpoint la primera vez |
| `jev` | OpenRouter | `OPENROUTER_API_KEY` y saldo en OpenRouter |
| `reglas` | Contenedor Python | Ninguno; respaldo local |

La clasificación usa preguntas tipadas de System One (`choice`, `score`, `noul`), no
generación de texto:

- `departamento_principal`: elección entre **bomberos**, **policia**, **ambulancia** y
  **defensa_civil**. Se eliminó `transito`.
- `severidad`: escala ordenada de 5 niveles.
- `apoyo_bomberos`, `apoyo_policia`, `apoyo_ambulancia`, `apoyo_defensa_civil`: preguntas
  sí/no para decidir qué otros organismos deben responder.

### Gravedad y prioridad

| Severidad | Etiqueta | Prioridad en la cola |
|---|---|---|
| 1 | Crítica | 1 (se atiende primero) |
| 2 | Alta | 2 |
| 3 | Media | 3 |
| 4 | Baja | 4 |
| 5 | Informativa | 5 |

La prioridad se copia directamente al `Usuario`; el comparador existente
(`prioridad > otra`) ya hace que el número menor salga primero.

### Diseño del prompt

Las instrucciones están en `servicios/clasificador/app/prompts.py` y buscan reducir errores
típicos de clasificación:

- Separan una emergencia real de bromas, pruebas, noticias, preguntas o recuerdos del pasado.
- Respetan negaciones: "no hay heridos" no activa ambulancia.
- Distinguen menciones de hechos: "mi papá es bombero" no es un incendio.
- Piden clasificar la situación más urgente cuando el relato contiene varias.
- Definen criterios con ejemplos y exclusiones para cada organismo.
- Usan una escala de gravedad con ejemplos concretos.
- Solo elevan la gravedad ante riesgo plausible para la vida, para evitar falsos positivos.
- El umbral de apoyo (`UMBRAL_APOYO`) decide si un segundo organismo se agrega a la cola.
- Si la confianza es menor a `CONFIANZA_MINIMA`, la respuesta se marca para revisión humana.

Laya y Jev reciben contextos distintos:

- **Laya** recibe únicamente el texto limpio y preguntas cortas. En pruebas, si se le pasaban
  las reglas y los ejemplos largos, confundía esas palabras con la emergencia.
- **Jev** recibe el contexto completo con reglas, definiciones y ejemplos.

Además, `app/guardarrailes.py` corrige errores evidentes después del modelo:

- Un incendio con persona atrapada se fuerza a severidad 1 y agrega ambulancia.
- Una denuncia de "ayer" se baja a severidad 4.
- Una inundación se asigna a defensa civil, no a bomberos.
- Un choque sin heridos no activa ambulancia.
- Una broma, prueba o consulta explícita se marca como informativa.
- Si el modelo no encuentra evidencia clara y tiene confianza muy baja, la emergencia queda
  en defensa civil con severidad 4 y revisión humana.

El clasificador de reglas también se usa como respaldo cuando el proveedor falla o cuando se
selecciona explícitamente.


## Requisitos

- Docker Desktop con Compose (recomendado), o
- CMake 3.20+, compilador C++17 y Python 3.10+ para ejecutar por separado.

## Inicio rápido con Docker

```powershell
Copy-Item .env.example .env
# Edita .env si vas a usar Jev: OPENROUTER_API_KEY=sk-or-...
docker compose up -d --build whisper-modelos whisper clasificador
```

La primera ejecución:

1. Descarga `ggml-small.bin` para whisper.cpp (modelo configurable con `WHISPER_MODEL`).
2. Construye el clasificador. Con `WITH_LAYA=1` instala torch CPU y Laya (imagen pesada).
3. Descarga el checkpoint de Laya la primera vez que se clasifica (se guarda en el volumen
   `hf_cache`).

Para precargar Laya sin esperar en la primera petición:

```powershell
.\scripts\calentar_laya.ps1
```

Comprobar el servicio:

```powershell
curl.exe http://127.0.0.1:8100/salud
```

Ejecutar la consola dentro de Docker (perfil `app`):

```powershell
docker compose --profile app run --rm app
```

Nota: dentro de Docker no hay acceso al micrófono del host. Usa archivos de audio o ejecuta
la consola en Windows para grabar.

## Compilar y ejecutar la consola en Windows

```powershell
cmake --preset mingw
cmake --build --preset mingw -j 4
.\build\sistema_emergencias.exe
```

También se conserva el ejecutable de la práctica original:

```powershell
.\build\demo_colas.exe
```

Variables útiles:

```powershell
$env:CLASIFICADOR_URL = "http://127.0.0.1:8100"
$env:PROVEEDOR_CLASIFICACION = "laya"   # laya | jev | reglas
$env:DIRECTORIO_AUDIOS = "audios"
```

Si no defines esas variables, la consola lee los valores de `.env` en el directorio actual.

## API del clasificador

### `POST /clasificar`

```powershell
curl.exe -X POST http://127.0.0.1:8100/clasificar `
  -H "Content-Type: application/json" `
  -d '{"texto":"Se está incendiando un apartamento y hay una persona atrapada","proveedor":"laya"}'
```

Respuesta:

```json
{
  "texto": "Se está incendiando un apartamento y hay una persona atrapada",
  "transcripcion": null,
  "severidad": 1,
  "severidad_etiqueta": "Crítica",
  "departamento_principal": "bomberos",
  "departamentos": ["bomberos", "ambulancia"],
  "confianza": 0.91,
  "requiere_revision": false,
  "proveedor": "laya",
  "modelo": "laya-multilingual",
  "advertencia": null,
  "latencia_ms": 180
}
```

### `POST /procesar-audio`

Multipart con `archivo` y, opcionalmente, `proveedor`.

```powershell
curl.exe -X POST http://127.0.0.1:8100/procesar-audio `
  -F "archivo=@audios/emergencia.wav" `
  -F "proveedor=laya"
```

### `POST /transcribir`

Solo devuelve la transcripción:

```powershell
curl.exe -X POST http://127.0.0.1:8100/transcribir -F "archivo=@audios/emergencia.wav"
```

### `GET /salud`

Estado de Laya, whisper.cpp y configuración activa.

### `POST /calentar`

Fuerza la carga del modelo de Laya en memoria.

## Uso de la consola

1. Encolar texto.
2. Encolar un audio existente.
3. Grabar hasta 30 segundos con el micrófono y encolar.
4. Procesar el siguiente elemento de la cola de entrada.
5. Procesar todos los pendientes.
6. Atender la emergencia más urgente de un departamento.
7. Ver qué colas tienen emergencias.
8. Cambiar entre `laya`, `jev` y `reglas`.
9. Listar micrófonos disponibles.

Cada emergencia procesada muestra el texto o transcripción, severidad, departamentos,
confianza, proveedor, modelo, datos sintéticos del reportante y coordenadas.

## Configuración

| Variable | Defecto | Descripción |
|---|---|---|
| `PROVEEDOR` | `laya` | Proveedor principal |
| `FALLBACK_REGLAS` | `true` | Usar reglas si el proveedor falla |
| `CONFIANZA_MINIMA` | `0.55` | Umbral para marcar revisión humana |
| `UMBRAL_APOYO` | `0.55` | Probabilidad mínima para sumar un departamento de apoyo |
| `LAYA_MODEL` | `multilingual` | Checkpoint de Laya |
| `LAYA_PRELOAD` | `false` | Cargar Laya al iniciar el contenedor |
| `LAYA_MAX_LEN` | `1024` | Tokens máximos para Laya |
| `OPENROUTER_API_KEY` | vacío | Clave para Jev |
| `JEV_MODEL` | `typesafe/jev-1.14` | Modelo de decisiones de OpenRouter |
| `WHISPER_MODEL` | `small` | `tiny`, `base`, `small`, `medium`... |
| `WHISPER_LANGUAGE` | `es` | Idioma para whisper.cpp |
| `WITH_LAYA` | `1` | `0` para una imagen solo con Jev/reglas |
| `TIMEOUT_LLM` | `45` | Timeout de clasificación en segundos |
| `TIMEOUT_WHISPER` | `300` | Timeout de transcripción en segundos |

## Pruebas

```powershell
cd servicios\clasificador
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m ruff check app pruebas
```

Las pruebas no descargan modelos ni llaman a OpenRouter: usan reglas, respuestas simuladas y
un cliente Whisper falso.

## Estructura nueva

```
include/model/emergencia.h
include/service/ClienteClasificador.h
include/service/GeneradorDatos.h
include/service/GrabadorAudio.h
include/service/ProcesadorEmergencias.h
src/model/emergencia.cpp
src/service/ClienteClasificador.cpp
src/service/GeneradorDatos.cpp
src/service/GrabadorAudio.cpp
src/service/ProcesadorEmergencias.cpp
src/ui/main_emergencias.cpp
servicios/clasificador/app/clasificacion.py
servicios/clasificador/app/guardarrailes.py
servicios/clasificador/app/prompts.py
servicios/clasificador/app/proveedores/...
servicios/clasificador/...
CMakeLists.txt
CMakePresets.json
Dockerfile
docker-compose.yml
.env.example
scripts/...
```

## Solución de problemas

- **El puerto 8100 está ocupado:** cambia `CLASIFICADOR_PUERTO` y `CLASIFICADOR_URL` en
  `.env` (por ejemplo a `8200`), ejecuta de nuevo `docker compose up -d clasificador` y
  arranca la consola. La consola lee `.env` aunque se ejecute desde `build\`.
- **La primera clasificación con Laya tarda:** está descargando el checkpoint. Usa
  `POST /calentar` o `LAYA_PRELOAD=true`; el volumen `hf_cache` evita repetir la descarga.
- **La imagen del clasificador es muy grande:** compila con `WITH_LAYA=0` y usa
  `PROVEEDOR=jev` o `PROVEEDOR=reglas`.
- **Jev responde 401/402:** revisa `OPENROUTER_API_KEY` y el saldo de OpenRouter.
- **Whisper no encuentra el modelo:** ejecuta de nuevo `whisper-modelos` o descarga con
  `scripts/descargar_modelo_whisper.ps1`.
- **No hay micrófono en Docker:** graba en el host y sube el archivo; Docker Desktop en
  Windows no expone el micrófono de forma sencilla.
- **El audio no se transcribe:** usa WAV/MP3/M4A/OGG/FLAC y verifica que whisper.cpp tenga
  ffmpeg (la imagen oficial lo incluye con `--convert`).
- **Los acentos se ven mal en Windows:** la consola configura UTF-8 al iniciar; si usas otra
  terminal, ejecuta `chcp 65001`.
- **Teléfonos y coordenadas:** son datos sintéticos generados en C++, no una geolocalización
  real ni datos personales.

## Seguridad

- No subas `.env` al repositorio.
- La API key de OpenRouter se usa solo en el contenedor del clasificador.
- El servicio acepta archivos de audio: en producción limita tamaño, formatos y acceso a la
  red; este proyecto está pensado para demostración académica.

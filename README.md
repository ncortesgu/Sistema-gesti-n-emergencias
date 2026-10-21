# Sistema de gestión de emergencias

Extensión del proyecto de estructuras de datos para recibir emergencias por **texto** o
**voz**, clasificarlas por **gravedad** y **organismo responsable**, y encolarlas en las
colas de prioridad existentes (`GestorDepartamentos`).

El código de la práctica se adaptó a la última versión de `Usuario` y a la nueva clase
`coordenadas` (X/Y). `GestorDepartamentos` conserva su lógica de colas de prioridad. La guía
técnica ampliada está en [`README_EMERGENCIAS.md`](README_EMERGENCIAS.md).

## Qué se insertó

### C++

| Archivo | Función |
|---|---|
| `include/model/emergencia.h`, `src/model/emergencia.cpp` | Registro de una emergencia: texto, transcripción, severidad, departamentos, confianza, teléfono y coordenadas X/Y |
| `include/service/ClienteClasificador.h`, `src/service/ClienteClasificador.cpp` | Cliente HTTP con `cpp-httplib` + `nlohmann/json` |
| `include/service/GeneradorDatos.h`, `src/service/GeneradorDatos.cpp` | Teléfono y coordenadas X/Y aleatorias del reportante |
| `include/service/ProcesadorEmergencias.h`, `src/service/ProcesadorEmergencias.cpp` | Cola FIFO de entrada, clasificación, enriquecimiento y registro en las colas por departamento |
| `include/service/GrabadorAudio.h`, `src/service/GrabadorAudio.cpp` | Grabación del micrófono a WAV 16 kHz mono con miniaudio |
| `src/ui/main_emergencias.cpp` | Consola nueva con menú de texto, audio, micrófono, colas y atención |
| `CMakeLists.txt`, `CMakePresets.json` | Compilación del proyecto y del ejecutable nuevo |

### Servicio Python (`servicios/clasificador/`)

| Archivo | Función |
|---|---|
| `app/main.py` | API FastAPI y endpoints HTTP |
| `app/prompts.py` | Preguntas y criterios para Laya y Jev |
| `app/proveedores/laya.py` | Clasificación local con Laya |
| `app/proveedores/jev.py` | Clasificación remota con Jev/OpenRouter |
| `app/proveedores/reglas.py` | Clasificador determinista de respaldo |
| `app/guardarrailes.py` | Corrección de errores evidentes después del modelo |
| `app/whisper.py` | Cliente HTTP hacia whisper.cpp |
| `app/esquemas.py`, `app/config.py`, `app/decisiones.py` | Contratos, configuración y mapeo de respuestas |
| `pruebas/` | 40 pruebas automáticas sin descargar modelos ni llamar a OpenRouter |

### Docker y utilidades

- `Dockerfile`: imagen de la consola C++.
- `servicios/clasificador/Dockerfile`: imagen del clasificador con Laya + torch CPU.
- `docker-compose.yml`: Whisper, clasificador y consola opcional.
- `.env.example`: configuración de ejemplo.
- `scripts/`: descarga del modelo Whisper y calentamiento de Laya.
- `README_EMERGENCIAS.md`: documentación técnica detallada.

### Qué cambió del código original

Se adaptó `main.cpp` y la integración de las clases nuevas al cambio de `Usuario`: ya no
existen `nombre` ni `cedula`, y la ubicación se guarda con la clase `coordenadas` (X/Y).
También se agregaron líneas a `.gitignore` para excluir `build/`, `.env`, audios, modelos y
entornos virtuales. `GestorDepartamentos` mantiene su funcionamiento original.

La clase `coordenadas` vive en `include/model/coordenadas.h` y `src/model/coordenadas.cpp`.
Nuestro modelo `Emergencia` también almacena `coordenadas` y teléfono, no nombre ni documento.

## Arquitectura

```
Consola C++ / frontend
        |
        | HTTP (texto o audio)
        v
Clasificador FastAPI (puerto host 8100)
   |-- Laya local (modelo multilingual)
   |-- Jev por OpenRouter (opcional)
   |-- Reglas deterministas (respaldo)
   |
   | HTTP
   v
whisper.cpp (solo para audio)
        |
        v
Respuesta: severidad 1-5 + departamentos + confianza
        |
        v
C++ genera datos sintéticos del reportante
        |
        v
GestorDepartamentos (colas de prioridad existentes)
```

## Requisitos

- Docker Desktop con Docker Compose, o
- CMake 3.20+, compilador C++17, Python 3.10+ y conexión a internet para compilar/descargar
  dependencias.
- Para la primera ejecución: espacio en disco y buena conexión. Se descargan la imagen de
  torch/Laya, el modelo Whisper `small` (unos 465 MB) y el checkpoint de Laya.

## Puesta en marcha para compañeros

### 1. Preparar el entorno

```powershell
Copy-Item .env.example .env
```

Revisa `.env`. Por defecto el clasificador queda publicado en el puerto **8100** del host.
Si ese puerto está ocupado, cambia `CLASIFICADOR_PUERTO` y `CLASIFICADOR_URL` al mismo puerto,
por ejemplo `8200`.

Para usar Jev, agrega tu clave:

```env
OPENROUTER_API_KEY=sk-or-...
PROVEEDOR=jev
```

Si no hay clave, deja `PROVEEDOR=laya` o `PROVEEDOR=reglas`.

### 2. Levantar Whisper y el clasificador

```powershell
docker compose up -d --build whisper-modelos whisper clasificador
docker compose ps
```

La primera vez:

1. `whisper-modelos` descarga `ggml-small.bin` y termina.
2. `whisper` arranca y carga el modelo.
3. `clasificador` construye la imagen con Laya y torch CPU. Puede tardar varios minutos.
4. El checkpoint de Laya se descarga la primera vez que se clasifica o se llama a
   `POST /calentar`.

Comprobar que todo está arriba:

```powershell
curl.exe http://127.0.0.1:8100/salud
```

Respuesta esperada:

```json
{
  "estado": "ok",
  "proveedor": "laya",
  "laya_instalado": true,
  "laya_listo": true,
  "whisper_listo": true,
  "modelo_laya": "multilingual",
  "modelo_jev": "typesafe/jev-1.14",
  "detalle": null
}
```

Si `laya_listo` está en `false`, ejecuta:

```powershell
curl.exe -X POST http://127.0.0.1:8100/calentar
```

La primera carga puede tardar varios minutos; después queda en caché.

### 3. Compilar y abrir la consola

```powershell
cmake --preset mingw
cmake --build --preset mingw -j 4
.\build\sistema_emergencias.exe
```

Si usas Visual Studio o Linux, compila con CMake normalmente:

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
./build/sistema_emergencias
```

La consola lee `.env` desde la carpeta actual o sus carpetas superiores. Si no lo encuentra,
usa `http://127.0.0.1:8100` por defecto.

### 4. Alternativa: consola dentro de Docker

```powershell
docker compose --profile app run --rm app
```

Dentro de Docker no hay acceso al micrófono del host. Para voz, usa un archivo o ejecuta la
consola en Windows.

## Cómo probarlo sin frontend

### Probar texto por HTTP

```powershell
curl.exe -X POST http://127.0.0.1:8100/clasificar `
  -H "Content-Type: application/json" `
  -d '{"texto":"Se esta incendiando un apartamento y hay una persona atrapada","proveedor":"laya"}'
```

Respuesta esperada (resumida):

```json
{
  "severidad": 1,
  "severidad_etiqueta": "Crítica",
  "departamento_principal": "bomberos",
  "departamentos": ["bomberos", "ambulancia"],
  "confianza": 0.72,
  "requiere_revision": false,
  "proveedor": "laya",
  "modelo": "laya-multilingual"
}
```

### Probar audio por HTTP

```powershell
curl.exe -X POST http://127.0.0.1:8100/procesar-audio `
  -F "archivo=@audios/emergencia.wav" `
  -F "proveedor=laya"
```

También puedes transcribir sin clasificar:

```powershell
curl.exe -X POST http://127.0.0.1:8100/transcribir `
  -F "archivo=@audios/emergencia.wav"
```

### Probar desde la consola

1. Opción `1`: escribe la emergencia.
2. Opción `4`: procesa la cola de entrada.
3. Opción `6`: atiende la emergencia más urgente de un departamento.
4. Opción `7`: muestra qué colas tienen pendientes.
5. Opción `9`: lista micrófonos disponibles.
6. Opción `8`: cambia entre `laya`, `jev` y `reglas`.

### Casos de prueba recomendados

| Texto | Severidad | Departamento principal | También |
|---|---|---|---|
| `Se está incendiando un apartamento y hay una persona atrapada` | 1 | bomberos | ambulancia |
| `Hay un hombre con un cuchillo amenazando a la gente` | 2 | policia | — |
| `Me robaron el celular ayer` | 4 | policia | — |
| `Mi mamá se desmayó y no responde` | 1 | ambulancia | — |
| `Es una broma, no pasa nada` | 5 | defensa_civil | — |
| `Hay humo en el pasillo, no hay fuego` | 2 | bomberos | — |
| `Se inundó todo el barrio` | 2 | defensa_civil | — |
| `Chocaron dos motos, nadie salió herido` | 3 | policia | — |

La prioridad en la cola usa directamente la severidad: **1 se atiende primero**.

## Cómo debería conectarse el frontend

### Lo importante

El frontend debe hablar con el **clasificador FastAPI** en `http://localhost:8100`, no
directamente con Laya, Jev ni whisper.cpp. La API key de OpenRouter queda solo en el
contenedor del clasificador.

La API ya tiene CORS habilitado para desarrollo (`allow_origins=["*"]`). En producción se debe
restringir a los dominios reales.

La API de clasificación **no devuelve teléfono ni coordenadas**. Esos datos se generan en la
consola C++ al encolar la emergencia, usando la clase `coordenadas` (X/Y). Si el frontend
necesita mostrar la ubicación, debe enviarla en su propio flujo o esperar el endpoint de colas
descrito al final de esta sección.

### Variables sugeridas en el frontend

```env
VITE_API_URL=http://localhost:8100
```

```ts
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8100";
```

Si el frontend corre dentro de la misma red de Docker, el host interno es
`http://clasificador:8000`. Desde el navegador del host se usa `http://localhost:8100`.

### Contrato actual de la API

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/salud` | Estado de Laya, Whisper y configuración |
| `POST` | `/clasificar` | Texto → gravedad y departamentos |
| `POST` | `/procesar-audio` | Audio → transcripción + clasificación |
| `POST` | `/transcribir` | Audio → solo texto |
| `POST` | `/calentar` | Forzar carga del modelo Laya |

#### `POST /clasificar`

```json
{
  "texto": "Hay humo en el pasillo, no hay fuego",
  "proveedor": "laya"
}
```

`proveedor` es opcional: `laya`, `jev` o `reglas`.

Tipos TypeScript recomendados:

```ts
export type Departamento =
  | "bomberos"
  | "policia"
  | "ambulancia"
  | "defensa_civil";

export interface Clasificacion {
  texto: string;
  transcripcion: string | null;
  severidad: 1 | 2 | 3 | 4 | 5;
  severidad_etiqueta: string;
  departamento_principal: Departamento;
  departamentos: Departamento[];
  confianza: number;
  requiere_revision: boolean;
  proveedor: "laya" | "jev" | "reglas";
  modelo: string;
  advertencia: string | null;
  latencia_ms: number;
}
```

#### `POST /procesar-audio`

Es `multipart/form-data` con los campos:

- `archivo`: archivo de audio (`.wav`, `.mp3`, `.m4a`, `.ogg`, `.flac`, `.webm`, `.aac`).
- `proveedor`: opcional.

```ts
async function procesarAudio(archivo: File): Promise<Clasificacion> {
  const datos = new FormData();
  datos.append("archivo", archivo);
  datos.append("proveedor", "laya");

  const respuesta = await fetch(`${API_URL}/procesar-audio`, {
    method: "POST",
    body: datos,
  });

  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => ({}));
    throw new Error(error.detail ?? `Error HTTP ${respuesta.status}`);
  }

  return respuesta.json();
}
```

No agregues manualmente `Content-Type: multipart/form-data`; el navegador debe generar el
boundary.

#### Ejemplo de clasificación de texto

```ts
async function clasificarTexto(texto: string): Promise<Clasificacion> {
  const respuesta = await fetch(`${API_URL}/clasificar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto, proveedor: "laya" }),
  });

  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => ({}));
    throw new Error(error.detail ?? `Error HTTP ${respuesta.status}`);
  }

  return respuesta.json();
}
```

#### Mostrar el resultado

```tsx
function TarjetaEmergencia({ resultado }: { resultado: Clasificacion }) {
  const etiqueta = `Severidad ${resultado.severidad} (${resultado.severidad_etiqueta})`;

  return (
    <article>
      <h2>{etiqueta}</h2>
      <p>Organismos: {resultado.departamentos.join(", ")}</p>
      <p>Confianza: {(resultado.confianza * 100).toFixed(0)}%</p>
      {resultado.requiere_revision && <strong>Requiere revisión humana</strong>}
      {resultado.transcripcion && <p>Transcripción: {resultado.transcripcion}</p>}
    </article>
  );
}
```

### Estados y errores que debe manejar el frontend

- `GET /salud` tarda o devuelve `laya_listo: false`: el modelo se está cargando. Muestra un
  estado de “cargando” y permite reintentar.
- `400`: proveedor inválido.
- `413`: audio demasiado grande (límite por defecto 30 MB).
- `415`: formato de audio no soportado.
- `422`: texto demasiado corto o archivo vacío.
- `503`: Laya/Whisper/OpenRouter no disponible. Muestra el `detail`.
- La clasificación puede tardar varios segundos en CPU. Usa un spinner o estado de carga.

### Limitación actual importante: la cola no está expuesta al frontend

La cola de prioridad vive en el proceso C++ (`GestorDepartamentos`) y la consola la mantiene
en memoria. El clasificador Python **solo clasifica**; no conoce ni modifica las colas del
C++.

Por eso, hoy un frontend puede:

1. Enviar texto o audio al clasificador.
2. Mostrar severidad, departamentos, confianza y revisión.
3. Usar la consola C++ para encolar y atender emergencias.

Pero **no puede leer ni atender las colas del C++ por HTTP todavía**, porque esa parte no está
expuesta.

Para una integración completa del frontend con la cola hay dos caminos:

- **Recomendado para la práctica:** agregar un pequeño servidor HTTP al C++ (por ejemplo
  `ServidorEmergencias`) que envuelva `ProcesadorEmergencias` y exponga:
  - `POST /api/emergencias` (texto o audio)
  - `GET /api/colas`
  - `POST /api/colas/{departamento}/atender`
  - `GET /api/emergencias/{id}`

  Luego el frontend llama a ese servidor en lugar de llamar directamente al clasificador.

- **Alternativa:** mover la lógica de `GestorDepartamentos` al servicio Python. No es lo
  ideal para esta práctica porque la cola de prioridad en C++ es el núcleo del trabajo de
  estructuras de datos.

Mientras eso no se implemente, el frontend debe presentarse como una vista de clasificación y
la consola como el simulador de colas y atención.

## Configuración

| Variable | Defecto | Descripción |
|---|---|---|
| `PROVEEDOR` | `laya` | `laya`, `jev` o `reglas` |
| `FALLBACK_REGLAS` | `true` | Usar reglas si el proveedor falla |
| `CONFIANZA_MINIMA` | `0.55` | Umbral para marcar revisión humana |
| `UMBRAL_APOYO` | `0.55` | Probabilidad mínima para sumar un departamento de apoyo |
| `LAYA_MODEL` | `multilingual` | Checkpoint de Laya |
| `LAYA_PRELOAD` | `false` | Cargar Laya al iniciar el contenedor |
| `LAYA_MAX_LEN` | `1024` | Tokens máximos de Laya |
| `OPENROUTER_API_KEY` | vacío | Clave para Jev |
| `JEV_MODEL` | `typesafe/jev-1.14` | Modelo de decisiones de OpenRouter |
| `WHISPER_MODEL` | `small` | `tiny`, `base`, `small`, `medium`... |
| `WHISPER_LANGUAGE` | `es` | Idioma de whisper.cpp |
| `WITH_LAYA` | `1` | `0` para una imagen sin Laya (solo Jev/reglas) |
| `CLASIFICADOR_PUERTO` | `8100` | Puerto del clasificador en el host |
| `CLASIFICADOR_URL` | `http://127.0.0.1:8100` | URL que usa la consola C++ |
| `DIRECTORIO_AUDIOS` | `audios` | Carpeta para grabaciones |

## Pruebas automáticas

```powershell
cd servicios\clasificador
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m ruff check app pruebas
```

Resultado esperado: `40 passed` y `All checks passed!`.

Las pruebas no descargan Laya ni llaman a OpenRouter. Usan reglas, proveedores simulados y un
Whisper falso.

## Problemas comunes

- **Docker no responde:** abre Docker Desktop y espera a que el motor termine de iniciar.
- **El puerto 8100 está ocupado:** cambia `CLASIFICADOR_PUERTO` y `CLASIFICADOR_URL` en
  `.env`, y reinicia el clasificador con `docker compose up -d clasificador`.
- **La consola no conecta:** verifica `docker compose ps` y que `.env` tenga la URL correcta.
  La consola también busca `.env` en carpetas superiores, así que funciona desde `build\`.
- **Laya tarda la primera vez:** está descargando el checkpoint. Llama a `POST /calentar` y
  espera; el volumen `hf_cache` evita repetir la descarga.
- **Jev responde 401/402:** revisa `OPENROUTER_API_KEY` y el saldo de OpenRouter.
- **Whisper no transcribe:** verifica que el contenedor `whisper` esté `healthy` y que el
  archivo sea de audio válido. La imagen incluye ffmpeg para convertir formatos.
- **No hay micrófono en Docker:** graba en Windows y sube el archivo, o ejecuta la consola
  fuera de Docker.
- **Acentos raros en la terminal:** ejecuta `chcp 65001` o usa Windows Terminal; la consola
  configura UTF-8 al iniciar.
- **Teléfono y coordenadas X/Y:** son datos sintéticos generados en C++, no geolocalización
  real. La API de Python devuelve la clasificación; la ubicación se asigna en la consola C++
  al encolar la emergencia. Las coordenadas usan la clase `coordenadas` de tu compañero y se
  generan en una cuadrícula simulada de 0 a 1000.

## Diseño de la clasificación

- **Severidad 1:** crítica, riesgo actual de muerte o lesión grave.
- **Severidad 2:** alta, requiere atención inmediata.
- **Severidad 3:** media, emergencia contenida.
- **Severidad 4:** baja, hecho pasado o sin riesgo actual.
- **Severidad 5:** informativa, no es una emergencia.
- Departamentos posibles: `bomberos`, `policia`, `ambulancia`, `defensa_civil`.
- No se incluye `transito`: los accidentes viales sin heridos se asignan a `policia` y los
  que tienen heridos a `ambulancia` (con `policia` como apoyo si aplica).
- Laya recibe texto limpio y preguntas cortas; Jev recibe el contexto completo.
- Los guardarraíles deterministas corrigen casos evidentes: incendio con atrapado, robo del
  pasado, inundación, choque sin heridos, bromas y consultas informativas.
- Si la confianza es muy baja y no hay evidencia clara, la emergencia queda en
  `defensa_civil`, severidad 4 y revisión humana.

## Seguridad

- No subas `.env` al repositorio.
- La API no tiene autenticación: es una demo académica. No la publiques directamente en
  internet.
- La API key de OpenRouter se usa solo en el contenedor del clasificador.
- En un despliegue real, restringe CORS, limita el tamaño y los formatos de audio, y añade
  autenticación y rate limiting.

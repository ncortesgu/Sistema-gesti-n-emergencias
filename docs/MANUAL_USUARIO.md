# Manual de usuario — Sistema de Gestión de Emergencias (SGE)

> Guía práctica para usar el sistema: qué hace cada pantalla, cómo se reporta una
> emergencia, cómo se atienden las colas y qué significa cada dato.
> Para el detalle técnico de las estructuras de datos ver
> [ESTRUCTURAS_DATOS.md](ESTRUCTURAS_DATOS.md).

---

## 1. Qué es el sistema

El SGE recibe reportes de emergencias **por texto o por voz**, los clasifica
automáticamente (gravedad + organismo responsable) y los coloca en la **cola de prioridad**
del departamento correspondiente:

| Severidad | Etiqueta | Prioridad en la cola |
|---|---|---|
| 1 | Crítica | 1 — se atiende **primero** |
| 2 | Alta | 2 |
| 3 | Media | 3 |
| 4 | Baja | 4 |
| 5 | Informativa | 5 |

Departamentos: **bomberos**, **policia**, **ambulancia**, **defensa_civil**.

El sistema tiene dos interfaces:

- **Panel web** (recomendado): `http://localhost:8100/` — se abre en el navegador.
- **Consola C++** (alternativa): programa de terminal con menú de opciones.

---

## 2. Puesta en marcha

### Opción A — Docker (todo junto)

```powershell
Copy-Item .env.example .env
docker compose up -d --build whisper-modelos core whisper clasificador
docker compose ps
```

La primera vez se descargan el modelo Whisper (`small`, ~465 MB) y el checkpoint de Laya.
Verifique que todo está arriba consultando el estado:

```powershell
curl.exe http://127.0.0.1:8100/salud
```

Respuesta esperada:

```json
{
  "estado": "ok",
  "proveedor": "laya",
  "checks": { "clasificador": true, "audio": true, "colas": true, "unidades": true }
}
```

### Opción B — Compilación local

```powershell
cmake --preset mingw
cmake --build --preset mingw -j 4
.\build\sistema_emergencias.exe      # consola
.\build\servidor_emergencias.exe     # motor de colas (API)
```

### Opción C — Solo el panel y el motor, sin Docker

```powershell
cd servicios\clasificador
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8100
```

En otra terminal, el motor C++ con las colas:

```powershell
.\build\servidor_emergencias.exe
```

---

## 3. Guía del panel web

El panel se sirve desde el propio clasificador: la raíz (`http://localhost:8100/`) redirige
a `/panel/`. Todas las llamadas van al mismo origen, así que no hay problemas de CORS.

Barra lateral (5 secciones):

| Sección | Para qué sirve |
|---|---|
| **Estado** | Semáforo de salud: clasificador, audio, colas y unidades. Botón de precalentar Laya. |
| **Ingreso** | Reportar una emergencia por texto, audio o micrófono. |
| **Colas** | Cola operativa por departamento, ordenada por prioridad. Botón «Atender». |
| **Mapa** | Cuadrícula X/Y (0–1000) con los reportes y las unidades. |
| **Historial** | Clasificaciones guardadas en este navegador. |

### 3.1 Reportar una emergencia (Ingreso)

1. Abra **Ingreso**.
2. Elija el modo:
   - **Texto**: escriba el relato (mínimo 3 caracteres, máximo 4000).
   - **Audio**: suba un archivo (`.wav`, `.mp3`, `.m4a`, `.ogg`, `.flac`, `.webm`, `.aac`)
     o use el **micrófono** (grabe hasta 120 s).
3. Opcional: indique las **coordenadas X/Y** (enteros entre 0 y 1000). Si no las escribe,
   el sistema genera una ubicación sintética.
4. Pulse **Clasificar**. El sistema devuelve severidad, departamentos, confianza e informe.
5. Revise el resultado:
   - Si aparece el aviso **«Revisión humana recomendada»**, la confianza fue baja: confirme
     los departamentos antes de encolar.
6. Pulse **Encolar en la cola**. El reporte entra en la cola del departamento asignado.

> El micrófono del navegador solo funciona en `localhost` o por HTTPS.

### 3.2 Trabajar las colas (Colas)

- La tabla muestra una fila por emergencia activa, ordenada por **prioridad**: primero la
  más grave. El número de la izquierda (01, 02, …) es el orden de atención.
- **Filtros**: por departamento, por severidad y por texto (busca ID, descripción o unidad).
- Cada fila muestra: severidad, chips de los departamentos, hora, coordenadas, confianza y
  la **unidad asignada** (si el backend asignó alguna).
- **Atender**: marca la emergencia como atendida **en ese departamento**. Atender en
  bomberos no cierra la cola de ambulancia: cada departamento mantiene su propio estado.
  La emergencia desaparece de la vista cuando **todos** sus departamentos la atienden.
- **Detalle**: abre la ficha completa de la emergencia.

### 3.3 Mapa operativo (Mapa)

- Cuadrícula normalizada de **0 a 1000** en X e Y.
- Marcadores de emergencias (ordenados por severidad) y marcadores azules de unidades.
- Filtros de severidad y departamento: solo cambian la vista, no las colas reales.
- Al hacer clic en una unidad se abre su ficha (ID, departamento, estado, coordenadas).

### 3.4 Historial (Historial)

- Lista las clasificaciones guardadas **en este navegador** (no en el servidor).
- Búsqueda por ID, texto o departamento.
- Acciones por registro: **Ver** (detalle), **Reutilizar** (vuelve al ingreso con los datos
  cargados) y **Eliminar**.
- **Vaciar historial** borra todo el historial local. Esta acción no se puede deshacer.
- Se conservan hasta **50** clasificaciones; las más antiguas se descartan solas.

### 3.5 Configuración (enlace ⚙)

- **Conexión**: URL base de la API y rutas. Normalmente se deja vacío porque el panel usa el
  mismo origen.
- **Proveedor**: `laya` (local), `jev` (OpenRouter) o `reglas` (respaldo determinista).
- **Refresco de colas**: cada cuántos segundos se actualizan las colas (10, 12 o 15).
- **Límite de audio**: tamaño máximo del archivo (10, 15, 25 o 30 MB).
- **Unidades**: alta de unidades con ID, departamento, coordenadas, efectividad y
  velocidad. Se guardan en `config/unidades.json` y el motor las carga al arrancar.
- **Historial**: se puede vaciar desde aquí.

> Para que aparezcan unidades en el mapa, registre la flota real en
> `config/unidades.json`. Si el archivo está vacío, el mapa **no inventa** posiciones.

---

## 4. Guía de la consola C++

Ejecute `.\build\sistema_emergencias.exe`. Menú principal:

| Opción | Qué hace |
|---|---|
| `1` | Encolar una emergencia por **texto**. |
| `2` | Encolar una emergencia por **archivo de audio**. |
| `3` | **Grabar** con el micrófono y encolar el audio (8 s por defecto, máximo 30 s). |
| `4` | **Procesar** la siguiente solicitud de la cola de entrada (FIFO). |
| `5` | Procesar **todas** las pendientes de una vez. |
| `6` | **Atender** la emergencia más urgente de un departamento. |
| `7` | Ver el **estado** de las colas (qué departamentos tienen pendientes). |
| `8` | Cambiar el proveedor de clasificación. |
| `9` | Listar **micrófonos** disponibles. |
| `0` | Salir. |

Ejemplo de sesión:

```
Opción: 1
Describe la emergencia: Se está incendiando un apartamento y hay una persona atrapada
Emergencia encolada. Pendientes: 1. Usa la opción 4 o 5 para clasificarla.

Opción: 4                 <- clasifica la primera encolada (orden de llegada)

Opción: 7
Estado de las colas:
 - bomberos: con emergencias
 - ambulancia: con emergencias
 - policia: vacía
 - defensa_civil: vacía
Pendientes por clasificar: 0

Opción: 6                 <- atiende la más grave de un departamento
Elige el número o el nombre: 1
>>> ATENDIENDO EN bomberos (prioridad 1)
```

> La consola es un proceso independiente: mantiene **su propia** instancia de las colas. Para
> una única fuente de verdad use el panel web junto con el motor `core`.

---

## 5. API (para integraciones)

Todas las rutas se sirven en `http://localhost:8100`.

### Clasificación

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/salud` | Estado del clasificador, audio, colas y unidades. |
| `POST` | `/clasificar` | Texto → severidad, departamentos, confianza. |
| `POST` | `/procesar-audio` | Audio → transcripción + clasificación. |
| `POST` | `/transcribir` | Audio → solo texto. |
| `POST` | `/calentar` | Fuerza la carga del modelo Laya. |

### Operación (colas y unidades)

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/api/colas` | Emergencias para la vista de colas y el mapa. |
| `POST` | `/api/emergencias` | Encola una emergencia ya clasificada. |
| `GET` | `/api/emergencias` | Lista con filtros `estado` y `departamento`. |
| `GET` | `/api/emergencias/{id}` | Detalle de una emergencia. |
| `POST` | `/api/emergencias/{id}/atender` | Atiende en un departamento (`departamento`, `atendida`). |
| `PATCH` | `/api/emergencias/{id}` | Alternativa de atención. |
| `GET` | `/api/unidades` | Flota de unidades. |
| `POST` | `/api/unidades` | Registra una unidad. |
| `POST` | `/api/unidades/{id}/liberar` | Libera una unidad. |
| `POST` | `/api/operaciones/reiniciar` | Borra las colas y recarga las unidades. |

### Ejemplos

```powershell
# Reportar una emergencia
curl.exe -X POST http://127.0.0.1:8100/api/emergencias `
  -H "Content-Type: application/json" `
  -d '{"texto":"Se esta incendiando un apartamento y hay una persona atrapada","severidad":1,"departamentos":["bomberos","ambulancia"],"x":640,"y":310}'

# Atender en bomberos
curl.exe -X POST http://127.0.0.1:8100/api/emergencias/EMG-1001/atender `
  -H "Content-Type: application/json" `
  -d '{"departamento":"bomberos","atendida":true}'
```

---

## 6. Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| El panel no carga | El clasificador no está arriba | `docker compose ps` y revise `docker compose logs clasificador` |
| `/salud` devuelve `degradado` | Whisper o el motor C++ no responden | Revise los contenedores `whisper` y `core` |
| `laya_listo: false` | El modelo se está descargando/cargando | Espere o llame `POST /calentar` |
| Clasificación incorrecta | El modelo interpretó mal el relato | Use el botón de reporte y marque para revisión humana |
| El micrófono no funciona | Navegador sin permiso o página en HTTP | Use `localhost` o HTTPS y acepte el permiso |
| No hay unidades en el mapa | `config/unidades.json` vacío | Registre unidades desde el panel o edite el archivo y reinicie `core` |
| La consola no conecta | URL del clasificador incorrecta | Verifique `CLASIFICADOR_URL` en `.env` |
| Jev responde 401/402 | Clave o saldo de OpenRouter | Revise `OPENROUTER_API_KEY` y el saldo |
| Se ven acentos raros en la terminal | Codificación de la consola | `chcp 65001` o use Windows Terminal |

---

## 7. Referencias

- Guía técnica: [README_EMERGENCIAS.md](../README_EMERGENCIAS.md)
- Estructuras de datos: [ESTRUCTURAS_DATOS.md](ESTRUCTURAS_DATOS.md)
- Guía de instalación y API: [README.md](../README.md)

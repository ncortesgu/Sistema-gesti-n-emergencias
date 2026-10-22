# Sistema de gestión de emergencias (SGE)

Recibe reportes de emergencias **por texto o voz**, los clasifica automáticamente por
**gravedad** y **organismo responsable**, y los encola en las **colas de prioridad** de cada
departamento (`bomberos`, `policia`, `ambulancia`, `defensa_civil`).

- **Manual de uso:** [`docs/MANUAL_USUARIO.md`](docs/MANUAL_USUARIO.md)
- **Estructuras de datos (qué, por qué y cómo):** [`docs/ESTRUCTURAS_DATOS.md`](docs/ESTRUCTURAS_DATOS.md)
- **Guía técnica:** [`README_EMERGENCIAS.md`](README_EMERGENCIAS.md)

---

## Estructuras de datos (requisito de la práctica)

El proyecto integra **tres estructuras lineales**, elegidas cada una según el problema que
resuelven:

| # | Estructura | Implementación | Dónde está | Para qué sirve |
|---|---|---|---|---|
| 1 | **Cola (FIFO)** | `std::queue` | `include/service/ProcesadorEmergencias.h` | Cola de procesamiento de la **entrada de datos**: los reportes se clasifican en el orden en que llegaron. |
| 2 | **Cola con prioridad** | `std::priority_queue` | `include/service/GestorDepartamentos.h` | Colas operativas **por departamento**: sale primero la emergencia más grave (severidad 1), no la más antigua. |
| 3 | **Arreglo dinámico** | `Array` (JavaScript) | `Panel-de-Emergencias-Pixel/app.js` | **Historial de clasificaciones** del panel: crece con cada reporte y se recorta a 50 entradas en `localStorage`. |

Complemento del mismo tipo en C++: `std::vector<Emergencia>` en `procesarTodas()`
(arreglo dinámico con el lote de emergencias clasificadas).

```
Texto / Audio  →  (1) COLA FIFO (std::queue)        ProcesadorEmergencias.colaEntrada
                       │ clasificar
                       ▼
                (2) COLA CON PRIORIDAD (heap)       GestorDepartamentos.departamentos
                       │ atender
                       ▼
                (3) ARREGLO DINÁMICO (Array JS)      state.history (historial)
```

El detalle del **qué**, el **por qué**, el **cómo**, la complejidad y las alternativas
descartadas está en [`docs/ESTRUCTURAS_DATOS.md`](docs/ESTRUCTURAS_DATOS.md).

### Documentación del proyecto

| Documento | Contenido |
|---|---|
| [`docs/MANUAL_USUARIO.md`](docs/MANUAL_USUARIO.md) | Manual de usuario: instalación, panel web, consola C++, API y problemas frecuentes. |
| [`docs/ESTRUCTURAS_DATOS.md`](docs/ESTRUCTURAS_DATOS.md) | Qué y por qué se eligió cada estructura de datos, y cómo se usa. |
| [`README_EMERGENCIAS.md`](README_EMERGENCIAS.md) | Guía técnica de la integración con el clasificador y el panel. |
| Documentación en línea del código | Comentarios `/** ... */` (estilo Doxygen) en las cabeceras C++ y JSDoc en `app.js`. |

### Uso de herramientas de inteligencia artificial

Por exigencia de la práctica se declara el porcentaje del proyecto desarrollado con ayuda
de herramientas de inteligencia artificial:

**Estimación: ≈ 70 % del proyecto fue desarrollado con asistencia de IA.**

| Componente | Estimación con IA | Aporte manual del equipo |
|---|---|---|
| Modelos y clases base C++ (`model/`) | ~60 % | Modelo de dominio y lógica de prioridad |
| Servicios C++ (`service/`) | ~80 % | Integración con el clasificador y las colas de prioridad |
| Clasificador Python (`servicios/clasificador/`) | ~85 % | Prompts, reglas de negocio y guardarraíles |
| Panel web (`Panel-de-Emergencias-Pixel/`) | ~75 % | Diseño de interfaz, accesibilidad y consistencia visual |
| Documentación | ~90 % | Verificación contra el código real y redacción final |
| Docker, scripts y configuración | ~70 % | Pruebas de integración local y ajustes de puertos |

La estimación se calculó por volumen de código y tiempo de trabajo: se contabilizó como
«IA» el código y el texto generados por el asistente, y como manual la escritura del modelo
de dominio, la integración entre módulos, la depuración, las pruebas (`pytest`), la
compilación con CMake y la decisión de qué estructura usar en cada punto. El equipo revisó
y corrigió personalmente todo el material generado antes de incluirlo.

---

## Arquitectura

```
Panel web (Panel-de-Emergencias-Pixel)      Consola C++
        |  texto / audio / micrófono                |
        v                                          v
FastAPI (servicios/clasificador)             ClienteClasificador
  |-- /panel/  -> sirve el panel             (consola independiente)
  |-- /clasificar / /procesar-audio
  |-- /api/... -> proxy HTTP
  |-- Laya local / Jev / reglas
        |
        v
Motor C++ (core, src/ui/main_servidor.cpp)
  |-- ServicioOperaciones
  |-- GestorDepartamentos   (colas con prioridad)
  |-- GestorRecursos / Unidad
        |
        v
whisper.cpp (whisper-server) <- audio
```

- El panel usa el motor C++ por HTTP; no tiene cola ni datos simulados en el navegador.
- La consola C++ es otro proceso y mantiene su propia instancia de colas.
- Las unidades se cargan desde `config/unidades.json`.

## Componentes principales

| Componente | Función |
|---|---|
| `src/model/` | Modelo de dominio: `Emergencia`, `Usuario`, `Unidad`, `coordenadas`. |
| `src/service/GestorDepartamentos.*` | Colas con prioridad por departamento. |
| `src/service/ProcesadorEmergencias.*` | Cola FIFO de entrada, clasificación y registro en las colas. |
| `src/service/GestorRecursos.*` | Flota de unidades y asignación de la mejor unidad disponible. |
| `src/service/ServicioOperaciones.*` | API de operación del motor C++ (colas, atenciones, unidades). |
| `src/ui/main_servidor.cpp` | Servidor HTTP del motor C++ (`/api/...`). |
| `src/ui/main_emergencias.cpp` | Consola C++ con menú de texto, audio, micrófono y colas. |
| `servicios/clasificador/app/` | API FastAPI, proveedores (Laya, Jev, reglas), guardarraíles y proxy al motor C++. |
| `Panel-de-Emergencias-Pixel/` | Panel web (HTML, CSS y JS) servido por FastAPI. |
| `servicios/clasificador/pruebas/` | 47 pruebas automáticas sin descargar modelos ni llamar a OpenRouter. |

## Requisitos

- Docker Desktop con Docker Compose, **o** CMake 3.20+, compilador C++17 y Python 3.10+.
- La primera ejecución descarga el modelo Whisper `small` (~465 MB) y el checkpoint de Laya.

## Puesta en marcha

### Con Docker

```powershell
Copy-Item .env.example .env
docker compose up -d --build whisper-modelos core whisper clasificador
docker compose ps
curl.exe http://127.0.0.1:8100/salud
```

El panel queda en `http://localhost:8100/` y se sirve desde el mismo FastAPI (no hace falta
otro contenedor ni otro puerto). Editar el panel exige `docker compose build clasificador`;
editar el motor C++, `docker compose build core`.

### Compilación local

```powershell
cmake --preset mingw
cmake --build --preset mingw -j 4
.\build\sistema_emergencias.exe      # consola C++
.\build\servidor_emergencias.exe     # motor de colas (API)
```

El panel y el clasificador en local:

```powershell
cd servicios\clasificador
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8100
```

## API

Todas las rutas se sirven en `http://localhost:8100`.

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/salud` | Estado del clasificador, audio, colas y unidades. |
| `POST` | `/clasificar` | Texto → severidad, departamentos y confianza. |
| `POST` | `/procesar-audio` | Audio → transcripción + clasificación. |
| `POST` | `/transcribir` | Audio → solo texto. |
| `POST` | `/calentar` | Fuerza la carga del modelo Laya. |
| `GET` | `/api/colas` | Emergencias para la vista de colas y el mapa. |
| `POST` | `/api/emergencias` | Encola una emergencia clasificada. |
| `GET` | `/api/emergencias` | Lista con filtros `estado` y `departamento`. |
| `GET` | `/api/emergencias/{id}` | Detalle de una emergencia. |
| `POST` | `/api/emergencias/{id}/atender` | Atiende en un departamento. |
| `GET` | `/api/unidades` | Flota de unidades. |
| `POST` | `/api/unidades` | Registra una unidad. |
| `POST` | `/api/unidades/{id}/liberar` | Libera una unidad. |
| `POST` | `/api/operaciones/reiniciar` | Borra las colas y recarga las unidades. |

Ejemplo de reporte:

```powershell
curl.exe -X POST http://127.0.0.1:8100/api/emergencias `
  -H "Content-Type: application/json" `
  -d '{"texto":"Se esta incendiando un apartamento y hay una persona atrapada","severidad":1,"departamentos":["bomberos","ambulancia"],"x":640,"y":310}'
```

La API de clasificación **no devuelve teléfono ni coordenadas**: esos datos se generan en el
motor C++ al encolar la emergencia, en una cuadrícula sintética de 0 a 1000.

## Configuración

| Variable | Defecto | Descripción |
|---|---|---|
| `PROVEEDOR` | `laya` | `laya`, `jev` o `reglas`. |
| `FALLBACK_REGLAS` | `true` | Usar reglas si el proveedor falla. |
| `CONFIANZA_MINIMA` | `0.55` | Umbral para marcar revisión humana. |
| `UMBRAL_APOYO` | `0.55` | Probabilidad mínima para sumar un departamento de apoyo. |
| `LAYA_MODEL` | `multilingual` | Checkpoint de Laya. |
| `OPENROUTER_API_KEY` | vacío | Clave para Jev. |
| `WHISPER_MODEL` | `small` | Modelo de whisper.cpp. |
| `WHISPER_LANGUAGE` | `es` | Idioma de whisper.cpp. |
| `CORE_URL` | `http://127.0.0.1:9000` | URL del motor C++ usada por FastAPI. |
| `CPP_API_PORT` | `9000` | Puerto interno del motor C++. |
| `UNIDADES_FILE` | `/app/config/unidades.json` | Flota de unidades que carga el motor C++. |
| `WITH_LAYA` | `1` | `0` para una imagen sin Laya (solo Jev/reglas). |
| `CLASIFICADOR_PUERTO` | `8100` | Puerto del clasificador en el host. |
| `CLASIFICADOR_URL` | `http://127.0.0.1:8100` | URL que usa la consola C++. |
| `PANEL_DIR` | `/app/panel` | Carpeta del panel dentro del contenedor. |

## Pruebas automáticas

```powershell
cd servicios\clasificador
python -m pytest
python -m ruff check app pruebas
```

Resultado esperado: `47 passed` y `All checks passed!`. Las pruebas no descargan Laya ni
llaman a OpenRouter: usan reglas, proveedores simulados y un Whisper falso.

## Clasificación

- **Severidad:** 1 crítica · 2 alta · 3 media · 4 baja · 5 informativa.
- **Departamentos:** `bomberos`, `policia`, `ambulancia`, `defensa_civil` (sin `transito`).
- La prioridad de la cola usa directamente la severidad: **1 se atiende primero**.
- Guardarraíles deterministas corrigen casos evidentes: incendio con atrapado, robo del
  pasado, inundación, choque sin heridos, bromas y consultas informativas.
- Detalle de prompts, reglas y proveedores: [`README_EMERGENCIAS.md`](README_EMERGENCIAS.md).

## Problemas frecuentes

- **Docker no responde:** abre Docker Desktop y espera a que el motor termine de iniciar.
- **El puerto 8100 está ocupado:** cambia `CLASIFICADOR_PUERTO` y `CLASIFICADOR_URL` en
  `.env` y reinicia el clasificador.
- **Laya tarda la primera vez:** está descargando el checkpoint; llama a `POST /calentar`.
- **Jev responde 401/402:** revisa `OPENROUTER_API_KEY` y el saldo de OpenRouter.
- **El micrófono del panel no funciona:** ábrelo por `http://localhost:8100/` o por HTTPS.
- **No hay unidades en el mapa:** `config/unidades.json` está vacío; regístralas desde el
  panel. El mapa no inventa posiciones.

La lista completa está en el [manual de usuario](docs/MANUAL_USUARIO.md).

## Seguridad

- No subas `.env` al repositorio.
- La API no tiene autenticación: es una demo académica, no la publiques directamente en
  internet. La clave de OpenRouter se usa solo en el contenedor del clasificador.

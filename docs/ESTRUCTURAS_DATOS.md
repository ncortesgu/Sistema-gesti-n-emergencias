# Estructuras de datos: qué se eligió, por qué y cómo se usa

> Documento explicativo del proyecto **Sistema de Gestión de Emergencias (SGE)**.
> Requisito de la práctica: *«Desarrollar un proyecto de software que integre (use) al menos
> tres de las siguientes estructuras lineales: arreglos dinámicos, pilas, colas, colas
> circulares, colas con prioridad.»*

---

## 1. Resumen

El proyecto usa **tres estructuras lineales** distintas, cada una elegida porque resuelve
exactamente el problema que tenía el sistema:

| # | Estructura | Dónde vive | Para qué sirve en el SGE |
|---|---|---|---|
| 1 | **Cola (FIFO)** — `std::queue` | C++ · `include/service/ProcesadorEmergencias.h` | Cola de procesamiento de la entrada: los reportes (texto o audio) se clasifican en el orden en que llegaron. |
| 2 | **Cola con prioridad** — `std::priority_queue` | C++ · `include/service/GestorDepartamentos.h` | Colas operativas de cada departamento: sale primero la emergencia más grave, no la más antigua. |
| 3 | **Arreglo dinámico** — `Array` (JavaScript) | Frontend · `Panel-de-Emergencias-Pixel/app.js` | Historial de clasificaciones: crece con cada reporte y se recorta a un máximo de 50 entradas. |

Complemento del mismo tipo de estructura (arreglo dinámico) en C++:

| # | Estructura | Dónde vive | Para qué sirve en el SGE |
|---|---|---|---|
| 4 | **Arreglo dinámico** — `std::vector` | C++ · `include/service/ProcesadorEmergencias.h` | `procesarTodas()` devuelve un vector con todas las emergencias clasificadas de una sola vez. |

Diagrama del recorrido de un reporte:

```
   Texto / Audio / Micrófono
              │
              ▼
   ┌──────────────────────────────┐
   │ (1) COLA FIFO  std::queue    │  ← ProcesadorEmergencias.colaEntrada
   │      entrada de reportes      │     (respetar el orden de llegada)
   └──────────────────────────────┘
              │  clasificar (Laya / Jev / reglas)
              ▼
   ┌──────────────────────────────┐
   │ (2) COLA CON PRIORIDAD       │  ← GestorDepartamentos.departamentos
   │      std::priority_queue      │     (severidad = prioridad)
   │      una por departamento     │
   └──────────────────────────────┘
              │  atender
              ▼
   ┌──────────────────────────────┐
   │ (3) ARREGLO DINÁMICO Array    │  ← Frontend: state.history
   │      historial del navegador  │     (clasificaciones guardadas)
   └──────────────────────────────┘
```

---

## 2. (1) Cola FIFO para la entrada de datos — `std::queue`

**Archivo:** `include/service/ProcesadorEmergencias.h` y `src/service/ProcesadorEmergencias.cpp`

### Qué es

`std::queue<T>` es el adaptador FIFO de la STL. Internamente se apoya en un contenedor
secuencial (`std::deque`), que es una lista de bloques enlazados: insertar y quitar son
operaciones de tiempo constante y el contenedor nunca necesita reubicar todos sus elementos.

```cpp
std::queue<SolicitudEntrante> colaEntrada;
```

### Por qué se eligió

El sistema recibe reportes de personas y de sistemas distintos (texto en el panel, audio
del micrófono, archivo de audio). La regla operativa más importante de la cola de entrada
es que **un reporte se procesa en el mismo orden en que la persona lo reportó**:

- Si una persona reporta primero un incendio con personas atrapadas y después un robo, el
  clasificador debe procesar primero el incendio. Con una cola FIFO eso ocurre por
  construcción, sin código extra.
- La cola de entrada es heterogénea (texto y audio mezclados) y de volumen variable. `queue`
  resuelve las dos cosas: no hay que reservar memoria y no importa cuántas entradas hay.
- Con una pila (LIFO) el orden se invertiría y el último reporte en llegar se clasificaría
  primero, lo que rompería la trazabilidad de la operación.
- Con un arreglo dinámico el orden se puede mantener, pero hay que administrar a mano el
  índice de cabeza y la compactación de los elementos consumidos; `queue` ya lo resuelve.

### Cómo se usa

| Operación | Método | Comportamiento |
|---|---|---|
| Encolar texto | `encolarTexto(texto)` | `colaEntrada.push({TEXTO, texto})` — inserta al final. |
| Encolar audio | `encolarAudio(ruta)` | `colaEntrada.push({AUDIO, ruta})` — inserta al final. |
| Consultar pendientes | `pendientes()` | `colaEntrada.size()`. |
| Procesar el siguiente | `procesarSiguiente(salida, error)` | Lee `front()` y hace `pop()`: sale el más antiguo. |
| Procesar todos | `procesarTodas(errores)` | Repite `procesarSiguiente` hasta vaciar la cola. |

```cpp
// src/service/ProcesadorEmergencias.cpp
const SolicitudEntrante solicitud = colaEntrada.front();  // el más antiguo
colaEntrada.pop();                                        // se extrae
```

En la consola C++ (`src/ui/main_emergencias.cpp`) esta cola es la opción **1, 2, 3**
(encolar) y las opciones **4 y 5** (procesar). En el panel web la cola de entrada es la
misma del motor: el botón «Encolar» del panel envía el reporte al clasificador y el
motor lo procesa con esta estructura.

---

## 3. (2) Cola con prioridad por departamento — `std::priority_queue`

**Archivo:** `include/service/GestorDepartamentos.h` y `src/service/GestorDepartamentos.cpp`

### Qué es

`std::priority_queue<Usuario>` es un **heap binario**: un árbol de búsqueda mínimo que
siempre mantiene en la cima (`top()`) el elemento con la prioridad más alta. Insertar y
extraer son `O(log n)`, sin reordenar la colección completa.

```cpp
std::map<std::string, std::priority_queue<Usuario>> departamentos;
```

El `std::map` es una estructura **asociativa** (no lineal): indexa una cola con prioridad
por cada departamento (`bomberos`, `policia`, `ambulancia`, `defensa_civil`) y permite
buscar el departamento por nombre en tiempo constante.

### Por qué se eligió

En una emergencia real **el orden de llegada no importa: importa la gravedad**. Una cola
simple (FIFO) sacaría primero el reporte más antiguo, que puede ser un aviso de baja
importancia registrado hace media hora, mientras una persona atrapada quedaría al final
de la fila.

- La prioridad es la **severidad** (1 = crítica … 5 = informativa) y el comparador
  `Usuario::operator<` está invertido para que el heap coloque arriba el número más
  pequeño:

```cpp
// include/model/usuario.h
bool Usuario::operator<(const Usuario& otro) const {
    return prioridad > otro.prioridad;  // menor severidad = mayor prioridad
}
```

- Se usa una cola con prioridad **por departamento** y no una sola global: cada departamento
  tiene su propia cola y son independientes entre sí. Que bomberos esté saturado no puede
  bloquear a una ambulancia.
- El panel web **no reordena nada**: consume el orden que entrega el backend. Así la
  prioridad es responsabilidad de una sola estructura, no de dos implementaciones.
- Con un arreglo dinámico se tendría que reordenar la lista completa en cada insertion
  (`O(n)` por reporte); el heap lo resuelve en `O(log n)` sin código adicional.

### Cómo se usa

| Operación | Método | Comportamiento |
|---|---|---|
| Encolar reporte | `registrarUsuario(usuario)` | `departamentos[depto].push(usuario)`. |
| Atender lo más urgente | `atenderSiguiente(depto)` | `top()` + `pop()`: sale la severidad más baja (la más crítica). |
| Atender un reporte exacto | `atenderPorId(depto, id, usuario)` | Reconstruye el heap sin el reporte indicado, útil cuando el operador atiende desde el panel. |
| Ver la cola | `listarUsuarios(depto)` | Copia el heap y lo vacía en orden de prioridad. |
| ¿Hay pendientes? | `hayUsuariosEnEspera(depto)` | `!cola.empty()`. |

La cola con prioridad es la estructura que sostiene la **vista de Colas** del panel
(`GET /api/colas`) y la opción **6** de la consola («Atender siguiente emergencia por
departamento»).

---

## 4. (3) Arreglo dinámico en JavaScript para el historial — `Array`

**Archivo:** `Panel-de-Emergencias-Pixel/app.js`

### Qué es

En JavaScript un arreglo es una **lista dinámica**: no tiene un tamaño fijo, se puede
agregar y quitar elementos, y guarda valores de cualquier tipo. El historial del panel es
exactamente eso:

```js
const MAX_HISTORY = 50;          // máximo de entradas
const HISTORY_KEY = 'sge.historial.v1';   // clave en localStorage

state.history = [];              // arreglo dinámico en memoria
```

### Por qué se eligió

El historial de clasificaciones es una colección **heterogénea y de tamaño impredecible**:
cada entrada guarda texto, transcripción, severidad, departamentos, confianza, coordenadas
y el estado de encolado.

- Un arreglo dinámico permite agregar una entrada con una sola operación
  (`[draft, ...resto]`) sin conocer de antemano cuántos reportes habrá.
- Permite **editar en el sitio** una entrada cuando el backend devuelve el ID real de la
  emergencia (`state.history[index] = {...}`), sin tener que reconstruir toda la lista.
- Permite **filtrar y buscar** con `filter()` y `findIndex()`, y **recortar** con `slice()`
  cuando se supera el máximo, sin crear estructuras auxiliares.
- Un objeto con llaves fijas (`{a: ..., b: ...}`) obligaría a declarar de antemano todas
  las propiedades posibles; una estructura de tamaño variable no.

Alternativas descartadas:

- `Set` o `Map` como contenedor principal: no conservan el orden de inserción con la misma
  comodidad para listas y no aportan nada aquí, porque el historial se busca por índice y
  se recorta por posición.
- Guardar el historial en el servidor: el historial es de consulta rápida del operador y
  debe sobrevivir a un reinicio del motor; `localStorage` lo resuelve sin escribir en el
  servidor y sin datos sensibles.

### Cómo se usa

| Operación | Función | Comportamiento |
|---|---|---|
| Cargar | `loadHistory()` | Lee `localStorage`, valida con `Array.isArray`, normaliza y recorta con `slice(0, MAX_HISTORY)`. |
| Guardar | `persistHistory()` | `JSON.stringify(state.history.slice(0, MAX_HISTORY))`. |
| Agregar | `addHistoryEntry(draft)` | Inserta al frente y recorta: `state.history = [draft, ...].slice(0, MAX_HISTORY)`. |
| Actualizar | `syncHistoryEntry(draft)` | Busca con `findIndex()` y reemplaza el elemento. |
| Eliminar | `deleteHistoryItem(localId)` | `filter()` sobre el arreglo. |
| Vaciar | `clearHistory()` | `state.history = []`. |
| Consultar | `filterHistoryItems()` / `renderHistorialView()` | `filter()` por texto, ID o departamento. |

El historial vive en la sección **«Historial»** del panel (`#/historial`) y en
**«Configuración → Datos locales»**, donde se puede borrar con un clic.

---

## 5. (4) Arreglo dinámico en C++ — `std::vector`

**Archivo:** `include/service/ProcesadorEmergencias.h`

`procesarTodas()` devuelve `std::vector<Emergencia>`: un arreglo dinámico que crece
según la cantidad de reportes procesados en la tanda. Se eligió porque el número de
emergencias procesadas depende del tamaño de la cola de entrada y de cuántos falla el
clasificador, así que el tamaño no se conoce de antemano; el vector permite acumular
resultados y errores (`std::vector<std::string> &errores`) en la misma llamada.

---

## 6. Complejidad y resumen

| Operación | Estructura | Costo | Dónde se nota |
|---|---|---|---|
| Encolar reporte | Cola FIFO | `O(1)` | `encolarTexto`, `encolarAudio` |
| Procesar reporte | Cola FIFO | `O(1)` | `procesarSiguiente` |
| Registrar en cola de prioridad | Cola con prioridad (heap) | `O(log n)` | `registrarUsuario` |
| Atender lo más urgente | Cola con prioridad (heap) | `O(log n)` | `atenderSiguiente` |
| Atender un reporte exacto | Cola con prioridad (heap) | `O(n log n)` | `atenderPorId` (reconstruye el heap) |
| Guardar en el historial | Arreglo dinámico (JS) | `O(1)` amortizado | `addHistoryEntry` |
| Recortar el historial | Arreglo dinámico (JS) | `O(n)` | `persistHistory`, `addHistoryEntry` |
| Devolver lote clasificado | Arreglo dinámico (C++) | `O(1)` amortizado | `procesarTodas` |

### Por qué no se usaron las otras estructuras

| Estructura | Motivo de no usarla |
|---|---|
| **Pila (stack)** | El orden LIFO es contrario a la regla operativa: el reporte más antiguo no puede quedar al final. Se usa una cola FIFO para la entrada. |
| **Cola circular (ring buffer)** | El tamaño de la cola de entrada es variable y no hay un máximo fijo definido por el sistema; un buffer circular obligaría a decidir un capacidad máxima y a descartar reportes cuando se llenara. |
| **Colas circulares para el historial** | El historial es de consulta por fecha y búsqueda por texto, no una ventana deslizante de los últimos N eventos con escritura y lectura simultáneas en los extremos. Un arreglo dinámico con `slice()` cumple lo mismo. |

---

## 7. Referencias en el código

| Estructura | Ubicación exacta |
|---|---|
| Cola FIFO | `include/service/ProcesadorEmergencias.h` (declaración y documentación), `src/service/ProcesadorEmergencias.cpp` (`encolarTexto`, `encolarAudio`, `procesarSiguiente`, `procesarTodas`) |
| Cola con prioridad | `include/service/GestorDepartamentos.h`, `src/service/GestorDepartamentos.cpp` (`registrarUsuario`, `atenderSiguiente`, `atenderPorId`), `include/model/usuario.h` (comparador `operator<`) |
| Arreglo dinámico (JS) | `Panel-de-Emergencias-Pixel/app.js` (`loadHistory`, `persistHistory`, `addHistoryEntry`, `syncHistoryEntry`, `deleteHistoryItem`, `clearHistory`) |
| Arreglo dinámico (C++) | `include/service/ProcesadorEmergencias.h` (`procesarTodas`) |

Documentos relacionados: [Manual de usuario](MANUAL_USUARIO.md) · [README](../README.md) ·
[Guía técnica](../README_EMERGENCIAS.md)

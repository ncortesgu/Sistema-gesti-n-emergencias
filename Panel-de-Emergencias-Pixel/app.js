'use strict';

/**
 * Panel web del Sistema de Gestión de Emergencias (SGE).
 *
 * ESTRUCTURAS DE DATOS USADAS EN ESTE ARCHIVO
 * =============================================
 *
 * 1. ARREGLO DINÁMICO (Array de JavaScript) — HISTORIAL DE CLASIFICACIONES
 *    `state.history` es un `Array` que crece con cada reporte clasificado y se recorta a
 *    `MAX_HISTORY` (50) entradas. Se persiste como JSON en `localStorage` bajo la clave
 *    `sge.historial.v1`.
 *    - Por qué: el historial es una colección heterogénea (texto, audio, severidad,
 *      departamentos, confianza) cuyo tamaño depende del uso; un arreglo dinámico permite
 *      agregar, editar y filtrar sin declarar un tamaño fijo, y `slice()` resuelve el
 *      recorte del máximo sin crear otra estructura.
 *    - Cómo: `addHistoryEntry` inserta al frente (`[draft, ...resto]`), `syncHistoryEntry`
 *      actualiza el elemento existente por índice, `deleteHistoryItem` lo filtra y
 *      `loadHistory`/`persistHistory` lo serializan a `localStorage`.
 *
 * 2. COLAS CON PRIORIDAD (listas de la API) — COLAS OPERATIVAS POR DEPARTAMENTO
 *    Las colas de cada departamento NO viven en el navegador: el navegador las consume ya
 *    ordenadas por el motor C++ (`/api/colas`), donde cada departamento usa una
 *    `std::priority_queue<Usuario>` (heap binario) con la severidad como prioridad.
 *    - Por qué: el orden de atención lo decide la gravedad, no el orden de llegada, y el
 *      backend lo garantiza con un heap en vez de reordenar la lista en el cliente.
 *    - Cómo: `normalizeQueuePayload` conserva el orden que entrega el servidor y
 *      `filterQueueItems` solo filtra por severidad/departamento/texto sin alterar la
 *      prioridad.
 *
 * 3. COLA FIFO — COLA DE PROCESAMIENTO DE ENTRADA
 *    La cola de entrada del motor C++ (`std::queue<SolicitudEntrante>` en
 *    `ProcesadorEmergencias`) procesa los reportes en el orden en que se recibieron. El
 *    panel no la reimplementa: envía el reporte y consulta el estado ya clasificado.
 *
 * Ver `docs/ESTRUCTURAS_DATOS.md` para el porqué y el cómo de cada estructura.
 */

const CONFIG_KEY = 'sge.config.v2';
const HISTORY_KEY = 'sge.historial.v1';
const DRAFT_KEY = 'sge.borrador.v1';
const MAX_HISTORY = 50;
const MAX_TEXT = 4000;
const MIN_TEXT = 3;
const MAX_RECORD_SECONDS = 120;
const FALLBACK_BACKEND = 'http://127.0.0.1:8100';

function defaultApiBase() {
  try {
    if (window.location.protocol === 'file:') return FALLBACK_BACKEND;
    const host = window.location.hostname;
    const port = window.location.port;
    if ((host === 'localhost' || host === '127.0.0.1') && port !== '8100') {
      return FALLBACK_BACKEND;
    }
  } catch {}
  return '';
}

const DEFAULT_ENDPOINTS = {
  salud: '/salud',
  clasificar: '/clasificar',
  audio: '/procesar-audio',
  transcribir: '/transcribir',
  calentar: '/calentar',
  emergencias: '/api/emergencias',
  colas: '/api/colas',
  unidades: '/api/unidades'
};

const DEFAULT_CONFIG = {
  apiBase: '',
  provider: 'laya',
  refreshSec: 12,
  audioMaxMb: 15,
  endpoints: { ...DEFAULT_ENDPOINTS }
};

const DEPARTMENTS = {
  bomberos: { label: 'Bomberos', short: 'BOM', icon: 'fire' },
  policia: { label: 'Policía', short: 'POL', icon: 'police' },
  ambulancia: { label: 'Ambulancia', short: 'AMB', icon: 'ambulance' },
  defensa_civil: { label: 'Defensa Civil', short: 'DC', icon: 'shield' }
};

const DEPARTMENT_ALIASES = {
  bomberos: 'bomberos',
  bombero: 'bomberos',
  bomber: 'bomberos',
  fire: 'bomberos',
  incendio: 'bomberos',
  incendios: 'bomberos',
  rescate: 'bomberos',
  policia: 'policia',
  policial: 'policia',
  police: 'policia',
  seguridad: 'policia',
  transito: 'policia',
  ambulancia: 'ambulancia',
  ambulancias: 'ambulancia',
  ems: 'ambulancia',
  medico: 'ambulancia',
  medica: 'ambulancia',
  salud: 'ambulancia',
  defensa_civil: 'defensa_civil',
  defensacivil: 'defensa_civil',
  proteccion_civil: 'defensa_civil',
  proteccioncivil: 'defensa_civil',
  civil: 'defensa_civil',
  rescate_civil: 'defensa_civil',
  sin_asignar: 'sin_asignar'
};

const SEVERITIES = {
  1: { label: 'Crítica', short: 'CRÍTICA' },
  2: { label: 'Alta', short: 'ALTA' },
  3: { label: 'Media', short: 'MEDIA' },
  4: { label: 'Baja', short: 'BAJA' },
  5: { label: 'Informativa', short: 'INFORMATIVA' }
};

const NAV_ITEMS = [
  { name: 'estado', hash: '#/estado', label: 'Estado', icon: 'pulse' },
  { name: 'ingreso', hash: '#/ingreso', label: 'Ingreso', icon: 'plus' },
  { name: 'colas', hash: '#/colas', label: 'Colas', icon: 'queues' },
  { name: 'mapa', hash: '#/mapa', label: 'Mapa', icon: 'map' },
  { name: 'historial', hash: '#/historial', label: 'Historial', icon: 'history' }
];

const ICONS = {
  pulse: '<path d="M1 8h3l1-4 3 9 2-6 1 1h4" fill="none" stroke="currentColor" stroke-width="2"/>',
  plus: '<path d="M7 2h2v5h5v2H9v5H7V9H2V7h5z" fill="currentColor"/>',
  queues: '<path d="M2 3h12v2H2zM2 7h12v2H2zM2 11h8v2H2z" fill="currentColor"/>',
  map: '<path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z" fill="none" stroke="currentColor" stroke-width="2"/>',
  history: '<path d="M8 2a6 6 0 1 0 5.2 9M8 4v4l3 2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M1 3h4v4H1z" fill="currentColor"/>',
  gear: '<path d="M6 1h4v2h2v2h2v4h-2v2h-2v2H6v-2H4v-2H2V5h2V3h2z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 6h4v4H6z" fill="currentColor"/>',
  refresh: '<path d="M13 3v4H9M3 13V9h4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13 7a6 6 0 0 0-10-2M3 9a6 6 0 0 0 10 2" fill="none" stroke="currentColor" stroke-width="2"/>',
  fire: '<path d="M8 1l2 4 2 1 1 3v3l-2 2H5l-2-2V9l1-3 2-1 1-3z" fill="currentColor"/><path d="M8 8l1 2v2H7V9z" fill="#050505"/>',
  police: '<path d="M8 1l5 2v5l-5 6-5-6V3z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 5h2v2h2v2H9v2H7V9H5V7h2z" fill="currentColor"/>',
  ambulance: '<path d="M2 4h7v8H2zM9 7h3l2 2v3H9z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 5h2v2h2v2H7v2H5V9H3V7h2z" fill="currentColor"/><path d="M3 13h3v2H3zM11 13h3v2h-3z" fill="currentColor"/>',
  shield: '<path d="M8 1l5 2v5l-5 6-5-6V3z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 4h2v5H7zM5 6h6v2H5z" fill="currentColor"/>',
  upload: '<path d="M7 2h2v7h3L8 13 4 9h3z" fill="currentColor"/><path d="M2 14h12v2H2z" fill="currentColor"/>',
  mic: '<path d="M6 2h4v7H6zM4 7h2v3h4V7h2v3l-2 2v2H7v2H5v-2H4l-2-2z" fill="currentColor"/>',
  file: '<path d="M3 1h7l3 3v11H3z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 1v4h3M5 8h6v2H5zM5 11h4v2H5z" fill="currentColor"/>',
  check: '<path d="M2 8l4 4 8-9-2-2-6 7-2-2z" fill="currentColor"/>',
  x: '<path d="M3 2l5 5 5-5 2 2-5 5 5 5-2 2-5-5-5 5-2-2 5-5-5-5z" fill="currentColor"/>',
  alert: '<path d="M8 1l7 13H1z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 5h2v5H7zM7 11h2v2H7z" fill="currentColor"/>',
  info: '<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 7h2v5H7zM7 3h2v2H7z" fill="currentColor"/>',
  copy: '<path d="M5 4h9v10H5z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2 1h9v2H4v8H2z" fill="currentColor"/>',
  trash: '<path d="M5 2h6v2H5zM3 4h10v2H3zM4 6h8v9H4z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 8h1v5H6zM9 8h1v5H9z" fill="currentColor"/>',
  send: '<path d="M1 2l14 6-14 6 3-6z" fill="currentColor"/><path d="M4 8h8v2H4z" fill="#050505"/>',
  left: '<path d="M7 2v3h3v2H7v3H5V7H2V5h3z" fill="currentColor"/><path d="M2 4h2v2H2zM2 8h2v2H2z" fill="currentColor"/>',
  right: '<path d="M9 2v3h3v2H9v3H7V7H4V5h3z" fill="currentColor"/><path d="M12 4h2v2h-2zM12 8h2v2h-2z" fill="currentColor"/>',
  stop: '<path d="M3 3h10v10H3z" fill="currentColor"/>',
  play: '<path d="M4 2l9 6-9 6z" fill="currentColor"/>',
  wifi: '<path d="M1 6h14v2H1z" fill="currentColor"/><path d="M3 9h10v2H3z" fill="currentColor"/><path d="M5 12h6v2H5z" fill="currentColor"/>',
  clock: '<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 4h2v5h4v2H7z" fill="currentColor"/>',
  location: '<path d="M8 1l4 4v4l-4 6-4-6V5z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 5h4v4H6z" fill="currentColor"/>',
  spark: '<path d="M7 1h2v4h4v2H9v4H7V7H3V5h4z" fill="currentColor"/><path d="M12 11h2v2h2v2h-4z" fill="currentColor"/>',
  text: '<path d="M2 3h12v2H2zM2 7h12v2H2zM2 11h8v2H2z" fill="currentColor"/>',
  audio: '<path d="M2 6h3l4-3v10L5 10H2zM11 5h2v2h1v2h-1v2h-2zM14 3h2v2h-2z" fill="currentColor"/>',
  external: '<path d="M9 1h6v6h-2V5l-5 5-2-2 5-5H9z" fill="currentColor"/><path d="M2 8h2v6h6v2H2z" fill="currentColor"/>',
  wave: '<path d="M1 7h2v2H1zM4 4h2v8H4zM7 2h2v12H7zM10 4h2v8h-2zM13 7h2v2h-2z" fill="currentColor"/>'
};

const DATE_TIME = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit'
});

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

class AppError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AppError';
    this.type = options.type || 'api';
    this.status = options.status || 0;
    this.detail = options.detail || '';
  }
}

const state = {
  config: loadConfig(),
  history: loadHistory(),
  draft: loadDraft(),
  health: {
    status: 'idle',
    data: null,
    error: null,
    checkedAt: null,
    loading: false,
    failureType: null
  },
  queues: {
    status: 'idle',
    data: [],
    error: null,
    updatedAt: null,
    loading: false,
    source: null,
    errorNotified: false
  },
  units: {
    status: 'idle',
    data: [],
    error: null,
    updatedAt: null,
    loading: false,
    source: null,
    errorNotified: false
  },
  intake: {
    mode: 'texto',
    text: '',
    media: null,
    x: '',
    y: '',
    submitting: false,
    error: null,
    recording: false,
    recordStarting: false,
    recordSeconds: 0
  },
  enqueue: { loading: false, error: null },
  warmup: { loading: false },
  filters: {
    queueDept: 'todas',
    queueSeverity: 'todas',
    queueQuery: '',
    mapSeverity: 'todas',
    mapDept: 'todas'
  },
  historyQuery: '',
  lastAttended: null,
  attending: null,
  attendedOverrides: {}
};

const viewRoot = document.getElementById('view');
let routeToken = 0;
let activeRoute = { name: 'inicio', id: null };
let pollTimer = null;
let activeRefresh = null;
let recorderSession = null;
let activeDialog = null;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    if (character === '&') return '&amp;';
    if (character === '<') return '&lt;';
    if (character === '>') return '&gt;';
    if (character === '"') return '&quot;';
    return '&#39;';
  });
}

function truncate(value, limit) {
  const text = String(value ?? '');
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}…` : text;
}

function uid(prefix = 'ID') {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`.toUpperCase();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s\-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function stringValue(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = stringValue(item);
      if (text) return text;
    }
  }
  if (isObject(value)) {
    return stringValue(value.nombre ?? value.name ?? value.label ?? value.valor ?? value.value ?? value.descripcion);
  }
  return '';
}

function firstNumber() {
  for (const argument of arguments) {
    const value = typeof argument === 'string' ? argument.replace(',', '.').trim() : argument;
    const number = Number(value);
    if (value !== '' && value !== null && value !== undefined && Number.isFinite(number)) return number;
  }
  return null;
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return DATE_TIME.format(date);
}

function timeAgo(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  const difference = Date.now() - date.getTime();
  const future = difference < 0;
  const seconds = Math.abs(difference) / 1000;
  let text = '';
  if (seconds < 60) text = 'ahora';
  else if (seconds < 3600) text = `${Math.floor(seconds / 60)} min`;
  else if (seconds < 86400) text = `${Math.floor(seconds / 3600)} h`;
  else if (seconds < 604800) text = `${Math.floor(seconds / 86400)} d`;
  else return formatDate(date);
  if (text === 'ahora') return future ? 'en un momento' : 'ahora';
  return future ? `en ${text}` : `hace ${text}`;
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '0 KB';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatLatency(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return '—';
  if (number < 1000) return `${Math.round(number)} ms`;
  return `${(number / 1000).toFixed(1)} s`;
}

function icon(name, className = 'px-icon') {
  const body = ICONS[name] || ICONS.info;
  return `<svg viewBox="0 0 16 16" class="${className}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${body}</svg>`;
}

function normalizeConfig(raw) {
  const source = isObject(raw) ? raw : {};
  const config = {
    ...DEFAULT_CONFIG,
    ...source,
    endpoints: {
      ...DEFAULT_ENDPOINTS,
      ...(isObject(source.endpoints) ? source.endpoints : {})
    }
  };
  config.apiBase = typeof config.apiBase === 'string' ? config.apiBase.trim().replace(/\/+$/, '') : '';
  if (!config.apiBase || /^https?:\/\/(localhost|127\.0\.0\.1):8000$/i.test(config.apiBase)) {
    config.apiBase = defaultApiBase();
  }
  config.provider = typeof config.provider === 'string' && config.provider.trim() ? config.provider.trim() : 'laya';
  config.refreshSec = [10, 12, 15].includes(Number(config.refreshSec)) ? Number(config.refreshSec) : 12;
  config.audioMaxMb = [10, 15, 25, 30].includes(Number(config.audioMaxMb)) ? Number(config.audioMaxMb) : 15;
  for (const key of Object.keys(DEFAULT_ENDPOINTS)) {
    config.endpoints[key] = typeof config.endpoints[key] === 'string' && config.endpoints[key].trim()
      ? config.endpoints[key].trim()
      : DEFAULT_ENDPOINTS[key];
  }
  return config;
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return normalizeConfig(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeConfig(null);
  }
}

function persistConfig() {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
  } catch {
    toast('warn', 'Configuración no guardada', 'El navegador bloqueó el almacenamiento local.');
  }
}

/**
 * Carga el HISTORIAL DE CLASIFICACIONES (arreglo dinámico en `localStorage`).
 *
 * @returns {Array<Object>} Arreglo con las últimas `MAX_HISTORY` clasificaciones; cada
 *   elemento es un objeto con `localId`, `texto`, `severidad`, `departamentos`, etc.
 *   Si el almacenamiento está bloqueado o corrupto devuelve un arreglo vacío.
 */
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isObject).slice(0, MAX_HISTORY).map((item) => ({
      ...item,
      localId: item.localId || uid('HIS'),
      departamentos: Array.isArray(item.departamentos) ? item.departamentos.map(normalizeDepartmentToken).filter(Boolean) : []
    }));
  } catch {
    return [];
  }
}

/**
 * Guarda el HISTORIAL DE CLASIFICACIONES (arreglo dinámico) en `localStorage`.
 *
 * El arreglo se recorta con `slice(0, MAX_HISTORY)` antes de serializar para que el
 * almacenamiento local no crezca de forma indefinida.
 */
function persistHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history.slice(0, MAX_HISTORY)));
  } catch {
    toast('warn', 'Historial no guardado', 'El almacenamiento local está lleno o bloqueado.');
  }
}

function loadDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isObject(parsed)) return null;
    return {
      ...parsed,
      localId: parsed.localId || uid('HIS'),
      departamentos: Array.isArray(parsed.departamentos) ? parsed.departamentos.map(normalizeDepartmentToken).filter(Boolean) : []
    };
  } catch {
    return null;
  }
}

function persistDraft() {
  try {
    if (state.draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state.draft));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    return;
  }
}

function normalizeDepartmentToken(value) {
  let key = normalizeKey(value);
  if (!key) return null;
  if (DEPARTMENT_ALIASES[key]) return DEPARTMENT_ALIASES[key];
  if (key.startsWith('bomber')) return 'bomberos';
  if (key.startsWith('polic')) return 'policia';
  if (key.startsWith('ambulan') || key.startsWith('medical') || key.startsWith('medic')) return 'ambulancia';
  if (key.includes('defensa') || key.includes('proteccion_civil')) return 'defensa_civil';
  return key;
}

function normalizeDepartments(value) {
  const result = [];
  const add = (item) => {
    if (item === null || item === undefined) return;
    if (Array.isArray(item)) {
      item.forEach(add);
      return;
    }
    if (isObject(item)) {
      if (Array.isArray(item.departamentos)) add(item.departamentos);
      else if (item.nombre || item.name || item.label || item.id) add(item.nombre ?? item.name ?? item.label ?? item.id);
      else {
        for (const [key, enabled] of Object.entries(item)) {
          if (enabled === true) add(key);
        }
      }
      return;
    }
    const raw = String(item).trim();
    if (!raw) return;
    const wholeKey = normalizeDepartmentToken(raw);
    if (wholeKey && DEPARTMENT_ALIASES[normalizeKey(raw)]) {
      if (!result.includes(wholeKey)) result.push(wholeKey);
      return;
    }
    const parts = raw.split(/\s*[,/;+|]\s*|\s+y\s+/i).filter(Boolean);
    for (const part of parts.length ? parts : [raw]) {
      const key = normalizeDepartmentToken(part);
      if (key && !result.includes(key)) result.push(key);
    }
  };
  add(value);
  return result;
}

function departmentLabel(key) {
  if (DEPARTMENTS[key]) return DEPARTMENTS[key].label;
  if (key === 'sin_asignar') return 'Sin asignar';
  return String(key || 'Sin asignar').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function departmentShort(key) {
  if (DEPARTMENTS[key]) return DEPARTMENTS[key].short;
  if (key === 'sin_asignar') return 'S/A';
  return departmentLabel(key).slice(0, 4).toUpperCase();
}

function departmentIcon(key) {
  return DEPARTMENTS[key]?.icon || 'alert';
}

function deptChip(key) {
  return `<span class="dept-chip" data-dept="${escapeHtml(key)}">${icon(departmentIcon(key))}${escapeHtml(departmentLabel(key))}</span>`;
}

function normalizeSeverity(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(',', '.').trim());
  if (Number.isFinite(number)) {
    const rounded = Math.round(number);
    return rounded >= 1 && rounded <= 5 ? rounded : null;
  }
  const key = normalizeKey(value);
  if (['critico', 'critica', 'critical', 'rojo', 'roja', 'inmediato', 'inmediata'].includes(key)) return 1;
  if (['alto', 'alta', 'high', 'naranja', 'urgente'].includes(key)) return 2;
  if (['medio', 'media', 'medium', 'amarillo', 'moderado'].includes(key)) return 3;
  if (['bajo', 'baja', 'low', 'azul', 'leve'].includes(key)) return 4;
  if (['info', 'informativo', 'informativa', 'verde', 'minimo'].includes(key)) return 5;
  return null;
}

function normalizeConfidence(value) {
  if (value === null || value === undefined || value === '') return null;
  let number = Number(String(value).replace('%', '').replace(',', '.').trim());
  if (!Number.isFinite(number)) return null;
  if (number > 1) number /= 100;
  return clamp(number, 0, 1);
}

function normalizeCoordinate(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(clamp(number, 0, 1000));
}

function pickValue(objects, keys) {
  for (const object of objects) {
    if (!isObject(object)) continue;
    for (const key of keys) {
      const value = object[key];
      if (value !== undefined && value !== null && value !== '') return value;
    }
  }
  return undefined;
}

function candidateObjects(value) {
  const objects = [];
  const seen = new Set();
  const walk = (candidate, depth) => {
    if (!isObject(candidate) || seen.has(candidate) || depth > 3) return;
    seen.add(candidate);
    objects.push(candidate);
    for (const key of ['data', 'resultado', 'result', 'clasificacion', 'classification', 'analisis', 'analysis', 'respuesta', 'response', 'reporte', 'emergencia']) {
      if (isObject(candidate[key])) walk(candidate[key], depth + 1);
    }
  };
  walk(value, 0);
  return objects;
}

function normalizeHealth(payload, measuredLatency) {
  const root = isObject(payload) ? (isObject(payload.data) ? payload.data : payload) : {};
  const objects = candidateObjects(payload);
  const rawStatus = normalizeKey(pickValue(objects, ['estado', 'status', 'situacion', 'health', 'state']));
  let status = 'ok';
  if (payload === false || payload?.ok === false || /error|down|fall|unhealthy|critico|offline/.test(rawStatus)) status = 'error';
  else if (/degrad|warn|parcial|limited|revision/.test(rawStatus)) status = 'degraded';
  else if (/ok|healthy|up|ready|operativ|online|disponible/.test(rawStatus)) status = 'ok';
  else if (payload?.ok === true) status = 'ok';
  const checks = isObject(root.checks) ? root.checks : isObject(root.servicios) ? root.servicios : isObject(root.dependencies) ? root.dependencies : {};
  return {
    status,
    provider: stringValue(pickValue(objects, ['proveedor', 'provider', 'llm_provider', 'proveedor_llm'])) || '',
    model: stringValue(pickValue(objects, ['modelo', 'model', 'modelo_llm', 'llm_model'])) || '',
    version: stringValue(pickValue(objects, ['version', 'version_api', 'api_version'])) || '',
    latency: firstNumber(pickValue(objects, ['latencia_ms', 'latency_ms', 'latencia', 'latency']), measuredLatency),
    checks,
    raw: payload
  };
}

function readinessFrom(value) {
  if (value === true) return { value: 'ok', text: 'OPERATIVO' };
  if (value === false) return { value: 'bad', text: 'NO DISPONIBLE' };
  if (isObject(value)) {
    const nestedStatus = normalizeKey(value.estado ?? value.status ?? value.health);
    if (value.ok === false || value.available === false || value.ready === false || value.healthy === false) return { value: 'bad', text: 'NO DISPONIBLE' };
    if (value.ok === true || value.available === true || value.ready === true || value.healthy === true) {
      return { value: nestedStatus.includes('degrad') ? 'warn' : 'ok', text: nestedStatus.includes('degrad') ? 'DEGRADADO' : 'OPERATIVO' };
    }
    if (/error|down|fall|unhealthy/.test(nestedStatus)) return { value: 'bad', text: 'NO DISPONIBLE' };
    if (/degrad|warn|parcial/.test(nestedStatus)) return { value: 'warn', text: 'DEGRADADO' };
    if (/ok|healthy|up|ready|operativ|online/.test(nestedStatus)) return { value: 'ok', text: 'OPERATIVO' };
  }
  if (typeof value === 'string') {
    const key = normalizeKey(value);
    if (/error|down|fall|unhealthy|offline/.test(key)) return { value: 'bad', text: 'NO DISPONIBLE' };
    if (/degrad|warn|parcial|limited/.test(key)) return { value: 'warn', text: 'DEGRADADO' };
    if (/ok|healthy|up|ready|operativ|online|disponible/.test(key)) return { value: 'ok', text: 'OPERATIVO' };
  }
  return { value: 'unknown', text: 'SIN DATO' };
}

function findCheck(keys) {
  const checks = state.health.data?.checks;
  if (!isObject(checks)) return undefined;
  const normalized = Object.entries(checks).map(([key, value]) => [normalizeKey(key), value]);
  for (const key of keys) {
    const direct = checks[key];
    if (direct !== undefined) return direct;
    const found = normalized.find(([name]) => name === normalizeKey(key));
    if (found) return found[1];
  }
  return undefined;
}

function endpointFor(key) {
  const path = state.config.endpoints[key] || DEFAULT_ENDPOINTS[key] || '';
  if (!path) throw new AppError(`No hay una ruta configurada para ${key}.`, { type: 'config' });
  if (/^https?:\/\//i.test(path)) return path;
  const rawBase = String(state.config.apiBase || '').trim().replace(/\/+$/, '');
  const base = rawBase || defaultApiBase();
  if (!base) return path.startsWith('/') ? path : `/${path}`;
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

function appendQuery(url, key, value) {
  return `${url}${url.includes('?') ? '&' : '?'}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function extractErrorDetail(body) {
  if (typeof body === 'string') return body.trim().slice(0, 350);
  if (!isObject(body)) return '';
  const detail = body.detail ?? body.message ?? body.error ?? body.mensaje ?? body.detalle;
  if (typeof detail === 'string') return detail.trim().slice(0, 350);
  if (Array.isArray(detail)) {
    return detail.slice(0, 3).map((item) => {
      if (typeof item === 'string') return item;
      if (isObject(item)) return item.msg || item.message || item.detail || '';
      return '';
    }).filter(Boolean).join(' · ').slice(0, 350);
  }
  if (isObject(detail)) return extractErrorDetail(detail);
  if (Array.isArray(body.errors)) return body.errors.map((item) => stringValue(item)).filter(Boolean).join(' · ').slice(0, 350);
  return '';
}

async function apiRequest(url, options = {}) {
  const method = options.method || 'GET';
  const timeout = options.timeout || 30000;
  const sourceBody = options.body ?? null;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  let body = sourceBody;
  if (sourceBody !== null && typeof sourceBody === 'object' && !(sourceBody instanceof FormData) && !(sourceBody instanceof Blob)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(sourceBody);
  }
  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body ?? undefined,
      signal: controller.signal,
      mode: 'cors',
      cache: 'no-store'
    });
  } catch (error) {
    if (timedOut) throw new AppError('La solicitud superó el tiempo de espera. El backend no respondió a tiempo.', { type: 'timeout' });
    if (error?.name === 'AbortError') throw new AppError('La solicitud fue cancelada.', { type: 'abort' });
    throw new AppError('No se pudo conectar con el backend. Revisa la URL base, que el servicio esté activo y que CORS permita este origen.', {
      type: 'network',
      detail: error?.message || ''
    });
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text().catch(() => '');
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const detail = extractErrorDetail(data) || response.statusText || 'Sin detalle';
    throw new AppError(`El backend respondió HTTP ${response.status}. ${detail}`.trim(), {
      type: 'http',
      status: response.status,
      detail
    });
  }
  return data;
}

function readableError(error) {
  if (error instanceof AppError) {
    if (error.type === 'network') {
      return navigator.onLine
        ? 'No se pudo alcanzar el backend. Verifica la URL base y la configuración CORS.'
        : 'El navegador está sin conexión. Reconecta y vuelve a intentarlo.';
    }
    if (error.type === 'timeout') return 'La operación tardó demasiado. El backend no respondió a tiempo.';
    if (error.type === 'validation') return error.message;
    if (error.type === 'invalid') return error.message;
    if (error.type === 'config') return error.message;
    return error.message;
  }
  return error?.message || 'Ocurrió un error inesperado.';
}

function renderNav(activeName) {
  const topLinks = NAV_ITEMS.map((item) => {
    const current = item.name === activeName ? ' aria-current="page"' : '';
    return `<a class="nav-link" href="${item.hash}" data-nav="${item.name}"${current}>${icon(item.icon)}<span>${escapeHtml(item.label)}</span></a>`;
  }).join('');
  const bottomLinks = NAV_ITEMS.map((item) => {
    const current = item.name === activeName ? ' aria-current="page"' : '';
    return `<a class="bottom-link" href="${item.hash}" data-nav="${item.name}"${current}>${icon(item.icon)}<span>${escapeHtml(item.label)}</span></a>`;
  }).join('');
  const topNav = document.getElementById('top-nav');
  const bottomNav = document.getElementById('bottom-nav');
  if (topNav) topNav.innerHTML = topLinks;
  if (bottomNav) bottomNav.innerHTML = bottomLinks;
  $$('.top-actions [data-nav]').forEach((element) => {
    if (element.dataset.nav === activeName) element.setAttribute('aria-current', 'page');
    else element.removeAttribute('aria-current');
  });
}

function navForRoute(route) {
  if (route.name === 'detalle') return 'colas';
  if (route.name === 'resultado') return 'ingreso';
  if (['estado', 'ingreso', 'colas', 'mapa', 'historial', 'config'].includes(route.name)) return route.name;
  return '';
}

function updateChrome() {
  const offlineBanner = document.getElementById('offline-banner');
  const offlineText = document.getElementById('offline-text');
  const netPill = document.getElementById('net-pill');
  const netText = document.getElementById('net-text');
  const offline = !navigator.onLine || state.health.failureType === 'network';
  if (offlineBanner) offlineBanner.hidden = !offline;
  if (offlineText) {
    offlineText.textContent = !navigator.onLine
      ? 'El navegador no tiene conexión. Los datos en pantalla pueden estar desactualizados.'
      : 'No se pudo alcanzar el backend configurado. Revisa la URL y vuelve a intentarlo.';
  }
  let netKind = 'unknown';
  let netLabel = 'SIN SEÑAL';
  let netTitle = 'Estado de conexión con el backend';
  if (!navigator.onLine) {
    netKind = 'error';
    netLabel = 'OFFLINE';
    netTitle = 'El navegador está sin conexión';
  } else if (state.health.loading) {
    netKind = 'unknown';
    netLabel = 'VERIFICANDO';
    netTitle = 'Comprobando el backend';
  } else if (state.health.status === 'ok') {
    netKind = 'ok';
    netLabel = 'EN LÍNEA';
    netTitle = 'Backend accesible';
  } else if (state.health.status === 'degraded') {
    netKind = 'degraded';
    netLabel = 'DEGRADADO';
    netTitle = 'El backend responde con limitaciones';
  } else if (state.health.status === 'error') {
    netKind = 'error';
    netLabel = 'ERROR';
    netTitle = state.health.error || 'No se pudo verificar el backend';
  }
  if (netPill) {
    netPill.className = `net-pill is-${netKind}`;
    netPill.title = netTitle;
  }
  if (netText) netText.textContent = netLabel;
}

async function refreshHealth(options = {}) {
  if (state.health.loading) return false;
  const manual = Boolean(options.manual);
  const previousStatus = state.health.status;
  const previousError = state.health.error;
  state.health.loading = true;
  state.health.error = null;
  updateChrome();
  if (activeRoute.name === 'estado') repaint(renderStatusView(), false);
  const started = performance.now();
  try {
    const payload = await apiRequest(endpointFor('salud'), { timeout: 15000 });
    const measured = Math.round(performance.now() - started);
    const normalized = normalizeHealth(payload, measured);
    state.health = {
      status: normalized.status,
      data: normalized,
      error: null,
      checkedAt: Date.now(),
      loading: false,
      failureType: null
    };
    updateChrome();
    if (activeRoute.name === 'estado') repaint(renderStatusView(), false);
    if ((previousStatus === 'error' || previousError) && normalized.status !== 'error') {
      toast('success', 'Conexión restablecida', 'El backend vuelve a responder.');
    }
    if (manual) {
      const copy = normalized.status === 'ok'
        ? 'El backend respondió correctamente.'
        : normalized.status === 'degraded'
          ? 'El backend respondió, pero reporta un estado degradado.'
          : 'El backend respondió con un estado de error.';
      toast(normalized.status === 'ok' ? 'success' : 'warn', 'Comprobación completada', copy);
    }
    return normalized.status === 'ok' || normalized.status === 'degraded';
  } catch (error) {
    state.health = {
      status: 'error',
      data: null,
      error: readableError(error),
      checkedAt: Date.now(),
      loading: false,
      failureType: error instanceof AppError && (error.type === 'network' || error.type === 'timeout') ? 'network' : 'http'
    };
    updateChrome();
    if (activeRoute.name === 'estado') repaint(renderStatusView(), false);
    if (manual) toast('error', 'Sin respuesta del backend', state.health.error);
    return false;
  }
}

function renderReadinessRow(label, detail, readiness) {
  return `<div class="readiness-row">
    <div class="readiness-label"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(detail)}</span></div>
    <span class="readiness-value ${readiness.value === 'ok' ? 'ok' : readiness.value === 'bad' ? 'bad' : readiness.value === 'warn' ? 'warn' : ''}">${escapeHtml(readiness.text)}</span>
  </div>`;
}

function renderStatusView() {
  const health = state.health;
  const showingFresh = health.loading && !health.checkedAt;
  let statusKey = health.status;
  let statusWord = 'SIN DATO';
  let statusClass = 'is-loading';
  if (!navigator.onLine) {
    statusKey = 'error';
  }
  if (showingFresh) {
    statusWord = 'VERIFICANDO';
    statusClass = 'is-loading';
  } else if (statusKey === 'ok') {
    statusWord = 'EN LÍNEA';
    statusClass = 'is-ok';
  } else if (statusKey === 'degraded') {
    statusWord = 'DEGRADADO';
    statusClass = 'is-degraded';
  } else if (statusKey === 'error') {
    statusWord = navigator.onLine ? 'SIN ENLACE' : 'SIN CONEXIÓN';
    statusClass = 'is-error';
  }
  const provider = health.data?.provider || state.config.provider || '—';
  const model = health.data?.model || 'No informado';
  const latency = health.data?.latency;
  const classificationCheck = readinessFrom(findCheck(['clasificador', 'clasificacion', 'classifier', 'clasify']));
  const audioCheck = readinessFrom(findCheck(['audio', 'procesar_audio', 'transcripcion', 'transcriber', 'stt']));
  const queueCheck = readinessFrom(findCheck(['colas', 'emergencias', 'queues']));
  let backendReadiness = { value: 'unknown', text: 'SIN DATO' };
  if (showingFresh || health.status === 'idle') backendReadiness = { value: 'warn', text: 'VERIFICANDO' };
  else if (statusKey === 'ok') backendReadiness = { value: 'ok', text: 'OPERATIVO' };
  else if (statusKey === 'degraded') backendReadiness = { value: 'warn', text: 'DEGRADADO' };
  else if (statusKey === 'error') backendReadiness = { value: 'bad', text: 'SIN ENLACE' };
  const providerReadiness = state.health.status === 'ok'
    ? { value: 'ok', text: provider.toUpperCase() }
    : state.health.status === 'degraded'
      ? { value: 'warn', text: provider.toUpperCase() }
      : { value: 'unknown', text: provider.toUpperCase() };
  const queuesReadiness = queueCheck.value === 'unknown'
    ? { value: 'unknown', text: 'API REAL' }
    : queueCheck;
  const detail = health.error
    ? `<div class="status-detail is-danger"><strong>Detalle del último fallo</strong><p>${escapeHtml(health.error)}</p></div>`
    : health.status === 'degraded'
      ? '<div class="status-detail is-warn"><strong>Servicio degradado</strong><p>El backend responde, pero alguna capacidad puede no estar disponible. Revisa el calentamiento del proveedor antes de clasificar.</p></div>'
      : '';
  return `<section aria-labelledby="status-title">
    <div class="page-head">
      <div class="page-head-main">
        <span class="eyebrow">Centro de mando · Diagnóstico</span>
        <h1 id="status-title" class="page-title">ESTADO DEL <span class="accent">SISTEMA</span></h1>
        <p class="lead">Comprueba el enlace con el clasificador, el proveedor LLM y las capacidades operativas antes de iniciar el turno.</p>
      </div>
      <div class="page-head-actions">
        <button type="button" class="btn btn-secondary" data-action="refresh-health" ${health.loading ? 'disabled' : ''}>${icon('refresh')}Actualizar</button>
        <a class="btn btn-primary" href="#/ingreso">${icon('plus')}Nuevo reporte</a>
      </div>
    </div>
    <div class="status-grid">
      <section class="panel status-primary" aria-live="polite">
        <div class="status-topline">
          <div>
            <span class="eyebrow">Enlace operativo</span>
            <div class="status-word ${statusClass}">${statusWord}</div>
          </div>
          <span class="badge ${statusKey === 'ok' ? 'badge-success' : statusKey === 'degraded' ? 'badge-warn' : statusKey === 'error' ? 'badge-danger' : 'badge-gold'}">${escapeHtml(statusKey.toUpperCase())}</span>
        </div>
        <div class="status-provider">
          <span class="label-mono muted">PROVEEDOR LLM</span>
          <strong>${escapeHtml(provider)}</strong>
          <span class="badge badge-muted">${escapeHtml(model)}</span>
        </div>
        <dl class="status-meta">
          <div class="status-meta-cell"><dt>Última comprobación</dt><dd>${health.checkedAt ? escapeHtml(formatDate(health.checkedAt)) : '—'}</dd></div>
          <div class="status-meta-cell"><dt>Latencia /salud</dt><dd>${escapeHtml(formatLatency(latency))}</dd></div>
          <div class="status-meta-cell"><dt>Modo de colas</dt><dd>API REAL</dd></div>
        </dl>
        ${detail}
        <div class="status-actions">
          <button type="button" class="btn btn-primary" data-action="warmup" ${state.warmup.loading ? 'disabled' : ''}>${icon('spark')}${state.warmup.loading ? 'Calentando…' : 'Precalentar proveedor'}</button>
          <button type="button" class="btn btn-secondary" data-action="refresh-health" ${health.loading ? 'disabled' : ''}>${icon('refresh')}${health.loading ? 'Verificando…' : 'Reintentar'}</button>
          <a class="btn btn-ghost" href="#/config">${icon('gear')}Configurar API</a>
        </div>
      </section>
      <aside class="panel" aria-labelledby="readiness-title">
        <div class="panel-head">
          <div>
            <h2 id="readiness-title" class="panel-title">${icon('pulse')}Capacidades</h2>
            <span class="panel-kicker">Lectura del backend</span>
          </div>
          <span class="live-tag ${health.status === 'ok' ? 'is-live' : health.status === 'error' ? 'is-error' : 'is-warn'}">${health.loading ? 'SINCRONIZANDO' : 'ESTADO'}</span>
        </div>
        <div class="readiness-list">
          ${renderReadinessRow('Backend de clasificación', 'GET /salud · POST /clasificar', backendReadiness)}
          ${renderReadinessRow('Proveedor LLM', `Calentamiento con ${state.config.provider}`, providerReadiness)}
          ${renderReadinessRow('Procesamiento de audio', 'POST /procesar-audio', audioCheck)}
          ${renderReadinessRow('Colas y mapa', '/api/colas · /api/unidades', queuesReadiness)}
        </div>
        <p class="readiness-foot">La comprobación de clasificación se completa al enviar un reporte. Nunca se simula una clasificación real.</p>
      </aside>
    </div>
    <div class="quick-grid">
      <a class="quick-card" href="#/ingreso">${icon('plus')}<strong>Nuevo reporte</strong><span>Texto, archivo de audio o micrófono. Revisa la clasificación antes de encolarla.</span></a>
      <a class="quick-card" href="#/colas">${icon('queues')}<strong>Colas de atención</strong><span>Prioridad por severidad, filtros por departamento y atención independiente.</span></a>
      <a class="quick-card" href="#/mapa">${icon('map')}<strong>Mapa táctico</strong><span>Emergencias y unidades sobre coordenadas X/Y normalizadas de 0 a 1000.</span></a>
    </div>
  </section>`;
}

async function routeStatus(token) {
  showView(renderStatusView(), true);
  const stale = !state.health.checkedAt || Date.now() - state.health.checkedAt > 30000;
  if (state.health.status === 'idle' || stale) {
    await refreshHealth();
    if (token !== routeToken) return;
  }
  startPolling(async () => {
    await refreshHealth();
  }, 30000);
}

function showView(html, fresh) {
  if (!viewRoot) return;
  const current = viewRoot.firstElementChild;
  if (!fresh && current && current.classList.contains('view')) {
    current.innerHTML = html;
  } else {
    viewRoot.innerHTML = `<div class="view">${html}</div>`;
  }
}

function repaint(html, fresh = false) {
  const active = document.activeElement;
  let focusSnapshot = null;
  if (viewRoot && active && viewRoot.contains(active) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) {
    focusSnapshot = {
      id: active.id,
      field: active.dataset.field || '',
      start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
      end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null
    };
  }
  showView(html, fresh);
  if (!focusSnapshot || !viewRoot) return;
  let target = focusSnapshot.id ? document.getElementById(focusSnapshot.id) : null;
  if (!target && focusSnapshot.field) {
    const field = Array.from(viewRoot.querySelectorAll('[data-field]')).find((element) => element.dataset.field === focusSnapshot.field);
    target = field || null;
  }
  if (target) {
    target.focus({ preventScroll: true });
    if (focusSnapshot.start !== null && typeof target.setSelectionRange === 'function') {
      try {
        target.setSelectionRange(focusSnapshot.start, focusSnapshot.end ?? focusSnapshot.start);
      } catch {
        return;
      }
    }
  }
}

function startPolling(callback, milliseconds) {
  if (pollTimer) clearInterval(pollTimer);
  activeRefresh = callback;
  pollTimer = setInterval(() => {
    if (document.hidden || activeDialog) return;
    Promise.resolve(callback()).catch(() => {});
  }, Math.max(5000, milliseconds));
}

function cleanupView() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  activeRefresh = null;
  if (recorderSession) stopRecording({ discard: true, silent: true });
  if (activeDialog) activeDialog.close(false);
}

function parseRoute() {
  const raw = (location.hash || '#/estado').replace(/^#\/?/, '');
  const path = raw.split('?')[0];
  const parts = path.split('/').filter(Boolean);
  let decoded = [];
  try {
    decoded = parts.map((part) => decodeURIComponent(part));
  } catch {
    decoded = parts;
  }
  const name = (decoded[0] || 'estado').toLowerCase();
  if (name === 'detalle') {
    if (!decoded[1]) return { name: 'desconocida', id: null };
    return { name: 'detalle', id: decoded[1] };
  }
  if (['estado', 'ingreso', 'resultado', 'colas', 'mapa', 'historial', 'config'].includes(name)) {
    return { name, id: null };
  }
  return { name: 'desconocida', id: decoded[0] || null };
}

async function handleRoute() {
  const token = ++routeToken;
  cleanupView();
  const route = parseRoute();
  activeRoute = route;
  renderNav(navForRoute(route));
  updateChrome();
  window.scrollTo(0, 0);
  try {
    if (route.name === 'estado') {
      await routeStatus(token);
      return;
    }
    if (route.name === 'ingreso') {
      showView(renderIngresoView(), true);
      document.title = 'Ingreso // SGE';
      return;
    }
    if (route.name === 'resultado') {
      showView(renderResultadoView(), true);
      document.title = 'Resultado // SGE';
      return;
    }
    if (route.name === 'colas') {
      await routeQueues(token);
      return;
    }
    if (route.name === 'mapa') {
      await routeMap(token);
      return;
    }
    if (route.name === 'detalle') {
      await routeDetail(route.id, token);
      return;
    }
    if (route.name === 'historial') {
      showView(renderHistorialView(), true);
      document.title = 'Historial // SGE';
      return;
    }
    if (route.name === 'config') {
      document.title = 'Configuración // SGE';
      await loadUnits({ silent: true });
      if (token !== routeToken) return;
      showView(renderConfigView(), true);
      return;
    }
    showView(renderUnknownRoute(route), true);
    document.title = 'Ruta no encontrada // SGE';
  } catch (error) {
    if (token !== routeToken) return;
    showView(renderFatalView('No se pudo abrir la vista', readableError(error)), true);
  }
}

function renderFatalView(title, message) {
  return `<section aria-labelledby="fatal-title">
    <div class="page-head">
      <div class="page-head-main">
        <span class="eyebrow">Error de interfaz</span>
        <h1 id="fatal-title" class="page-title">${escapeHtml(title)}</h1>
      </div>
    </div>
    <div class="state-panel is-error">
      ${icon('alert')}
      <h2>OPERACIÓN INTERRUMPIDA</h2>
      <p>${escapeHtml(message)}</p>
      <div class="state-actions">
        <button type="button" class="btn btn-primary" data-action="retry-route">${icon('refresh')}Reintentar</button>
        <a class="btn btn-secondary" href="#/estado">${icon('pulse')}Ir al estado</a>
      </div>
    </div>
  </section>`;
}

function renderUnknownRoute(route) {
  return `<section aria-labelledby="unknown-title">
    <div class="page-head">
      <div class="page-head-main">
        <span class="eyebrow">Navegación</span>
        <h1 id="unknown-title" class="page-title">RUTA NO <span class="accent">ENCONTRADA</span></h1>
        <p class="lead">La dirección solicitada${route.id ? ` (${escapeHtml(route.id)})` : ''} no forma parte del centro de mando.</p>
      </div>
    </div>
    <div class="state-panel">
      ${icon('map')}
      <h2>DESTINO DESCONOCIDO</h2>
      <p>Vuelve al estado del sistema o abre una vista disponible desde la navegación.</p>
      <div class="state-actions"><a class="btn btn-primary" href="#/estado">${icon('pulse')}Volver al estado</a></div>
    </div>
  </section>`;
}

function toast(type, title, message, duration = 5000) {
  const region = document.getElementById('toast-region');
  if (!region) return;
  while (region.children.length >= 3) region.firstElementChild.remove();
  const element = document.createElement('div');
  element.className = `toast is-${type}`;
  const toastIcon = type === 'success' ? 'check' : type === 'error' ? 'alert' : type === 'warn' ? 'alert' : 'info';
  element.innerHTML = `${icon(toastIcon)}<div><strong></strong><span></span></div>`;
  element.querySelector('strong').textContent = title;
  element.querySelector('span').textContent = message || '';
  element.addEventListener('click', () => removeToast(element));
  region.appendChild(element);
  setTimeout(() => removeToast(element), duration);
}

function removeToast(element) {
  if (!element || !element.isConnected) return;
  element.classList.add('is-leaving');
  setTimeout(() => element.remove(), 160);
}

function openDialog(options) {
  if (activeDialog) activeDialog.close(false);
  const root = document.getElementById('modal-root');
  if (!root) return Promise.resolve(false);
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const titleId = uid('DLG');
    const dismissible = options.dismissible !== false;
    const confirmLabel = options.confirmLabel || 'Confirmar';
    const cancelLabel = options.cancelLabel === null ? '' : options.cancelLabel || 'Cancelar';
    root.innerHTML = `<div class="modal-backdrop" data-dialog-backdrop>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1">
        <button type="button" class="icon-btn modal-close" data-dialog-close aria-label="Cerrar diálogo">${icon('x')}</button>
        <h2 class="modal-title" id="${titleId}">${escapeHtml(options.title || 'Confirmar')}</h2>
        <div class="modal-body">${options.body || ''}</div>
        <div class="modal-actions">
          ${cancelLabel ? `<button type="button" class="btn btn-secondary" data-dialog-cancel>${escapeHtml(cancelLabel)}</button>` : ''}
          <button type="button" class="btn ${options.danger ? 'btn-danger' : 'btn-primary'}" data-dialog-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    </div>`;
    const backdrop = root.querySelector('[data-dialog-backdrop]');
    const modal = root.querySelector('.modal');
    const confirmButton = root.querySelector('[data-dialog-confirm]');
    const cancelButton = root.querySelector('[data-dialog-cancel]');
    let settled = false;
    const close = (value) => {
      if (settled) return;
      settled = true;
      document.body.classList.remove('modal-open');
      root.innerHTML = '';
      activeDialog = null;
      if (previousFocus && typeof previousFocus.focus === 'function') {
        try {
          previousFocus.focus({ preventScroll: true });
        } catch {}
      }
      resolve(value);
    };
    const cancel = () => close(false);
    activeDialog = { close, modal };
    document.body.classList.add('modal-open');
    const closeButton = root.querySelector('[data-dialog-close]');
    if (closeButton) closeButton.addEventListener('click', cancel);
    if (cancelButton) cancelButton.addEventListener('click', cancel);
    if (dismissible) {
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) cancel();
      });
    }
    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        cancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = $$('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', modal).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    confirmButton.addEventListener('click', async () => {
      if (confirmButton.disabled) return;
      if (typeof options.onConfirm !== 'function') {
        close(true);
        return;
      }
      confirmButton.disabled = true;
      confirmButton.classList.add('is-loading');
      try {
        const value = await options.onConfirm(modal);
        if (value === false) {
          confirmButton.disabled = false;
          confirmButton.classList.remove('is-loading');
          return;
        }
        close(value === undefined ? true : value);
      } catch (error) {
        confirmButton.disabled = false;
        confirmButton.classList.remove('is-loading');
        toast('error', 'No se pudo confirmar', readableError(error));
      }
    });
    setTimeout(() => {
      const firstFocusable = modal.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])');
      (firstFocusable || modal).focus({ preventScroll: true });
    }, 0);
  });
}

function confirmDialog(title, body, confirmLabel = 'Confirmar', danger = false) {
  return openDialog({ title, body, confirmLabel, danger });
}

function currentLocation() {
  const rawX = String(state.intake.x ?? '').trim();
  const rawY = String(state.intake.y ?? '').trim();
  if (!rawX && !rawY) return { value: null, preview: null, error: null };
  if (!rawX || !rawY) return { value: null, preview: null, error: 'Completa las dos coordenadas o deja ambas vacías.' };
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 1000 || y < 0 || y > 1000) {
    return { value: null, preview: null, error: 'Las coordenadas X e Y deben ser enteros entre 0 y 1000.' };
  }
  return { value: { x, y }, preview: { x, y }, error: null };
}

function locationPreviewHtml() {
  const location = currentLocation();
  const point = location.preview;
  const left = point ? point.x / 10 : 50;
  const top = point ? point.y / 10 : 50;
  return `<div class="location-preview" aria-hidden="true">
      <span id="location-marker" class="location-marker${point ? '' : ' is-empty'}" style="left:${left}%;top:${top}%"></span>
    </div>
    <div class="location-caption">
      <span id="location-x-text">X: ${point ? point.x : '—'}</span>
      <span id="location-y-text">Y: ${point ? point.y : '—'}</span>
    </div>`;
}

function updateLocationPreview() {
  const location = currentLocation();
  const marker = document.getElementById('location-marker');
  const xText = document.getElementById('location-x-text');
  const yText = document.getElementById('location-y-text');
  if (marker) {
    marker.classList.toggle('is-empty', !location.preview);
    marker.style.left = `${location.preview ? location.preview.x / 10 : 50}%`;
    marker.style.top = `${location.preview ? location.preview.y / 10 : 50}%`;
  }
  if (xText) xText.textContent = `X: ${location.preview ? location.preview.x : '—'}`;
  if (yText) yText.textContent = `Y: ${location.preview ? location.preview.y : '—'}`;
}

function intakeMediaCard() {
  const media = state.intake.media;
  if (!media) return '';
  const sourceLabel = media.source === 'microfono' ? 'Grabación de micrófono' : 'Archivo de audio';
  return `<div class="file-card">
      ${icon('audio')}
      <div class="file-copy">
        <span class="file-name">${escapeHtml(media.name)}</span>
        <span class="file-meta">${escapeHtml(sourceLabel)} · ${escapeHtml(formatBytes(media.size))}</span>
      </div>
      <div class="file-actions">
        <button type="button" class="btn btn-small btn-ghost" data-action="clear-media" ${state.intake.recording ? 'disabled' : ''}>${icon('x')}Quitar</button>
      </div>
    </div>
    ${media.url ? `<audio class="audio-preview" controls preload="metadata" src="${escapeHtml(media.url)}" aria-label="Vista previa del audio seleccionado"></audio>` : ''}`;
}

function renderTextIntake() {
  const text = state.intake.text;
  const count = text.length;
  return `<div class="field">
      <div class="field-label"><label for="intake-text">Relato de la emergencia</label><span class="field-hint">Mín. ${MIN_TEXT} · Máx. ${MAX_TEXT}</span></div>
      <textarea id="intake-text" class="textarea" data-field="intake-text" maxlength="${MAX_TEXT}" placeholder="Ej.: Incendio en una vivienda de dos plantas, hay una persona atrapada en el segundo piso. El humo se observa desde la calle." aria-describedby="intake-text-help">${escapeHtml(text)}</textarea>
      <div class="text-meta">
        <span id="intake-text-help">Incluye qué ocurre, dónde y a quién afecta.</span>
        <span id="char-count" class="char-count${count >= MAX_TEXT ? ' is-over' : ''}">${count} / ${MAX_TEXT}</span>
      </div>
    </div>`;
}

function renderAudioIntake() {
  const maxMb = state.config.audioMaxMb;
  return `<p class="mode-copy">Sube una grabación de la llamada o del lugar. El backend transcribe y clasifica el contenido; esta interfaz no genera una clasificación local.</p>
    <input id="audio-file" type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.webm,.flac,.mp4" hidden>
    <button type="button" class="dropzone${state.intake.submitting ? ' is-disabled' : ''}" data-action="choose-file" data-dropzone ${state.intake.submitting ? 'disabled' : ''}>
      ${icon('upload')}
      <strong>SOLTAR AUDIO AQUÍ</strong>
      <span>o selecciona un archivo · máx. ${maxMb} MB</span>
    </button>
    ${intakeMediaCard()}`;
}

function renderMicIntake() {
  const supported = Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.MediaRecorder !== 'undefined';
  const busy = state.intake.submitting || state.intake.recordStarting;
  const recording = state.intake.recording;
  const timer = formatDuration(state.intake.recordSeconds);
  const statusText = state.intake.recordStarting ? 'SOLICITANDO PERMISO' : recording ? 'GRABANDO' : 'MICRÓFONO LISTO';
  const recordAction = recording ? 'record-stop' : 'record-start';
  return `<p class="mode-copy">Graba el relato directamente. La grabación permanece en este navegador hasta que la envías al backend para clasificarla.</p>
    <div class="recorder">
      <button type="button" class="record-button${recording ? ' is-recording' : ''}" data-action="${recordAction}" ${busy || !supported ? 'disabled' : ''} aria-label="${recording ? 'Detener grabación' : 'Iniciar grabación'}">
        ${state.intake.recordStarting ? '<span class="spinner" aria-hidden="true"></span>' : icon(recording ? 'stop' : 'mic')}
      </button>
      <div class="record-status${recording ? ' is-live' : ''}">${statusText}</div>
      <div class="record-timer" id="record-timer">${timer}</div>
      ${recording ? '<div class="record-bars" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>' : ''}
      <p class="record-hint">${supported ? `Duración máxima ${formatDuration(MAX_RECORD_SECONDS)}. Al detener podrás escuchar la grabación antes de clasificarla.` : 'Este navegador no expone la API de grabación o la página no se sirve en un contexto seguro.'}</p>
      ${recording ? `<div class="record-actions">
        <button type="button" class="btn btn-secondary" data-action="record-stop">${icon('stop')}Detener</button>
        <button type="button" class="btn btn-ghost" data-action="record-cancel">${icon('x')}Cancelar</button>
      </div>` : ''}
    </div>
    ${intakeMediaCard()}`;
}

function renderIngresoView() {
  const mode = state.intake.mode;
  const isText = mode === 'texto';
  const modeContent = isText ? renderTextIntake() : mode === 'audio' ? renderAudioIntake() : renderMicIntake();
  const submitDisabled = state.intake.submitting || state.intake.recordStarting;
  const submitLabel = isText ? 'Clasificar emergencia' : state.intake.recording ? 'Detener y clasificar' : 'Procesar y clasificar';
  const loadingCopy = isText
    ? 'Enviando el relato al clasificador real. No cierres esta pestaña.'
    : state.intake.media?.source === 'microfono'
      ? 'Procesando la grabación y solicitando la clasificación al backend.'
      : 'Procesando el archivo de audio y solicitando la clasificación al backend.';
  const tab = (name, label, tabIcon) => `<button type="button" class="mode-tab" id="tab-${name}" role="tab" aria-selected="${mode === name}" aria-controls="intake-form" data-action="intake-mode" data-mode="${name}">${icon(tabIcon)}<span class="mode-label">${label}</span></button>`;
  const feedback = state.intake.error
    ? `<div class="feedback" role="alert"><strong>No se pudo completar la operación</strong>${escapeHtml(state.intake.error)}<div><button type="button" class="btn btn-small btn-danger-outline" data-action="retry-intake">${icon('refresh')}Reintentar</button></div></div>`
    : '';
  const loading = state.intake.submitting
    ? `<div class="loading-box" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span><div class="loading-copy"><strong>CLASIFICANDO</strong><span>${escapeHtml(loadingCopy)}</span></div></div>`
    : '';
  const location = currentLocation();
  const locationNote = location.error
    ? `<div class="field-error">${escapeHtml(location.error)}</div>`
    : `<p class="provider-note">Opcional. Las coordenadas son enteras, de 0 a 1000, y viajan junto al reporte cuando ambas están completas.</p>`;
  return `<section aria-labelledby="intake-title">
    <div class="page-head">
      <div class="page-head-main">
        <span class="eyebrow">Recepción · Clasificación real</span>
        <h1 id="intake-title" class="page-title">NUEVO <span class="accent">REPORTE</span></h1>
        <p class="lead">Registra la emergencia en texto, audio o voz. Revisa el resultado antes de enviarlo a las colas de atención.</p>
      </div>
      <div class="page-head-actions">
        <a class="btn btn-secondary" href="#/historial">${icon('history')}Historial</a>
        <a class="btn btn-ghost" href="#/estado">${icon('pulse')}Estado</a>
      </div>
    </div>
    <div class="intake-layout">
      <section class="panel intake-main" aria-labelledby="intake-title">
        <div class="mode-tabs" role="tablist" aria-label="Forma de ingreso">
          ${tab('texto', 'Texto', 'text')}
          ${tab('audio', 'Audio', 'audio')}
          ${tab('microfono', 'Micrófono', 'mic')}
        </div>
        <form id="intake-form" class="mode-panel" role="tabpanel" aria-labelledby="tab-${mode}" novalidate>
          ${modeContent}
          ${feedback}
          ${loading}
          <div class="intake-submit">
            <button type="submit" class="btn btn-primary${state.intake.submitting ? ' is-loading' : ''}" ${submitDisabled ? 'disabled' : ''}>${icon('spark')}${submitLabel}</button>
            <span class="muted">El clasificador y las colas se ejecutan en el backend real.</span>
          </div>
        </form>
      </section>
      <aside class="side-stack">
        <section class="panel" aria-labelledby="location-title">
          <div class="panel-head">
            <div>
              <h2 id="location-title" class="panel-title">${icon('location')}Ubicación</h2>
              <span class="panel-kicker">Opcional · X / Y</span>
            </div>
          </div>
          <div class="form-grid">
            <label class="field">
              <span class="field-label">Coordenada X</span>
              <input class="input" type="number" min="0" max="1000" step="1" inputmode="numeric" data-field="loc-x" value="${escapeHtml(state.intake.x)}" placeholder="0–1000">
            </label>
            <label class="field">
              <span class="field-label">Coordenada Y</span>
              <input class="input" type="number" min="0" max="1000" step="1" inputmode="numeric" data-field="loc-y" value="${escapeHtml(state.intake.y)}" placeholder="0–1000">
            </label>
          </div>
          ${locationPreviewHtml()}
          ${locationNote}
        </section>
        <section class="panel" aria-labelledby="guide-title">
          <div class="panel-head">
            <div>
              <h2 id="guide-title" class="panel-title">${icon('alert')}Prioridad</h2>
              <span class="panel-kicker">Escala del clasificador</span>
            </div>
          </div>
          <div class="about-list">
            <div class="about-row"><span>1 · Crítica</span><strong>Riesgo vital inmediato</strong></div>
            <div class="about-row"><span>2 · Alta</span><strong>Riesgo significativo</strong></div>
            <div class="about-row"><span>3 · Media</span><strong>Requiere atención</strong></div>
            <div class="about-row"><span>4 · Baja</span><strong>Control o seguimiento</strong></div>
            <div class="about-row"><span>5 · Informativa</span><strong>Sin riesgo inmediato</strong></div>
          </div>
          <p class="provider-note">No se inventan datos si el backend falla. La interfaz muestra el error y permite reintentar.</p>
        </section>
      </aside>
    </div>
  </section>`;
}

function clearIntakeMedia() {
  if (state.intake.media?.url) {
    try {
      URL.revokeObjectURL(state.intake.media.url);
    } catch {
      state.intake.media = null;
    }
  }
  state.intake.media = null;
}

function acceptAudioFile(file) {
  if (!file || state.intake.submitting || state.intake.recording || state.intake.recordStarting) return;
  const name = file.name || 'audio';
  const maxBytes = state.config.audioMaxMb * 1024 * 1024;
  const audioExtension = /\.(mp3|wav|m4a|aac|ogg|opus|webm|flac|mp4)$/i.test(name);
  if (!file.type.startsWith('audio/') && !audioExtension) {
    state.intake.error = 'El archivo seleccionado no parece ser de audio. Usa MP3, WAV, M4A, OGG, OPUS, WEBM o FLAC.';
    repaint(renderIngresoView(), false);
    return;
  }
  if (!file.size) {
    state.intake.error = 'El archivo está vacío. Selecciona una grabación válida.';
    repaint(renderIngresoView(), false);
    return;
  }
  if (file.size > maxBytes) {
    state.intake.error = `El archivo supera el límite de ${state.config.audioMaxMb} MB.`;
    repaint(renderIngresoView(), false);
    return;
  }
  clearIntakeMedia();
  let url = '';
  try {
    url = URL.createObjectURL(file);
  } catch {
    url = '';
  }
  state.intake.media = {
    blob: file,
    name,
    size: file.size,
    url,
    source: 'archivo'
  };
  state.intake.mode = 'audio';
  state.intake.error = null;
  if (activeRoute.name === 'ingreso') repaint(renderIngresoView(), false);
}

function pickRecordingMime() {
  if (typeof window.MediaRecorder === 'undefined') return '';
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const option of options) {
    try {
      if (MediaRecorder.isTypeSupported(option)) return option;
    } catch {
      return '';
    }
  }
  return '';
}

function recordingErrorMessage(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'El navegador bloqueó el micrófono. Concede el permiso e inténtalo de nuevo.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No se encontró un micrófono disponible.';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'El micrófono está ocupado o no se puede leer.';
  if (name === 'OverconstrainedError') return 'El micrófono no cumple las condiciones solicitadas.';
  return 'No se pudo iniciar la grabación. Revisa los permisos del navegador.';
}

async function startRecording() {
  if (state.intake.submitting || state.intake.recording || state.intake.recordStarting || recorderSession) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    state.intake.error = 'Este navegador no permite acceder al micrófono. Usa la pestaña de audio o carga un archivo.';
    repaint(renderIngresoView(), false);
    return;
  }
  if (typeof window.MediaRecorder === 'undefined') {
    state.intake.error = 'Este navegador no soporta MediaRecorder. Carga un archivo de audio en su lugar.';
    repaint(renderIngresoView(), false);
    return;
  }
  state.intake.recordStarting = true;
  state.intake.error = null;
  repaint(renderIngresoView(), false);
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (activeRoute.name !== 'ingreso') {
      stream.getTracks().forEach((track) => track.stop());
      state.intake.recordStarting = false;
      return;
    }
    const mime = pickRecordingMime();
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const session = {
      recorder,
      stream,
      chunks: [],
      mime: recorder.mimeType || mime || 'audio/webm',
      startedAt: Date.now(),
      timer: null,
      discard: false,
      silent: false,
      finalized: false
    };
    recorderSession = session;
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) session.chunks.push(event.data);
    };
    recorder.onstop = () => finalizeRecording(session);
    recorder.onerror = () => {
      session.discard = true;
      state.intake.error = 'La grabación se interrumpió por un error del micrófono.';
    };
    recorder.start(250);
    state.intake.recording = true;
    state.intake.recordStarting = false;
    state.intake.recordSeconds = 0;
    session.timer = setInterval(() => {
      if (!recorderSession || recorderSession !== session) return;
      const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
      state.intake.recordSeconds = elapsed;
      const timerElement = document.getElementById('record-timer');
      if (timerElement) timerElement.textContent = formatDuration(elapsed);
      if (elapsed >= MAX_RECORD_SECONDS) stopRecording();
    }, 250);
    repaint(renderIngresoView(), false);
  } catch (error) {
    if (stream) stream.getTracks().forEach((track) => track.stop());
    recorderSession = null;
    state.intake.recordStarting = false;
    state.intake.recording = false;
    state.intake.recordSeconds = 0;
    state.intake.error = recordingErrorMessage(error);
    if (activeRoute.name === 'ingreso') repaint(renderIngresoView(), false);
  }
}

function stopRecording(options = {}) {
  const session = recorderSession;
  if (!session) {
    state.intake.recording = false;
    state.intake.recordStarting = false;
    state.intake.recordSeconds = 0;
    if (options.discard) clearIntakeMedia();
    if (!options.silent && activeRoute.name === 'ingreso') repaint(renderIngresoView(), false);
    return Promise.resolve();
  }
  session.discard = session.discard || Boolean(options.discard);
  session.silent = session.silent || Boolean(options.silent);
  if (session.timer) clearInterval(session.timer);
  session.timer = null;
  if (!session.stopPromise) {
    session.stopPromise = new Promise((resolve) => {
      session.resolveStop = resolve;
    });
  }
  if (session.recorder.state !== 'inactive') {
    try {
      if (typeof session.recorder.requestData === 'function') {
        session.recorder.requestData();
      }
    } catch {}
    try {
      session.recorder.stop();
    } catch {
      finalizeRecording(session);
    }
  } else {
    finalizeRecording(session);
  }
  if (session.discard) {
    state.intake.recording = false;
    state.intake.recordStarting = false;
    state.intake.recordSeconds = 0;
    if (!session.silent && activeRoute.name === 'ingreso') repaint(renderIngresoView(), false);
  }
  return session.stopPromise;
}

function finalizeRecording(session) {
  if (!session || session.finalized) return;
  session.finalized = true;
  if (session.timer) clearInterval(session.timer);
  session.timer = null;
  session.stream.getTracks().forEach((track) => track.stop());
  if (recorderSession === session) recorderSession = null;
  state.intake.recording = false;
  state.intake.recordStarting = false;
  state.intake.recordSeconds = 0;
  if (!session.discard && session.chunks.length) {
    const mime = session.mime || session.chunks[0]?.type || 'audio/webm';
    const blob = new Blob(session.chunks, { type: mime });
    if (blob.size > 0) {
      clearIntakeMedia();
      let url = '';
      try {
        url = URL.createObjectURL(blob);
      } catch {
        url = '';
      }
      const extension = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
      state.intake.media = {
        blob,
        name: `grabacion-${Date.now()}.${extension}`,
        size: blob.size,
        url,
        source: 'microfono'
      };
      state.intake.error = null;
    } else {
      state.intake.error = 'La grabación quedó vacía. Inténtalo de nuevo.';
    }
  } else if (!session.discard) {
    state.intake.error = 'No se recibió audio del micrófono. Revisa el dispositivo e inténtalo de nuevo.';
  }
  if (typeof session.resolveStop === 'function') session.resolveStop();
  if (!session.silent && activeRoute.name === 'ingreso') repaint(renderIngresoView(), false);
}

function normalizeClassification(payload, fallbackText, origin, coordinates) {
  const objects = candidateObjects(payload);
  const severity = normalizeSeverity(pickValue(objects, ['severidad', 'severity', 'prioridad', 'priority', 'nivel', 'urgencia', 'urgency']));
  const departments = normalizeDepartments(pickValue(objects, ['departamentos', 'departamento', 'department', 'departments', 'categoria', 'category', 'servicio', 'area', 'dependencia']));
  const confidence = normalizeConfidence(pickValue(objects, ['confianza', 'confidence', 'probabilidad', 'probability', 'score']));
  const justification = stringValue(pickValue(objects, ['justificacion', 'justificación', 'reasoning', 'razon', 'razón', 'motivo', 'explanation', 'explicacion', 'rationale']));
  const report = stringValue(pickValue(objects, ['informe', 'reporte', 'report', 'resumen', 'summary', 'detalle', 'analisis', 'análisis']));
  const transcript = stringValue(pickValue(objects, ['transcripcion', 'transcripción', 'transcript', 'texto_transcrito', 'texto_original'])) || (origin === 'texto' ? '' : fallbackText || '');
  const text = stringValue(pickValue(objects, ['texto', 'relato', 'descripcion', 'descripción', 'texto_original', 'original_text'])) || fallbackText || '';
  const identifier = stringValue(pickValue(objects, ['id', 'emergencia_id', 'reporte_id', 'folio', 'classification_id']));
  const provider = stringValue(pickValue(objects, ['proveedor', 'provider', 'llm_provider'])) || '';
  const model = stringValue(pickValue(objects, ['modelo', 'model', 'llm_model'])) || '';
  const latency = firstNumber(pickValue(objects, ['latencia_ms', 'latency_ms', 'latencia', 'latency', 'tiempo_ms']));
  const dateValue = pickValue(objects, ['fecha', 'timestamp', 'created_at', 'registrado_en', 'fecha_clasificacion']);
  const date = dateValue && !Number.isNaN(new Date(dateValue).getTime()) ? new Date(dateValue).toISOString() : new Date().toISOString();
  if (severity === null) throw new AppError('La respuesta del clasificador no incluye una severidad válida entre 1 y 5.', { type: 'invalid' });
  if (!departments.length) throw new AppError('La respuesta del clasificador no incluye un departamento de atención reconocible.', { type: 'invalid' });
  return {
    localId: uid('HIS'),
    id: identifier || uid('REP'),
    texto: text,
    transcripcion: transcript || null,
    informe: report || justification || '',
    justificacion: justification || '',
    severidad: severity,
    departamentos: departments,
    confianza: confidence,
    fecha: date,
    proveedor: provider,
    modelo: model,
    latencia_ms: latency,
    origen: origin,
    x: coordinates?.x ?? null,
    y: coordinates?.y ?? null,
    enqueued: null,
    raw: payload
  };
}

function extractTranscript(payload) {
  if (typeof payload === 'string') return payload.trim();
  const objects = candidateObjects(payload);
  return stringValue(pickValue(objects, ['transcripcion', 'transcripción', 'transcript', 'texto_transcrito', 'texto', 'text']));
}

function payloadHasSeverity(payload) {
  const objects = candidateObjects(payload);
  return normalizeSeverity(pickValue(objects, ['severidad', 'severity', 'prioridad', 'priority', 'nivel', 'urgencia', 'urgency'])) !== null;
}

function classifyTextRequest(text, coordinates, origin = 'texto') {
  const body = { texto: text };
  if (coordinates) {
    body.x = coordinates.x;
    body.y = coordinates.y;
  }
  return apiRequest(endpointFor('clasificar'), {
    method: 'POST',
    body,
    timeout: 90000
  });
}

function requestAudioClassification(media, coordinates, origin) {
  const form = new FormData();
  form.append('archivo', media.blob, media.name || 'audio');
  if (coordinates) {
    form.append('x', String(coordinates.x));
    form.append('y', String(coordinates.y));
  }
  return apiRequest(endpointFor('audio'), {
    method: 'POST',
    body: form,
    timeout: 120000
  });
}

function resetIntake() {
  if (recorderSession) stopRecording({ discard: true, silent: true });
  clearIntakeMedia();
  state.intake = {
    mode: 'texto',
    text: '',
    media: null,
    x: '',
    y: '',
    submitting: false,
    error: null,
    recording: false,
    recordStarting: false,
    recordSeconds: 0
  };
}

/**
 * Inserta una clasificación en el HISTORIAL (arreglo dinámico).
 *
 * La entrada nueva se coloca al frente y el arreglo se recorta a `MAX_HISTORY` entradas.
 * Si el reporte ya estaba en el historial (mismo `localId`), se replaces en vez de
 * duplicarlo.
 *
 * @param {Object} draft Clasificación normalizada que se guardará.
 */
function addHistoryEntry(draft) {
  state.history = [draft, ...state.history.filter((item) => item.localId !== draft.localId)].slice(0, MAX_HISTORY);
  persistHistory();
}

/**
 * Actualiza una entrada existente del HISTORIAL (arreglo dinámico) sin duplicarla.
 *
 * @param {Object} draft Clasificación ya modificada (por ejemplo, con el ID del backend).
 */
function syncHistoryEntry(draft) {
  const index = state.history.findIndex((item) => item.localId === draft.localId);
  if (index === -1) return;
  state.history[index] = { ...state.history[index], enqueued: draft.enqueued };
  persistHistory();
}

async function submitIntake() {
  if (state.intake.submitting) return;
  if (recorderSession) {
    await stopRecording({ silent: true });
  }
  const ubicacion = currentLocation();
  if (ubicacion.error) {
    state.intake.error = ubicacion.error;
    repaint(renderIngresoView(), false);
    return;
  }
  const mode = state.intake.mode;
  const text = state.intake.text.trim();
  if (mode === 'texto' && text.length < MIN_TEXT) {
    state.intake.error = `El relato debe tener al menos ${MIN_TEXT} caracteres para poder clasificarlo.`;
    repaint(renderIngresoView(), false);
    return;
  }
  if (mode !== 'texto' && !state.intake.media) {
    state.intake.error = mode === 'microfono' ? 'Graba un audio antes de clasificar.' : 'Selecciona un archivo de audio antes de clasificar.';
    repaint(renderIngresoView(), false);
    return;
  }
  const requestRouteToken = routeToken;
  state.intake.submitting = true;
  state.intake.error = null;
  repaint(renderIngresoView(), false);
  let draft = null;
  try {
    if (mode === 'texto') {
      const payload = await classifyTextRequest(text, ubicacion.value, 'texto');
      draft = normalizeClassification(payload, text, 'texto', ubicacion.value);
    } else {
      const media = state.intake.media;
      const origin = media.source === 'microfono' ? 'microfono' : 'audio';
      const payload = await requestAudioClassification(media, ubicacion.value, origin);
      const transcript = extractTranscript(payload);
      if (payloadHasSeverity(payload)) {
        try {
          draft = normalizeClassification(payload, transcript, origin, ubicacion.value);
        } catch (error) {
          if (!transcript) throw error;
          const classified = await classifyTextRequest(transcript, ubicacion.value, origin);
          draft = normalizeClassification(classified, transcript, origin, ubicacion.value);
        }
      } else if (transcript) {
        const classified = await classifyTextRequest(transcript, ubicacion.value, origin);
        draft = normalizeClassification(classified, transcript, origin, ubicacion.value);
      } else {
        throw new AppError('El backend no devolvió una transcripción ni una clasificación utilizable para el audio.', { type: 'invalid' });
      }
      if (!draft.transcripcion) draft.transcripcion = transcript || null;
    }
    state.draft = draft;
    persistDraft();
    addHistoryEntry(draft);
    state.enqueue = { loading: false, error: null };
    try {
      await enqueueDraft();
      await loadQueues({ silent: true });
    } catch {}
    state.intake.submitting = false;
    toast('success', 'Clasificación completada', `Severidad ${draft.severidad} · ${draft.departamentos.map(departmentLabel).join(', ')}`);
    resetIntake();
    navigate('#/resultado');
  } catch (error) {
    state.intake.submitting = false;
    state.intake.error = readableError(error);
    if (requestRouteToken === routeToken && activeRoute.name === 'ingreso') repaint(renderIngresoView(), false);
    else toast('error', 'No se pudo clasificar', state.intake.error);
  }
}

function severityTag(severity) {
  if (!severity) return '<span class="sev-tag">SIN NIVEL</span>';
  return `<span class="sev-tag sev-${severity}">SEV ${severity} · ${escapeHtml(SEVERITIES[severity].short)}</span>`;
}

function navigate(hash) {
  if (location.hash === hash) handleRoute();
  else location.hash = hash;
}

function confidenceBlock(confidence) {
  const percent = confidence === null || confidence === undefined ? null : Math.round(confidence * 100);
  const activeSegments = percent === null ? 0 : Math.round(percent / 10);
  const low = percent === null || percent < 60;
  const segments = Array.from({ length: 10 }, (_, index) => `<span class="confidence-seg${index < activeSegments ? ' is-on' : ''}${index < activeSegments && low ? ' is-low' : ''}"></span>`).join('');
  return `<div class="confidence-block">
    <div class="confidence-head"><span>Confianza del clasificador</span><strong class="${low ? 'is-low' : ''}">${percent === null ? 'N/D' : `${percent}%`}</strong></div>
    <div class="confidence-track" role="img" aria-label="${percent === null ? 'Confianza no informada' : `Confianza ${percent} por ciento`}">${segments}</div>
    <p class="confidence-caption">${percent === null ? 'El backend no informó un valor de confianza.' : low ? 'Confianza baja: conviene que una persona revise el reporte antes de movilizar recursos.' : 'Confianza informada por el backend. La revisión humana sigue siendo recomendada.'}</p>
  </div>`;
}

function renderResultadoView() {
  const draft = state.draft;
  if (!draft) {
    return `<section aria-labelledby="result-empty-title">
      <div class="page-head">
        <div class="page-head-main">
          <span class="eyebrow">Revisión</span>
          <h1 id="result-empty-title" class="page-title">SIN <span class="accent">RESULTADO</span></h1>
        </div>
      </div>
      <div class="state-panel">
        ${icon('spark')}
        <h2>NO HAY UNA CLASIFICACIÓN RECIENTE</h2>
        <p>Inicia un nuevo reporte o recupera una clasificación guardada en el historial local.</p>
        <div class="state-actions">
          <a class="btn btn-primary" href="#/ingreso">${icon('plus')}Nuevo reporte</a>
          <a class="btn btn-secondary" href="#/historial">${icon('history')}Abrir historial</a>
        </div>
      </div>
    </section>`;
  }
  const severity = draft.severidad;
  const severityInfo = SEVERITIES[severity] || { label: 'Sin nivel', short: 'SIN NIVEL' };
  const departments = Array.isArray(draft.departamentos) ? draft.departamentos : [];
  const confidence = typeof draft.confianza === 'number' ? draft.confianza : normalizeConfidence(draft.confianza);
  const lowConfidence = confidence === null || confidence < 0.6;
  const report = String(draft.informe || '').trim();
  const original = String(draft.texto || '').trim();
  const transcript = String(draft.transcripcion || '').trim();
  const enqueued = draft.enqueued;
  const coordinates = Number.isInteger(draft.x) && Number.isInteger(draft.y) ? `${draft.x} · ${draft.y}` : 'Sin ubicación';
  const enqueueError = state.enqueue.error
    ? `<div class="feedback" role="alert"><strong>No se pudo encolar</strong>${escapeHtml(state.enqueue.error)}</div>`
    : '';
  const enqueuedContent = enqueued
    ? `<div class="enqueue-success">
        <strong>Emergencia encolada</strong>
        ${enqueued.id ? `<span class="enqueue-id">${escapeHtml(enqueued.id)}</span>` : ''}
        <p>Enviada al backend real de colas. ${departments.length > 1 ? 'La atención se gestiona de forma independiente en cada departamento.' : ''}</p>
      </div>
      <div class="action-row">
        <a class="btn btn-primary" href="#/colas">${icon('queues')}Ver cola</a>
        ${draft.x !== null && draft.y !== null ? '<a class="btn btn-secondary" href="#/mapa">' + icon('map') + 'Ver mapa</a>' : ''}
      </div>`
    : `<p class="panel-sub">Al encolar, el reporte se enviará a ${departments.length > 1 ? 'las colas de ' + departments.map(departmentLabel).join(' y ') : 'la cola de ' + departmentLabel(departments[0])}.</p>
      <div class="chip-row">${departments.map(deptChip).join('')}</div>
      <p class="provider-note">Se enviará al motor C++ con <span class="mono">POST /api/emergencias</span>.</p>
      ${enqueueError}
      <button type="button" class="btn btn-primary btn-block${state.enqueue.loading ? ' is-loading' : ''}" data-action="result-enqueue" ${state.enqueue.loading ? 'disabled' : ''}>${icon('send')}${state.enqueue.loading ? 'Enviando…' : 'Encolar emergencia'}</button>`;
  return `<section aria-labelledby="result-title">
    <div class="page-head">
      <div class="page-head-main">
        <a class="back-link" href="#/ingreso">${icon('left')}Volver al ingreso</a>
        <span class="eyebrow">Revisión · Resultado del clasificador</span>
        <h1 id="result-title" class="page-title">REVISIÓN DE <span class="accent">EMERGENCIA</span></h1>
        <p class="lead">Verifica la severidad y los departamentos asignados. Puedes encolar el reporte o corregir el relato antes de continuar.</p>
      </div>
      <div class="page-head-actions">
        <button type="button" class="btn btn-secondary" data-action="result-copy">${icon('copy')}Copiar informe</button>
        <button type="button" class="btn btn-ghost" data-action="result-new">${icon('plus')}Nuevo</button>
      </div>
    </div>
    <div class="result-layout">
      <div class="detail-main">
        <section class="panel">
          <div class="result-hero">
            <div class="severity-tile sev-${severity}">
              <span class="label-mono">SEVERIDAD</span>
              <span class="severity-num">${severity}</span>
              <span class="badge ${severity === 1 ? 'badge-danger' : severity === 2 ? 'badge-warn' : severity === 3 ? 'badge-gold' : severity === 4 ? 'badge-info' : 'badge-muted'}">${escapeHtml(severityInfo.label.toUpperCase())}</span>
            </div>
            <div class="result-summary">
              <span class="eyebrow">Clasificación completada</span>
              <h2>EMERGENCIA ${escapeHtml(severityInfo.label.toUpperCase())}</h2>
              <div class="chip-row">${departments.map(deptChip).join('')}</div>
              ${original ? `<p class="lead">${escapeHtml(truncate(original, 260))}</p>` : ''}
            </div>
          </div>
          ${lowConfidence ? `<div class="review-banner">${icon('alert')}<p><strong>Revisión humana recomendada.</strong> ${confidence === null ? 'No se informó la confianza de la clasificación.' : 'La confianza está por debajo del 60 %. Comprueba severidad y departamentos antes de movilizar recursos.'}</p></div>` : ''}
          ${confidenceBlock(confidence)}
          <dl class="result-meta">
            <div><dt>Folio / ID</dt><dd>${escapeHtml(draft.id || '—')}</dd></div>
            <div><dt>Fecha</dt><dd>${escapeHtml(formatDate(draft.fecha))}</dd></div>
            <div><dt>Proveedor</dt><dd>${escapeHtml(draft.proveedor || state.config.provider || '—')}</dd></div>
            <div><dt>Modelo</dt><dd>${escapeHtml(draft.modelo || 'No informado')}</dd></div>
            <div><dt>Latencia</dt><dd>${escapeHtml(formatLatency(draft.latencia_ms))}</dd></div>
            <div><dt>Origen</dt><dd>${escapeHtml(draft.origen || 'texto')}</dd></div>
            <div><dt>Coordenadas</dt><dd>${escapeHtml(coordinates)}</dd></div>
            <div><dt>Departamentos</dt><dd>${escapeHtml(departments.map(departmentLabel).join(', ') || '—')}</dd></div>
          </dl>
        </section>
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">${icon('file')}Informe del clasificador</h2>
              <span class="panel-kicker">Salida del backend</span>
            </div>
          </div>
          ${report ? `<div class="report-text">${escapeHtml(report)}</div>` : '<div class="empty-inline">El backend no devolvió un informe textual.</div>'}
          ${draft.justificacion && draft.justificacion !== report ? `<div class="report-block"><h3>Justificación</h3><div class="report-text">${escapeHtml(draft.justificacion)}</div></div>` : ''}
        </section>
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">${icon('text')}Relato original</h2>
              <span class="panel-kicker">Entrada conservada para auditoría</span>
            </div>
          </div>
          ${original ? `<div class="report-text">${escapeHtml(original)}</div>` : '<div class="empty-inline">No hay un relato de texto asociado.</div>'}
          ${transcript && transcript !== original ? `<div class="report-block"><h3>Transcripción</h3><div class="report-text">${escapeHtml(transcript)}</div></div>` : ''}
        </section>
      </div>
      <aside class="result-side">
        <section class="panel panel--accent">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">${icon('send')}Encolar</h2>
              <span class="panel-kicker">API real de colas</span>
            </div>
            <span class="badge badge-info">REAL</span>
          </div>
          <div class="enqueue-box">${enqueuedContent}</div>
        </section>
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">${icon('gear')}Acciones</h2>
              <span class="panel-kicker">Sin perder el historial</span>
            </div>
          </div>
          <div class="result-actions">
            <button type="button" class="btn btn-secondary btn-block" data-action="result-reuse">${icon('refresh')}Corregir y reclasificar</button>
            <button type="button" class="btn btn-ghost btn-block" data-action="result-new">${icon('plus')}Nuevo reporte</button>
            <a class="btn btn-ghost btn-block" href="#/historial">${icon('history')}Abrir historial</a>
          </div>
          <p class="provider-note">La clasificación y el encolado usan los servicios reales del motor C++.</p>
        </section>
      </aside>
    </div>
  </section>`;
}

function buildEnqueuePayload(draft) {
  const departments = draft.departamentos || [];
  const classification = {
    departamento: departments[0] || null,
    departamentos: departments,
    severidad: draft.severidad,
    confianza: draft.confianza ?? null,
    justificacion: draft.justificacion || '',
    informe: draft.informe || ''
  };
  const body = {
    reporte_id: draft.id,
    texto: draft.texto || '',
    transcripcion: draft.transcripcion || null,
    clasificacion: classification,
    severidad: draft.severidad,
    departamentos: departments,
    confianza: draft.confianza ?? null,
    informe: draft.informe || '',
    origen: draft.origen || 'texto',
    proveedor: draft.proveedor || '',
    modelo: draft.modelo || '',
    fecha: draft.fecha
  };
  if (Number.isInteger(draft.x) && Number.isInteger(draft.y)) {
    body.x = draft.x;
    body.y = draft.y;
    body.ubicacion = { x: draft.x, y: draft.y };
  }
  return body;
}

function extractRemoteId(payload) {
  const objects = candidateObjects(payload);
  return stringValue(pickValue(objects, ['id', 'emergencia_id', 'reporte_id', 'queue_id', 'folio', 'codigo']));
}

async function enqueueDraft() {
  if (!state.draft || state.enqueue.loading || state.draft.enqueued) return;
  if (!state.draft.departamentos?.length) {
    state.enqueue.error = 'No hay departamentos asignados para encolar esta emergencia.';
    repaint(renderResultadoView(), false);
    return;
  }
  state.enqueue.loading = true;
  state.enqueue.error = null;
  repaint(renderResultadoView(), false);
  try {
    const payload = await apiRequest(endpointFor('emergencias'), {
      method: 'POST',
      body: buildEnqueuePayload(state.draft),
      timeout: 45000
    });
    const result = { id: extractRemoteId(payload) };
    state.draft.enqueued = {
      id: result.id || null,
      at: new Date().toISOString()
    };
    persistDraft();
    syncHistoryEntry(state.draft);
    state.enqueue.loading = false;
    state.enqueue.error = null;
    if (activeRoute.name === 'resultado') repaint(renderResultadoView(), false);
    toast('success', 'Emergencia encolada', result.id ? `Folio ${result.id}.` : 'El backend confirmó el encolado sin devolver un folio.');
  } catch (error) {
    state.enqueue.loading = false;
    state.enqueue.error = readableError(error);
    if (activeRoute.name === 'resultado') repaint(renderResultadoView(), false);
    toast('error', 'No se pudo encolar', state.enqueue.error);
  }
}

async function copyText(value) {
  const text = String(value ?? '');
  if (!text) throw new AppError('No hay contenido para copiar.', { type: 'validation' });
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {}
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand('copy');
  area.remove();
  if (!copied) throw new AppError('El navegador bloqueó el acceso al portapapeles.', { type: 'validation' });
}

function draftCopyText(draft) {
  const lines = [
    `SGE · ${draft.id || 'Reporte'}`,
    `Severidad: ${draft.severidad}`,
    `Departamentos: ${(draft.departamentos || []).map(departmentLabel).join(', ')}`,
    `Fecha: ${formatDate(draft.fecha)}`,
    draft.informe ? `\nINFORME\n${draft.informe}` : '',
    draft.texto ? `\nRELATO ORIGINAL\n${draft.texto}` : '',
    draft.transcripcion && draft.transcripcion !== draft.texto ? `\nTRANSCRIPCIÓN\n${draft.transcripcion}` : ''
  ];
  return lines.filter(Boolean).join('\n');
}

function editDraftInIntake() {
  const draft = state.draft;
  if (!draft) return;
  resetIntake();
  state.intake.mode = 'texto';
  state.intake.text = draft.texto || draft.transcripcion || '';
  state.intake.x = Number.isInteger(draft.x) ? String(draft.x) : '';
  state.intake.y = Number.isInteger(draft.y) ? String(draft.y) : '';
  navigate('#/ingreso');
}

function startNewReport() {
  state.draft = null;
  persistDraft();
  state.enqueue = { loading: false, error: null };
  resetIntake();
  navigate('#/ingreso');
}

function restoreDraft(item) {
  if (!item) return;
  state.draft = { ...item, localId: item.localId || uid('HIS') };
  state.enqueue = { loading: false, error: null };
  persistDraft();
  navigate('#/resultado');
}

function historyItemToIntake(item) {
  if (!item) return;
  resetIntake();
  state.intake.mode = 'texto';
  state.intake.text = item.texto || item.transcripcion || '';
  state.intake.x = Number.isInteger(item.x) ? String(item.x) : '';
  state.intake.y = Number.isInteger(item.y) ? String(item.y) : '';
  navigate('#/ingreso');
}

function attendanceValue(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  if (isObject(value)) {
    if (typeof value.atendida === 'boolean') return value.atendida;
    if (typeof value.done === 'boolean') return value.done;
    const status = normalizeKey(value.estado ?? value.status ?? value.state);
    return /^(atendid|resuelt|cerrad|complet|done|closed)/.test(status);
  }
  const key = normalizeKey(value);
  return /^(atendid|resuelt|cerrad|complet|true|si|yes|done|closed)/.test(key);
}

function parseAttendances(raw, departments, hint) {
  const result = {};
  const objects = candidateObjects(raw);
  const mark = (key) => {
    const normalized = normalizeDepartmentToken(key);
    if (normalized) result[normalized] = true;
  };
  for (const object of objects) {
    const map = object.atenciones ?? object.atendida_por_departamento ?? object.estado_por_departamento ?? object.estados;
    if (isObject(map)) {
      Object.entries(map).forEach(([key, value]) => {
        if (attendanceValue(value)) mark(key);
      });
    } else if (Array.isArray(map)) {
      map.forEach((entry) => {
        if (typeof entry === 'string') mark(entry);
        else if (isObject(entry)) mark(entry.departamento ?? entry.department ?? entry.nombre ?? entry.name);
      });
    }
    const attendedBy = object.atendida_por ?? object.atendido_por ?? object.attended_by;
    if (typeof attendedBy === 'string') mark(attendedBy);
    if (Array.isArray(attendedBy)) attendedBy.forEach((entry) => mark(typeof entry === 'string' ? entry : entry?.departamento));
    if (attendanceValue(object.atendida ?? object.atendido ?? object.done)) {
      if (hint) mark(hint);
      else departments.forEach(mark);
    }
    const status = normalizeKey(object.estado ?? object.status ?? object.state);
    if (/^(atendid|resuelt|cerrad|complet|done|closed)/.test(status)) {
      if (hint) mark(hint);
      else departments.forEach(mark);
    }
  }
  return result;
}

function extractCoordinates(objects) {
  const source = pickValue(objects, ['ubicacion', 'coordenadas', 'coords', 'location', 'position']);
  let x = null;
  let y = null;
  if (Array.isArray(source) && source.length >= 2) {
    x = normalizeCoordinate(source[0]);
    y = normalizeCoordinate(source[1]);
  } else if (isObject(source)) {
    x = normalizeCoordinate(source.x ?? source.X ?? source.coord_x);
    y = normalizeCoordinate(source.y ?? source.Y ?? source.coord_y);
  }
  if (x === null) x = normalizeCoordinate(pickValue(objects, ['x', 'coord_x', 'coordenada_x', 'pos_x']));
  if (y === null) y = normalizeCoordinate(pickValue(objects, ['y', 'coord_y', 'coordenada_y', 'pos_y']));
  return x !== null && y !== null ? { x, y } : { x: null, y: null };
}

function normalizeQueueItem(raw, hint) {
  if (!isObject(raw)) return null;
  const objects = candidateObjects(raw);
  const text = stringValue(pickValue(objects, ['texto', 'descripcion', 'descripción', 'relato', 'resumen', 'summary', 'detalle', 'reporte_texto', 'original_text']));
  const identifier = stringValue(pickValue(objects, ['id', 'emergencia_id', 'reporte_id', 'queue_id', 'folio', 'codigo']));
  const severity = normalizeSeverity(pickValue(objects, ['severidad', 'severity', 'prioridad', 'priority', 'nivel', 'urgencia', 'urgency']));
  if (!identifier && !text && severity === null) return null;
  const departments = normalizeDepartments(pickValue(objects, ['departamentos', 'departamento', 'department', 'departments', 'categoria', 'servicio', 'area', 'dependencia']));
  if (hint) {
    const normalizedHint = normalizeDepartmentToken(hint);
    if (normalizedHint && !departments.includes(normalizedHint)) departments.push(normalizedHint);
  }
  if (!departments.length) departments.push('sin_asignar');
  const coordinates = extractCoordinates(objects);
  const dateValue = pickValue(objects, ['fecha', 'timestamp', 'created_at', 'registrado_en', 'fecha_reporte', 'hora']);
  const parsedDate = dateValue ? new Date(dateValue) : null;
  const fallbackId = `LOCAL-${normalizeKey(text).slice(0, 20).toUpperCase() || 'SIN-ID'}`;
  const unitValue = pickValue(objects, ['unidad', 'unit', 'unidad_asignada', 'recurso']);
  const unit = stringValue(unitValue);
  return {
    id: identifier || fallbackId,
    reporte_id: stringValue(pickValue(objects, ['reporte_id', 'report_id'])) || identifier || null,
    texto: text,
    transcripcion: stringValue(pickValue(objects, ['transcripcion', 'transcript', 'texto_transcrito'])) || null,
    informe: stringValue(pickValue(objects, ['informe', 'reporte', 'report', 'analisis', 'análisis'])) || '',
    justificacion: stringValue(pickValue(objects, ['justificacion', 'reasoning', 'motivo'])) || '',
    severidad: severity,
    departamentos: departments,
    confianza: normalizeConfidence(pickValue(objects, ['confianza', 'confidence', 'probabilidad', 'probability', 'score'])),
    fecha: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString(),
    origen: stringValue(pickValue(objects, ['origen', 'origin', 'source'])) || 'texto',
    x: coordinates.x,
    y: coordinates.y,
    atenciones: parseAttendances(raw, departments, hint),
    unidad: unit || null,
    raw
  };
}

function mergeQueueItems(map, item) {
  if (!item) return;
  const existing = map.get(item.id);
  if (!existing) {
    map.set(item.id, item);
    return;
  }
  existing.departamentos = Array.from(new Set([...existing.departamentos, ...item.departamentos]));
  existing.atenciones = { ...existing.atenciones, ...item.atenciones };
  existing.texto = existing.texto || item.texto;
  existing.informe = existing.informe || item.informe;
  existing.transcripcion = existing.transcripcion || item.transcripcion;
  existing.unidad = existing.unidad || item.unidad;
  if (existing.confianza === null) existing.confianza = item.confianza;
  if (existing.x === null && item.x !== null) {
    existing.x = item.x;
    existing.y = item.y;
  }
  if ((item.severidad || 99) < (existing.severidad || 99)) {
    existing.severidad = item.severidad;
    existing.fecha = item.fecha;
  }
}

/**
 * Normaliza la respuesta de `/api/colas` a una lista de emergencias.
 *
 * El ORDEN de prioridad no se calcula en el navegador: el motor C++ ya entrega cada
 * departamento ordenado por su cola con prioridad (`std::priority_queue<Usuario>`). Aquí
 * solo se transforma el JSON en objetos planos y se combinan las filas repetidas de un
 * mismo reporte (por ejemplo, la misma emergencia en dos departamentos).
 *
 * @param {Object} payload Respuesta de la API de colas.
 * @returns {Array<Object>} Reportes normalizados.
 */
function normalizeQueuePayload(payload) {
  const map = new Map();
  const departmentKeys = Object.keys(DEPARTMENTS);
  const add = (raw, hint) => {
    const item = normalizeQueueItem(raw, hint);
    if (item) mergeQueueItems(map, item);
  };
  const visit = (node, hint, depth) => {
    if (depth > 4 || node === null || node === undefined) return;
    if (Array.isArray(node)) {
      node.forEach((entry) => visit(entry, hint, depth + 1));
      return;
    }
    if (!isObject(node)) return;
    const envelopeDepartment = normalizeDepartments(pickValue([node], ['departamento', 'department', 'servicio', 'categoria']))[0];
    const effectiveHint = envelopeDepartment || hint;
    for (const key of ['emergencias', 'items', 'pendientes', 'reportes', 'queue', 'entries']) {
      if (Array.isArray(node[key])) {
        node[key].forEach((entry) => visit(entry, effectiveHint, depth + 1));
      }
    }
    if (isObject(node.colas)) {
      Object.entries(node.colas).forEach(([key, value]) => visit(value, normalizeDepartmentToken(key) || effectiveHint, depth + 1));
    }
    if (isObject(node.queues)) {
      Object.entries(node.queues).forEach(([key, value]) => visit(value, normalizeDepartmentToken(key) || effectiveHint, depth + 1));
    }
    for (const key of departmentKeys) {
      if (Array.isArray(node[key])) visit(node[key], key, depth + 1);
    }
    if (Array.isArray(node.data)) visit(node.data, effectiveHint, depth + 1);
    else if (isObject(node.data)) visit(node.data, effectiveHint, depth + 1);
    const looksLikeItem = Boolean(
      node.severidad ?? node.severity ?? node.prioridad ?? node.descripcion ?? node.texto ?? node.emergencia_id ?? node.reporte_id
    );
    if (looksLikeItem) add(node, effectiveHint);
  };
  visit(payload, null, 0);
  const items = Array.from(map.values());
  for (const item of items) {
    for (const [key, enabled] of Object.entries(state.attendedOverrides)) {
      const separator = key.lastIndexOf('|');
      if (separator === -1) continue;
      const id = key.slice(0, separator);
      const department = key.slice(separator + 1);
      if (enabled && id === item.id && item.departamentos.includes(department)) item.atenciones[department] = true;
    }
  }
  return items;
}

function normalizeUnit(raw) {
  if (!isObject(raw)) return null;
  const objects = candidateObjects(raw);
  const id = stringValue(pickValue(objects, ['id', 'codigo', 'unidad_id', 'identifier']));
  const name = stringValue(pickValue(objects, ['nombre', 'name', 'unidad', 'label']));
  if (!id && !name) return null;
  const coordinates = extractCoordinates(objects);
  const department = normalizeDepartments(pickValue(objects, ['departamento', 'department', 'servicio', 'tipo']))[0] || 'sin_asignar';
  const availableValue = pickValue(objects, ['disponible', 'available', 'activa', 'active']);
  const status = stringValue(pickValue(objects, ['estado', 'status', 'situacion'])) || (availableValue === false ? 'no disponible' : 'disponible');
  return {
    id: id || name,
    nombre: name || id,
    departamento: department,
    estado: status,
    disponible: availableValue === false ? false : !/no disponible|fuera de servicio|ocupad|inactivo/i.test(status),
    x: coordinates.x,
    y: coordinates.y,
    raw
  };
}

function normalizeUnitsPayload(payload) {
  const list = [];
  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isObject(node)) return;
    for (const key of ['unidades', 'units', 'items', 'data']) {
      if (Array.isArray(node[key])) {
        node[key].forEach(visit);
        return;
      }
      if (isObject(node[key]) && key === 'data') {
        visit(node[key]);
        return;
      }
    }
    const unit = normalizeUnit(node);
    if (unit) list.push(unit);
  };
  visit(payload);
  const map = new Map();
  list.forEach((unit) => map.set(unit.id, unit));
  return Array.from(map.values());
}

function currentSource() {
  return 'real';
}

function resetQueueState() {
  state.queues = {
    status: 'idle',
    data: [],
    error: null,
    updatedAt: null,
    loading: false,
    source: null,
    errorNotified: false
  };
  state.units = {
    status: 'idle',
    data: [],
    error: null,
    updatedAt: null,
    loading: false,
    source: null,
    errorNotified: false
  };
  state.lastAttended = null;
  state.attendedOverrides = {};
}

async function loadQueues(options = {}) {
  if (state.queues.loading) return false;
  const silent = Boolean(options.silent);
  const source = 'real';
  state.queues.loading = true;
  state.queues.error = null;
  if (!state.queues.data.length && !silent) state.queues.status = 'loading';
  if (!silent && activeRoute.name === 'colas') repaint(renderColasView(), false);
  try {
    const payload = await apiRequest(endpointFor('colas'), { timeout: 20000 });
    const items = normalizeQueuePayload(payload);
    state.queues = {
      status: 'ready',
      data: items,
      error: null,
      updatedAt: Date.now(),
      loading: false,
      source,
      errorNotified: false
    };
    return true;
  } catch (error) {
    const message = readableError(error);
    state.queues.loading = false;
    state.queues.status = state.queues.data.length ? 'ready' : 'error';
    state.queues.error = message;
    state.queues.source = source;
    if (!state.queues.errorNotified) {
      state.queues.errorNotified = true;
      toast('error', 'No se pudieron cargar las colas', message);
    }
    return false;
  }
}

async function loadUnits(options = {}) {
  if (state.units.loading) return false;
  const source = 'real';
  state.units.loading = true;
  state.units.error = null;
  try {
    const payload = await apiRequest(endpointFor('unidades'), { timeout: 20000 });
    const items = normalizeUnitsPayload(payload);
    state.units = {
      status: 'ready',
      data: items,
      error: null,
      updatedAt: Date.now(),
      loading: false,
      source,
      errorNotified: false
    };
    return true;
  } catch (error) {
    const message = readableError(error);
    state.units.loading = false;
    state.units.status = state.units.data.length ? 'ready' : 'error';
    state.units.error = message;
    state.units.source = source;
    if (!state.units.errorNotified) {
      state.units.errorNotified = true;
      toast('warn', 'Unidades no disponibles', message);
    }
    return false;
  }
}

function queueNeedsLoad() {
  return state.queues.source !== currentSource() || state.queues.status === 'idle' || (!state.queues.loading && state.queues.status === 'error');
}

function unitNeedsLoad() {
  return state.units.source !== currentSource() || state.units.status === 'idle' || (!state.units.loading && state.units.status === 'error');
}

function isAttended(item, department) {
  if (!item || !department) return false;
  if (item.atenciones?.[department]) return true;
  return Boolean(state.attendedOverrides[`${item.id}|${department}`]);
}

function remainingDepartments(item) {
  return (item.departamentos || []).filter((department) => !isAttended(item, department));
}

function isActiveEmergency(item) {
  return remainingDepartments(item).length > 0;
}

function queueCounts() {
  const counts = { todas: 0, bomberos: 0, policia: 0, ambulancia: 0, defensa_civil: 0 };
  for (const item of state.queues.data) {
    if (!isActiveEmergency(item)) continue;
    counts.todas += 1;
    for (const department of Object.keys(DEPARTMENTS)) {
      if (item.departamentos.includes(department) && !isAttended(item, department)) counts[department] += 1;
    }
  }
  return counts;
}

/**
 * Filtra las colas para la vista.
 *
 * El filtro NUNCA reordena: la prioridad (severidad) ya viene resuelta por la cola con
 * prioridad del backend; aquí solo se descartan reportes por severidad, departamento o
 * texto, y se mantiene el orden recibido.
 *
 * @returns {Array<Object>} Reportes visibles en la tabla de colas.
 */
function filterQueueItems() {
  const departmentFilter = state.filters.queueDept;
  const severityFilter = state.filters.queueSeverity;
  const query = normalizeKey(state.filters.queueQuery);
  let items = state.queues.data.filter((item) => {
    if (departmentFilter === 'todas') return isActiveEmergency(item);
    return item.departamentos.includes(departmentFilter) && !isAttended(item, departmentFilter);
  });
  if (severityFilter !== 'todas') items = items.filter((item) => String(item.severidad) === severityFilter);
  if (query) {
    items = items.filter((item) => {
      const haystack = normalizeKey([
        item.id,
        item.texto,
        item.informe,
        item.unidad,
        ...(item.departamentos || []).map(departmentLabel)
      ].join(' '));
      return haystack.includes(query);
    });
  }
  return items.sort((left, right) => {
    const severityDifference = (left.severidad || 99) - (right.severidad || 99);
    if (severityDifference !== 0) return severityDifference;
    const leftTime = new Date(left.fecha).getTime() || 0;
    const rightTime = new Date(right.fecha).getTime() || 0;
    return leftTime - rightTime;
  });
}

function queueRowHtml(item, index) {
  const activeDepartments = remainingDepartments(item);
  const attendedDepartments = (item.departamentos || []).filter((department) => isAttended(item, department));
  const currentAttending = state.attending?.id === item.id;
  const confidence = typeof item.confianza === 'number' ? Math.round(item.confianza * 100) : null;
  const coordinates = Number.isInteger(item.x) && Number.isInteger(item.y) ? `X ${item.x} · Y ${item.y}` : 'Sin ubicación';
  return `<article class="queue-row">
    <div class="queue-pos"><strong>${String(index + 1).padStart(2, '0')}</strong><span>PRIOR</span></div>
    <div class="queue-main">
      <div class="queue-top">
        ${severityTag(item.severidad)}
        ${(item.departamentos || []).map(deptChip).join('')}
        ${confidence !== null && confidence < 60 ? '<span class="badge badge-warn">REVISAR</span>' : ''}
        
      </div>
      <p class="queue-text"><span class="queue-id">${escapeHtml(item.id)}</span> · ${escapeHtml(truncate(item.texto || 'Sin descripción', 260))}</p>
      <div class="queue-meta">
        <span>${icon('clock')}${escapeHtml(timeAgo(item.fecha))}</span>
        <span>${icon('location')}${escapeHtml(coordinates)}</span>
        ${confidence !== null ? `<span>${icon('spark')}Confianza ${confidence}%</span>` : ''}
        ${item.unidad ? `<span>${icon('shield')}${escapeHtml(item.unidad)}</span>` : ''}
        ${activeDepartments.length ? `<span>${icon('send')}${escapeHtml(activeDepartments.map(departmentLabel).join(', '))}</span>` : ''}
      </div>
      ${attendedDepartments.length ? `<div class="chip-row">${attendedDepartments.map((department) => `<span class="badge badge-success">${escapeHtml(departmentShort(department))} ATENDIDA</span>`).join('')}</div>` : ''}
    </div>
    <div class="queue-side">
      <button type="button" class="btn btn-small btn-secondary" data-action="queue-open" data-id="${escapeHtml(item.id)}">${icon('right')}Detalle</button>
      <button type="button" class="btn btn-small btn-primary${currentAttending ? ' is-loading' : ''}" data-action="queue-attend" data-id="${escapeHtml(item.id)}" ${currentAttending ? 'disabled' : ''}>${icon('check')}${currentAttending ? 'Enviando…' : 'Atender'}</button>
    </div>
  </article>`;
}

function queueResultsHtml() {
  const items = filterQueueItems();
  if (!items.length) {
    const hasFilters = state.filters.queueDept !== 'todas' || state.filters.queueSeverity !== 'todas' || Boolean(state.filters.queueQuery);
    return {
      count: 0,
      html: `<div class="empty-inline">No hay emergencias que coincidan con los filtros actuales.${hasFilters ? ' <button type="button" class="btn btn-small btn-ghost" data-action="queue-clear-filters">Limpiar filtros</button>' : ''}</div>`
    };
  }
  return {
    count: items.length,
    html: items.map((item, index) => queueRowHtml(item, index)).join('')
  };
}

function updateQueueResults() {
  const results = queueResultsHtml();
  const container = document.getElementById('queue-results');
  const count = document.getElementById('queue-result-count');
  if (container) container.innerHTML = results.html;
  if (count) count.textContent = `${results.count} ${results.count === 1 ? 'emergencia activa' : 'emergencias activas'}`;
}

function renderQueueTabs(counts) {
  const departments = [['todas', 'TODAS'], ...Object.entries(DEPARTMENTS).map(([key, value]) => [key, value.label])];
  return `<div class="queue-tabs" role="group" aria-label="Filtrar por departamento">
    ${departments.map(([key, label]) => `<button type="button" class="queue-tab" data-action="queue-dept" data-dept="${key}" aria-pressed="${state.filters.queueDept === key}">${escapeHtml(label.toUpperCase())} ${counts[key] ?? counts.todas}</button>`).join('')}
  </div>`;
}

function renderColasView() {
  const loading = !state.queues.data.length && (state.queues.status === 'loading' || state.queues.status === 'idle' || state.queues.loading);
  const failed = !state.queues.data.length && state.queues.status === 'error';
  const header = `<div class="page-head">
    <div class="page-head-main">
      <span class="eyebrow">Operaciones · Colas por prioridad</span>
      <h1 class="page-title">COLAS DE <span class="accent">ATENCIÓN</span></h1>
      <p class="lead">Cada departamento atiende su propia cola. Marcar una emergencia como atendida en un servicio no la elimina de los demás.</p>
    </div>
    <div class="page-head-actions">
      <button type="button" class="btn btn-secondary" data-action="refresh-queues" ${state.queues.loading ? 'disabled' : ''}>${icon('refresh')}${state.queues.loading ? 'Actualizando…' : 'Actualizar'}</button>
      <a class="btn btn-primary" href="#/ingreso">${icon('plus')}Nuevo reporte</a>
    </div>
  </div>`;
  if (failed) {
    return `<section aria-labelledby="queues-title">${header}
      <div class="state-panel is-error">
        ${icon('alert')}
        <h2>NO SE PUDIERON CARGAR LAS COLAS</h2>
        <p>${escapeHtml(state.queues.error || 'El backend no devolvió datos.')}</p>
        <div class="state-actions">
          <button type="button" class="btn btn-primary" data-action="refresh-queues">${icon('refresh')}Reintentar</button>
          <a class="btn btn-secondary" href="#/config">${icon('gear')}Configurar API</a>
        </div>
      </div>
    </section>`;
  }
  if (loading) {
    return `<section aria-labelledby="queues-title">${header}
      <div class="loading-state" aria-label="Cargando colas">
        <div class="skeleton-row"></div>
        <div class="skeleton-row"></div>
        <div class="skeleton-row"></div>
      </div>
      <div class="loading-line" style="margin-top:18px"><span class="spinner" aria-hidden="true"></span><span>Consultando colas del backend…</span></div>
    </section>`;
  }
  const counts = queueCounts();
  const results = queueResultsHtml();
  const deptCards = Object.entries(DEPARTMENTS).map(([key, department]) => `<div class="dept-card">
      <div class="dept-card-top">
        <span class="dept-card-name">${icon(department.icon)}${escapeHtml(department.label)}</span>
        <span class="dept-count">${String(counts[key]).padStart(2, '0')}</span>
      </div>
      <button type="button" class="btn btn-small btn-secondary" data-action="queue-dept" data-dept="${key}">Abrir cola</button>
    </div>`).join('');
  const warning = state.queues.error
    ? `<div class="status-detail is-warn"><strong>Actualización fallida</strong><p>${escapeHtml(state.queues.error)} Se muestran los últimos datos recibidos.</p></div>`
    : '';
  const lastAttended = state.lastAttended
    ? `<div class="last-attended" role="status">
        ${icon('check')}
        <p><strong>${escapeHtml(departmentLabel(state.lastAttended.department))}</strong> marcó ${escapeHtml(state.lastAttended.id)} como atendida. ${state.lastAttended.remaining > 0 ? `La emergencia permanece en ${state.lastAttended.remaining} ${state.lastAttended.remaining === 1 ? 'cola activa' : 'colas activas'}.` : 'Todas sus colas quedaron cerradas.'}</p>
        <button type="button" class="btn btn-small btn-ghost" data-action="queue-all">Ver todas</button>
      </div>`
    : '';
  return `<section aria-labelledby="queues-title">
    ${header}
    <div class="od-row" style="justify-content:space-between;margin-bottom:16px;flex-wrap:wrap">
      <span class="live-tag ${state.queues.error ? 'is-warn' : 'is-live'}">${state.queues.updatedAt ? `Actualizado ${escapeHtml(timeAgo(state.queues.updatedAt))}` : 'Sin sincronizar'}</span>
      <span class="badge badge-info">API REAL</span>
    </div>
    ${warning}
    <div class="queue-counts">${deptCards}</div>
    ${lastAttended}
    <div class="filter-bar">
      <label class="field od-fill">
        <span class="field-label">Buscar</span>
        <input class="input" type="search" data-field="queue-search" value="${escapeHtml(state.filters.queueQuery)}" placeholder="ID, texto o unidad" autocomplete="off">
      </label>
      <label class="field">
        <span class="field-label">Severidad</span>
        <select class="select" data-filter="queue-severity">
          <option value="todas"${state.filters.queueSeverity === 'todas' ? ' selected' : ''}>Todas</option>
          ${[1, 2, 3, 4, 5].map((severity) => `<option value="${severity}"${state.filters.queueSeverity === String(severity) ? ' selected' : ''}>${severity} · ${escapeHtml(SEVERITIES[severity].label)}</option>`).join('')}
        </select>
      </label>
      <div class="od-fill"></div>
      <span id="queue-result-count" class="muted small">${results.count} ${results.count === 1 ? 'emergencia activa' : 'emergencias activas'}</span>
    </div>
    ${renderQueueTabs(counts)}
    <div id="queue-results" class="queue-list">${results.html}</div>
  </section>`;
}

async function routeQueues(token) {
  document.title = 'Colas // SGE';
  if (queueNeedsLoad()) {
    showView(renderColasView(), true);
    await loadQueues();
    if (token !== routeToken) return;
    repaint(renderColasView(), false);
  } else {
    showView(renderColasView(), true);
  }
  startPolling(async () => {
    await loadQueues({ silent: true });
    if (token === routeToken && activeRoute.name === 'colas') repaint(renderColasView(), false);
  }, state.config.refreshSec * 1000);
}

function filteredMapEmergencyItems() {
  const department = state.filters.mapDept;
  const severity = state.filters.mapSeverity;
  return state.queues.data.filter((item) => {
    if (department !== 'todas') {
      if (!item.departamentos.includes(department) || isAttended(item, department)) return false;
    } else if (!isActiveEmergency(item)) {
      return false;
    }
    if (severity !== 'todas' && String(item.severidad) !== severity) return false;
    return true;
  }).sort((left, right) => (left.severidad || 99) - (right.severidad || 99));
}

function filteredMapUnits() {
  const department = state.filters.mapDept;
  return state.units.data.filter((unit) => department === 'todas' || unit.departamento === department);
}

function mapMarkerHtml(item) {
  const short = item.departamentos.length > 1 ? 'MULTI' : departmentShort(item.departamentos[0]);
  const confidence = typeof item.confianza === 'number' ? item.confianza : 1;
  const left = clamp(item.x, 0, 1000) / 10;
  const top = clamp(item.y, 0, 1000) / 10;
  return `<button type="button" class="map-marker sev-${item.severidad || 5}${confidence < 0.6 ? ' is-review' : ''}" data-action="map-open" data-id="${escapeHtml(item.id)}" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%" title="${escapeHtml(`${item.id} · X ${item.x} · Y ${item.y}`)}" aria-label="${escapeHtml(`Abrir ${item.id}, severidad ${item.severidad || 'sin nivel'}, X ${item.x}, Y ${item.y}`)}">
      <span class="marker-sev">${item.severidad || '?'}</span>
      <span class="marker-dept">${escapeHtml(short)}</span>
    </button>`;
}

function unitMarkerHtml(unit) {
  const left = clamp(unit.x, 0, 1000) / 10;
  const top = clamp(unit.y, 0, 1000) / 10;
  return `<button type="button" class="unit-marker" data-action="unit-info" data-id="${escapeHtml(unit.id)}" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%" title="${escapeHtml(`${unit.nombre} · ${unit.estado}`)}" aria-label="${escapeHtml(`Unidad ${unit.nombre}, ${departmentLabel(unit.departamento)}, ${unit.estado}`)}">${escapeHtml(unit.id.slice(0, 6))}</button>`;
}

function renderMapView() {
  if (!state.queues.data.length && (state.queues.status === 'error')) {
    return `<section aria-labelledby="map-title">
      <div class="page-head">
        <div class="page-head-main">
          <span class="eyebrow">Geolocalización táctica</span>
          <h1 id="map-title" class="page-title">MAPA <span class="accent">OPERATIVO</span></h1>
        </div>
      </div>
      <div class="state-panel is-error">
        ${icon('map')}
        <h2>MAPA SIN DATOS</h2>
        <p>${escapeHtml(state.queues.error || 'No se pudieron cargar las emergencias.')}</p>
        <div class="state-actions">
          <button type="button" class="btn btn-primary" data-action="refresh-map">${icon('refresh')}Reintentar</button>
          <a class="btn btn-secondary" href="#/config">${icon('gear')}Configurar API</a>
        </div>
      </div>
    </section>`;
  }
  if (!state.queues.data.length && (state.queues.status === 'idle' || state.queues.loading || state.queues.status === 'loading')) {
    return `<section aria-labelledby="map-title">
      <div class="page-head">
        <div class="page-head-main">
          <span class="eyebrow">Geolocalización táctica</span>
          <h1 id="map-title" class="page-title">MAPA <span class="accent">OPERATIVO</span></h1>
          <p class="lead">Cargando emergencias y unidades sobre la cuadrícula X/Y.</p>
        </div>
      </div>
      <div class="state-panel">
        <span class="spinner" aria-hidden="true"></span>
        <h2>CARGANDO MAPA</h2>
        <p>Consultando colas y unidades del backend.</p>
      </div>
    </section>`;
  }
  const items = filteredMapEmergencyItems();
  const located = items.filter((item) => Number.isInteger(item.x) && Number.isInteger(item.y));
  const unlocated = items.filter((item) => !Number.isInteger(item.x) || !Number.isInteger(item.y));
  const units = filteredMapUnits().filter((unit) => Number.isInteger(unit.x) && Number.isInteger(unit.y));
  const warning = state.queues.error
    ? `<div class="status-detail is-warn"><strong>Colas desactualizadas</strong><p>${escapeHtml(state.queues.error)}</p></div>`
    : state.units.error
      ? `<div class="status-detail is-warn"><strong>Unidades no disponibles</strong><p>${escapeHtml(state.units.error)}</p></div>`
      : '';
  const unitRows = state.units.data.length
    ? state.units.data.map((unit) => `<div class="unit-row">
        <div><strong>${escapeHtml(unit.nombre)}</strong><span>${escapeHtml(departmentLabel(unit.departamento))} · ${escapeHtml(unit.estado)}</span></div>
        <span class="badge ${unit.disponible ? 'badge-success' : 'badge-muted'}">${unit.disponible ? 'DISPONIBLE' : 'EN SERVICIO'}</span>
      </div>`).join('')
    : `<div class="empty-inline">${state.units.loading ? 'Cargando unidades…' : state.units.error ? 'No se pudieron cargar las unidades.' : 'No hay unidades informadas.'}</div>`;
  const noLocation = unlocated.length
    ? `<section class="panel no-location-panel">
        <div class="panel-head">
          <div><h2 class="panel-title">${icon('location')}Sin coordenadas</h2><span class="panel-kicker">${unlocated.length} ${unlocated.length === 1 ? 'emergencia' : 'emergencias'} fuera del mapa</span></div>
        </div>
        <div class="no-location-list">
          ${unlocated.map((item) => `<div class="no-location-item">
            <div class="no-location-copy"><strong>${escapeHtml(item.id)} · ${escapeHtml(departmentLabel(item.departamentos[0]))}</strong><span>${escapeHtml(truncate(item.texto || 'Sin descripción', 120))}</span></div>
            <button type="button" class="btn btn-small btn-secondary" data-action="map-open" data-id="${escapeHtml(item.id)}">Abrir detalle</button>
          </div>`).join('')}
        </div>
      </section>`
    : '';
  const emptyMap = !located.length
    ? `<div class="map-empty"><div class="map-empty-inner"><strong>SIN MARCADORES UBICADOS</strong>${state.queues.data.length ? 'Las emergencias activas no tienen coordenadas válidas para los filtros actuales.' : 'No hay emergencias activas para mostrar.'}</div></div>`
    : '';
  return `<section aria-labelledby="map-title">
    <div class="page-head">
      <div class="page-head-main">
        <span class="eyebrow">Geolocalización táctica</span>
        <h1 id="map-title" class="page-title">MAPA <span class="accent">OPERATIVO</span></h1>
        <p class="lead">Cuadrícula normalizada de 0 a 1000. Los marcadores de emergencia se ordenan por severidad; las unidades se muestran en azul.</p>
      </div>
      <div class="page-head-actions">
        <button type="button" class="btn btn-secondary" data-action="refresh-map" ${state.queues.loading ? 'disabled' : ''}>${icon('refresh')}${state.queues.loading ? 'Actualizando…' : 'Actualizar'}</button>
        <a class="btn btn-primary" href="#/ingreso">${icon('plus')}Nuevo reporte</a>
      </div>
    </div>
    ${warning}
    <div class="map-layout">
      <section class="panel map-panel" aria-labelledby="tactical-map-title">
        <div class="map-toolbar">
          <div>
            <h2 id="tactical-map-title" class="panel-title">${icon('map')}Cuadrícula táctica</h2>
            <span class="panel-kicker">${located.length} emergencias · ${units.length} unidades</span>
          </div>
          <span class="live-tag ${state.queues.error ? 'is-warn' : 'is-live'}">${state.queues.updatedAt ? `ACT. ${escapeHtml(timeAgo(state.queues.updatedAt))}` : 'SIN SYNC'}</span>
        </div>
        <div class="map-frame">
          <span class="map-axis-title">X / Y · 0–1000</span>
          <div class="map-axis map-axis-y" aria-hidden="true"><span>0</span><span>250</span><span>500</span><span>750</span><span>1000</span></div>
          <div class="map-board" role="group" aria-label="Mapa de emergencias y unidades en coordenadas X e Y">
            ${located.map(mapMarkerHtml).join('')}
            ${units.map(unitMarkerHtml).join('')}
            ${emptyMap}
          </div>
          <div class="map-axis map-axis-x" aria-hidden="true"><span>0</span><span>250</span><span>500</span><span>750</span><span>1000</span></div>
        </div>
        <div class="map-legend">
          ${[1, 2, 3, 4, 5].map((severity) => `<span class="legend-item"><span class="legend-block sev-${severity}"></span>SEV ${severity}</span>`).join('')}
          <span class="legend-item"><span class="legend-block unit"></span>UNIDAD</span>
        </div>
        <p class="map-mode-note">Datos reales de /api/colas y /api/unidades. La actualización se realiza cada ' + state.config.refreshSec + ' segundos.</p>
      </section>
      <aside class="map-side">
        <section class="panel">
          <div class="panel-head">
            <div><h2 class="panel-title">${icon('queues')}Filtros</h2><span class="panel-kicker">Vista del tablero</span></div>
          </div>
          <label class="field">
            <span class="field-label">Severidad</span>
            <select class="select" data-filter="map-severity">
              <option value="todas"${state.filters.mapSeverity === 'todas' ? ' selected' : ''}>Todas</option>
              ${[1, 2, 3, 4, 5].map((severity) => `<option value="${severity}"${state.filters.mapSeverity === String(severity) ? ' selected' : ''}>${severity} · ${escapeHtml(SEVERITIES[severity].label)}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span class="field-label">Departamento</span>
            <select class="select" data-filter="map-dept">
              <option value="todas"${state.filters.mapDept === 'todas' ? ' selected' : ''}>Todos</option>
              ${Object.entries(DEPARTMENTS).map(([key, department]) => `<option value="${key}"${state.filters.mapDept === key ? ' selected' : ''}>${escapeHtml(department.label)}</option>`).join('')}
            </select>
          </label>
          <p class="map-mode-note">Los filtros no modifican las colas reales; solo la vista del mapa.</p>
        </section>
        <section class="panel">
          <div class="panel-head">
            <div><h2 class="panel-title">${icon('shield')}Unidades</h2><span class="panel-kicker">${state.units.data.length} registradas</span></div>
          </div>
          <div class="units-list">${unitRows}</div>
        </section>
      </aside>
    </div>
    ${noLocation}
  </section>`;
}

async function routeMap(token) {
  document.title = 'Mapa // SGE';
  const needsQueues = queueNeedsLoad();
  const needsUnits = unitNeedsLoad();
  showView(renderMapView(), true);
  if (needsQueues || needsUnits) {
    await Promise.all([
      needsQueues ? loadQueues({ silent: Boolean(state.queues.data.length) }) : Promise.resolve(true),
      needsUnits ? loadUnits({ silent: Boolean(state.units.data.length) }) : Promise.resolve(true)
    ]);
    if (token !== routeToken) return;
    repaint(renderMapView(), false);
  }
  startPolling(async () => {
    await Promise.all([
      loadQueues({ silent: true }),
      loadUnits({ silent: true })
    ]);
    if (token === routeToken && activeRoute.name === 'mapa') repaint(renderMapView(), false);
  }, state.config.refreshSec * 1000);
}

function openUnitDialog(unit) {
  if (!unit) return;
  const coordinates = Number.isInteger(unit.x) && Number.isInteger(unit.y) ? `X ${unit.x} · Y ${unit.y}` : 'Sin ubicación';
  openDialog({
    title: unit.nombre,
    body: `<div class="about-list">
      <div class="about-row"><span>Identificador</span><strong>${escapeHtml(unit.id)}</strong></div>
      <div class="about-row"><span>Departamento</span><strong>${escapeHtml(departmentLabel(unit.departamento))}</strong></div>
      <div class="about-row"><span>Estado</span><strong>${escapeHtml(unit.estado)}</strong></div>
      <div class="about-row"><span>Coordenadas</span><strong>${escapeHtml(coordinates)}</strong></div>
    </div>`,
    confirmLabel: 'Cerrar',
    cancelLabel: null
  });
}

function findQueueItem(id) {
  return state.queues.data.find((item) => item.id === id) || null;
}

function detailLoadingView(id) {
  return `<section aria-labelledby="detail-loading-title">
    <div class="page-head">
      <div class="page-head-main">
        <a class="back-link" href="#/colas">${icon('left')}Volver a colas</a>
        <span class="eyebrow">Detalle de emergencia</span>
        <h1 id="detail-loading-title" class="page-title">CARGANDO <span class="accent">DETALLE</span></h1>
      </div>
    </div>
    <div class="state-panel"><span class="spinner" aria-hidden="true"></span><h2>RECUPERANDO ${escapeHtml(id)}</h2><p>Consultando la cola operativa.</p></div>
  </section>`;
}

function renderDetailView(item) {
  const remaining = remainingDepartments(item);
  const attended = (item.departamentos || []).filter((department) => isAttended(item, department));
  const confidence = typeof item.confianza === 'number' ? Math.round(item.confianza * 100) : null;
  const coordinates = Number.isInteger(item.x) && Number.isInteger(item.y) ? { x: item.x, y: item.y } : null;
  const currentAttending = state.attending?.id === item.id;
  const queueMembership = (item.departamentos || []).map((department) => `<div class="detail-queue-item">
      <div>${deptChip(department)}</div>
      ${isAttended(item, department)
        ? '<span class="badge badge-success">ATENDIDA</span>'
        : `<button type="button" class="btn btn-small btn-primary${currentAttending ? ' is-loading' : ''}" data-action="detail-attend" data-id="${escapeHtml(item.id)}" data-dept="${escapeHtml(department)}" ${currentAttending ? 'disabled' : ''}>${icon('check')}${currentAttending ? 'Enviando…' : 'Atender'}</button>`}
    </div>`).join('');
  const location = coordinates
    ? `<div class="location-preview" aria-hidden="true"><span class="location-marker" style="left:${coordinates.x / 10}%;top:${coordinates.y / 10}%"></span></div>
      <div class="location-caption"><span>X: ${coordinates.x}</span><span>Y: ${coordinates.y}</span></div>`
    : `<div class="empty-inline">Esta emergencia no tiene coordenadas X/Y.</div>`;
  return `<section aria-labelledby="detail-title">
    <div class="page-head">
      <div class="page-head-main">
        <a class="back-link" href="#/colas">${icon('left')}Volver a colas</a>
        <span class="eyebrow">Operaciones · Detalle</span>
        <h1 id="detail-title" class="page-title">EMERGENCIA <span class="accent">${escapeHtml(item.id)}</span></h1>
        <p class="lead">Consulta el reporte, las colas donde sigue activa y el estado de atención por departamento.</p>
      </div>
      <div class="page-head-actions">
        <button type="button" class="btn btn-secondary" data-action="refresh-detail" data-id="${escapeHtml(item.id)}" ${state.queues.loading ? 'disabled' : ''}>${icon('refresh')}Actualizar</button>
        ${coordinates ? '<a class="btn btn-primary" href="#/mapa">' + icon('map') + 'Ver mapa</a>' : ''}
      </div>
    </div>
    <div class="detail-grid">
      <div class="detail-main">
        <section class="panel">
          <div class="detail-hero">
            <div class="detail-hero-main">
              <span class="detail-id">${escapeHtml(item.id)}${item.reporte_id ? ` · ${escapeHtml(item.reporte_id)}` : ''}</span>
              <div class="chip-row">${severityTag(item.severidad)}${(item.departamentos || []).map(deptChip).join('')}${confidence !== null && confidence < 60 ? '<span class="badge badge-warn">REVISAR</span>' : ''}</div>
              <p class="detail-text">${escapeHtml(item.texto || 'Sin descripción')}</p>
            </div>
          </div>
          <dl class="detail-list">
            <div><dt>Severidad</dt><dd>${item.severidad || '—'} · ${escapeHtml(SEVERITIES[item.severidad]?.label || 'Sin nivel')}</dd></div>
            <div><dt>Confianza</dt><dd>${confidence === null ? 'No informada' : `${confidence}%`}</dd></div>
            <div><dt>Fecha</dt><dd>${escapeHtml(formatDate(item.fecha))}</dd></div>
            <div><dt>Origen</dt><dd>${escapeHtml(item.origen || 'texto')}</dd></div>
            <div><dt>Coordenadas</dt><dd>${coordinates ? `X ${coordinates.x} · Y ${coordinates.y}` : 'Sin ubicación'}</dd></div>
            <div><dt>Unidad</dt><dd>${escapeHtml(item.unidad || 'No asignada')}</dd></div>
            <div><dt>Colas activas</dt><dd>${remaining.length}</dd></div>
            <div><dt>Colas atendidas</dt><dd>${attended.length}</dd></div>
          </dl>
        </section>
        <section class="panel">
          <div class="panel-head"><div><h2 class="panel-title">${icon('file')}Informe</h2><span class="panel-kicker">Clasificación registrada</span></div></div>
          ${item.informe ? `<div class="report-text">${escapeHtml(item.informe)}</div>` : '<div class="empty-inline">No se recibió un informe textual.</div>'}
          ${item.justificacion && item.justificacion !== item.informe ? `<div class="report-block"><h3>Justificación</h3><div class="report-text">${escapeHtml(item.justificacion)}</div></div>` : ''}
        </section>
        ${item.transcripcion ? `<section class="panel"><div class="panel-head"><div><h2 class="panel-title">${icon('audio')}Transcripción</h2><span class="panel-kicker">Audio procesado por el backend</span></div></div><div class="report-text">${escapeHtml(item.transcripcion)}</div></section>` : ''}
      </div>
      <aside class="detail-side">
        <section class="panel panel--accent">
          <div class="panel-head">
            <div><h2 class="panel-title">${icon('queues')}Colas</h2><span class="panel-kicker">Atención por departamento</span></div>
            <span class="badge badge-info">REAL</span>
          </div>
          <div class="detail-queue-list">${queueMembership}</div>
          ${!remaining.length ? '<div class="attended-note"><strong>ATENDIDA EN TODAS LAS COLAS</strong>La emergencia ya no figura como activa en ningún departamento.</div>' : '<p class="provider-note">Atender una cola no cierra las demás. Cada departamento mantiene su propio estado.</p>'}
        </section>
        <section class="panel">
          <div class="panel-head"><div><h2 class="panel-title">${icon('location')}Ubicación</h2><span class="panel-kicker">X / Y normalizado</span></div></div>
          ${location}
        </section>
        <section class="panel">
          <div class="panel-head"><div><h2 class="panel-title">${icon('gear')}Acciones</h2><span class="panel-kicker">Navegación rápida</span></div></div>
          <div class="result-actions">
            <a class="btn btn-secondary btn-block" href="#/colas">${icon('queues')}Volver a colas</a>
            <a class="btn btn-ghost btn-block" href="#/mapa">${icon('map')}Abrir mapa</a>
            <a class="btn btn-ghost btn-block" href="#/historial">${icon('history')}Historial</a>
          </div>
        </section>
      </aside>
    </div>
  </section>`;
}

function renderAttendedDetail(snapshot) {
  return `<section aria-labelledby="attended-title">
    <div class="page-head">
      <div class="page-head-main">
        <a class="back-link" href="#/colas">${icon('left')}Volver a colas</a>
        <span class="eyebrow">Operaciones · Detalle</span>
        <h1 id="attended-title" class="page-title">EMERGENCIA <span class="accent">${escapeHtml(snapshot.id)}</span></h1>
      </div>
    </div>
    <div class="state-panel">
      ${icon('check')}
      <h2>YA NO ESTÁ EN ESTA COLA</h2>
      <p>La emergencia fue marcada como atendida por ${escapeHtml(snapshot.department ? departmentLabel(snapshot.department) : 'el departamento seleccionado')}.${snapshot.remaining > 0 ? ` Permanece activa en ${snapshot.remaining} ${snapshot.remaining === 1 ? 'cola' : 'colas'}.` : ' No quedan colas activas para este reporte.'}</p>
      <div class="state-actions"><a class="btn btn-primary" href="#/colas">${icon('queues')}Ver colas</a><a class="btn btn-secondary" href="#/mapa">${icon('map')}Ver mapa</a></div>
    </div>
  </section>`;
}

function renderDetailMissing(id) {
  return `<section aria-labelledby="missing-title">
    <div class="page-head">
      <div class="page-head-main">
        <a class="back-link" href="#/colas">${icon('left')}Volver a colas</a>
        <span class="eyebrow">Operaciones · Detalle</span>
        <h1 id="missing-title" class="page-title">DETALLE NO <span class="accent">DISPONIBLE</span></h1>
      </div>
    </div>
    <div class="state-panel${state.queues.status === 'error' ? ' is-error' : ''}">
      ${icon(state.queues.status === 'error' ? 'alert' : 'info')}
      <h2>${state.queues.status === 'error' ? 'NO SE PUDO CONSULTAR LA COLA' : 'EMERGENCIA NO ENCONTRADA'}</h2>
      <p>${escapeHtml(state.queues.error || `La emergencia ${id} ya no está activa o no existe en los datos actuales.`)}</p>
      <div class="state-actions">
        <button type="button" class="btn btn-primary" data-action="refresh-detail" data-id="${escapeHtml(id)}">${icon('refresh')}Reintentar</button>
        <a class="btn btn-secondary" href="#/colas">${icon('queues')}Volver a colas</a>
      </div>
    </div>
  </section>`;
}

async function routeDetail(id, token) {
  document.title = `${id} // SGE`;
  if (queueNeedsLoad()) {
    showView(detailLoadingView(id), true);
    await loadQueues();
    if (token !== routeToken) return;
  }
  const item = findQueueItem(id);
  if (item) {
    showView(renderDetailView(item), true);
  } else if (state.lastAttended?.id === id && state.lastAttended.snapshot) {
    showView(renderAttendedDetail(state.lastAttended), true);
  } else {
    showView(renderDetailMissing(id), true);
  }
  startPolling(async () => {
    await loadQueues({ silent: true });
    if (token !== routeToken || activeRoute.name !== 'detalle') return;
    const updated = findQueueItem(id);
    if (updated) repaint(renderDetailView(updated), false);
    else if (state.lastAttended?.id === id && state.lastAttended.snapshot) repaint(renderAttendedDetail(state.lastAttended), false);
  }, state.config.refreshSec * 1000);
}

function filteredHistory() {
  const query = normalizeKey(state.historyQuery);
  if (!query) return state.history;
  return state.history.filter((item) => {
    const haystack = normalizeKey([
      item.id,
      item.texto,
      item.informe,
      item.transcripcion,
      ...(item.departamentos || []).map(departmentLabel)
    ].join(' '));
    return haystack.includes(query);
  });
}

function historyResultsHtml() {
  const items = filteredHistory();
  if (!state.history.length) {
    return `<div class="history-empty">${icon('history')}<h2>AÚN NO HAY CLASIFICACIONES</h2><p>Los reportes clasificados aparecerán aquí y se conservarán solo en este navegador.</p><div class="state-actions"><a class="btn btn-primary" href="#/ingreso">${icon('plus')}Crear primer reporte</a></div></div>`;
  }
  if (!items.length) {
    return `<div class="empty-inline">No hay clasificaciones que coincidan con la búsqueda. <button type="button" class="btn btn-small btn-ghost" data-action="history-clear-search">Limpiar búsqueda</button></div>`;
  }
  return `<div class="history-list">${items.map((item) => {
    const confidence = typeof item.confianza === 'number' ? Math.round(item.confianza * 100) : null;
    return `<details class="history-item">
      <summary>
        <div class="history-summary-main">
          <div class="history-top">
            ${severityTag(item.severidad)}
            ${(item.departamentos || []).map(deptChip).join('')}
            ${item.enqueued ? '<span class="badge badge-success">ENCOLADA</span>' : ''}
            <span class="history-time">${escapeHtml(timeAgo(item.fecha))} · ${escapeHtml(item.id || 'Sin ID')}</span>
          </div>
          <p class="history-text">${escapeHtml(truncate(item.texto || item.informe || 'Sin relato', 180))}</p>
        </div>
      </summary>
      <div class="history-detail">
        <div class="history-detail-inner">
          <dl class="detail-list">
            <div><dt>Severidad</dt><dd>${item.severidad || '—'} · ${escapeHtml(SEVERITIES[item.severidad]?.label || 'Sin nivel')}</dd></div>
            <div><dt>Confianza</dt><dd>${confidence === null ? 'No informada' : `${confidence}%`}</dd></div>
            <div><dt>Fecha</dt><dd>${escapeHtml(formatDate(item.fecha))}</dd></div>
            <div><dt>Origen</dt><dd>${escapeHtml(item.origen || 'texto')}</dd></div>
            <div><dt>Coordenadas</dt><dd>${Number.isInteger(item.x) && Number.isInteger(item.y) ? `X ${item.x} · Y ${item.y}` : 'Sin ubicación'}</dd></div>
            <div><dt>Estado</dt><dd>${item.enqueued ? `Encolada${item.enqueued.id ? ` · ${escapeHtml(item.enqueued.id)}` : ''}` : 'Solo clasificada'}</dd></div>
          </dl>
          ${item.informe ? `<div class="report-block"><h3>Informe</h3><div class="report-text">${escapeHtml(item.informe)}</div></div>` : ''}
          ${item.texto ? `<div class="report-block"><h3>Relato</h3><div class="report-text">${escapeHtml(item.texto)}</div></div>` : ''}
          <div class="history-actions">
            <button type="button" class="btn btn-primary" data-action="history-view" data-id="${escapeHtml(item.localId)}">${icon('spark')}Ver resultado</button>
            <button type="button" class="btn btn-secondary" data-action="history-reuse" data-id="${escapeHtml(item.localId)}">${icon('refresh')}Reutilizar relato</button>
            <button type="button" class="btn btn-danger-outline" data-action="history-delete" data-id="${escapeHtml(item.localId)}">${icon('trash')}Eliminar</button>
          </div>
        </div>
      </div>
    </details>`;
  }).join('')}</div>`;
}

function updateHistoryResults() {
  const container = document.getElementById('history-results');
  const count = document.getElementById('history-count');
  const items = filteredHistory();
  if (container) container.innerHTML = historyResultsHtml();
  if (count) count.textContent = `${items.length} ${items.length === 1 ? 'registro' : 'registros'}`;
}

function renderHistorialView() {
  const items = filteredHistory();
  return `<section aria-labelledby="history-title">
    <div class="page-head">
      <div class="page-head-main">
        <span class="eyebrow">Auditoría · Solo este navegador</span>
        <h1 id="history-title" class="page-title">HISTORIAL DE <span class="accent">CLASIFICACIONES</span></h1>
        <p class="lead">Consulta, reutiliza o elimina las clasificaciones guardadas localmente. El historial no se sincroniza entre dispositivos.</p>
      </div>
      <div class="page-head-actions">
        <button type="button" class="btn btn-danger-outline" data-action="history-clear" ${state.history.length ? '' : 'disabled'}>${icon('trash')}Vaciar historial</button>
        <a class="btn btn-primary" href="#/ingreso">${icon('plus')}Nuevo reporte</a>
      </div>
    </div>
    <div class="local-note">${icon('info')}<p><strong>Almacenamiento local.</strong> Se conservan hasta ${MAX_HISTORY} clasificaciones en <span class="mono">localStorage</span>. Limpiar los datos del navegador elimina este historial.</p></div>
    <div class="filter-bar">
      <label class="field od-fill">
        <span class="field-label">Buscar en el historial</span>
        <input class="input" type="search" data-field="history-search" value="${escapeHtml(state.historyQuery)}" placeholder="ID, texto o departamento" autocomplete="off">
      </label>
      <span id="history-count" class="muted small">${items.length} ${items.length === 1 ? 'registro' : 'registros'}</span>
    </div>
    <div id="history-results">${historyResultsHtml()}</div>
  </section>`;
}

function renderConfigView() {
  return `<section aria-labelledby="config-title">
    <div class="page-head">
      <div class="page-head-main">
        <span class="eyebrow">Configuración · Entorno local</span>
        <h1 id="config-title" class="page-title">AJUSTES DEL <span class="accent">SISTEMA</span></h1>
        <p class="lead">Define la URL del backend y el proveedor LLM. Las claves del proveedor permanecen en el servidor.</p>
      </div>
      <div class="page-head-actions">
        <a class="btn btn-secondary" href="#/estado">${icon('pulse')}Ver estado</a>
      </div>
    </div>
    <form id="config-form" class="settings-layout" novalidate>
      <div class="settings-stack">
        <section class="panel settings-section">
          <div class="panel-head"><div><h2 class="panel-title">${icon('wifi')}Conexión</h2><span class="panel-kicker">Backend de clasificación</span></div></div>
          <label class="field">
            <span class="field-label">URL base de la API <span class="field-hint">Vacío = mismo origen</span></span>
            <input class="input" name="apiBase" type="text" inputmode="url" autocomplete="off" value="${escapeHtml(state.config.apiBase)}" placeholder="https://api.ejemplo.com">
          </label>
          <label class="field">
            <span class="field-label">Proveedor LLM</span>
            <input class="input" name="provider" type="text" list="provider-options" autocomplete="off" value="${escapeHtml(state.config.provider)}" placeholder="laya">
            <datalist id="provider-options"><option value="laya"></option><option value="jev"></option><option value="reglas"></option></datalist>
          </label>
          <div class="form-grid">
            <label class="field">
              <span class="field-label">Refresco de colas</span>
              <select class="select" name="refreshSec">
                ${[10, 12, 15].map((seconds) => `<option value="${seconds}"${state.config.refreshSec === seconds ? ' selected' : ''}>${seconds} segundos</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span class="field-label">Límite de audio</span>
              <select class="select" name="audioMaxMb">
                ${[10, 15, 25, 30].map((size) => `<option value="${size}"${state.config.audioMaxMb === size ? ' selected' : ''}>${size} MB</option>`).join('')}
              </select>
            </label>
          </div>
          <div class="form-note">Si la interfaz y la API están en orígenes distintos, el backend debe permitir CORS. Las rutas se resuelven contra la URL base o contra el origen actual.</div>
          <div class="settings-actions">
            <button type="submit" class="btn btn-primary">${icon('check')}Guardar configuración</button>
            <button type="button" class="btn btn-secondary" data-action="config-test">${icon('wifi')}Probar conexión</button>
            <button type="button" class="btn btn-ghost" data-action="config-reset">${icon('refresh')}Restablecer</button>
          </div>
        </section>
        <section class="panel settings-section">
          <div class="panel-head"><div><h2 class="panel-title">${icon('queues')}Motor de operaciones</h2><span class="panel-kicker">C++ ? Docker</span></div><span class="badge badge-success">REAL</span></div>
          <p class="panel-sub">Las colas, atenciones, unidades y coordenadas se consultan al servidor C++ en <span class="mono">/api/...</span>. No hay modo simulación ni datos locales de prueba.</p>
          <div class="about-list">
            <div class="about-row"><span>Colas</span><strong>/api/colas</strong></div>
            <div class="about-row"><span>Unidades</span><strong>/api/unidades</strong></div>
            <div class="about-row"><span>Persistencia</span><strong>Memoria del motor C++</strong></div>
            <div class="about-row"><span>Datos de prueba</span><strong>Deshabilitados</strong></div>
          </div>
        </section>
        <section class="panel settings-section">
          <div class="panel-head"><div><h2 class="panel-title">${icon('shield')}Recursos</h2><span class="panel-kicker">Unidades reales del motor C++</span></div><span class="badge badge-muted">${state.units.data.length} registradas</span></div>
          <div class="form-grid">
            <label class="field"><span class="field-label">Identificador</span><input id="unit-id" class="input" type="text" placeholder="AMB-001" autocomplete="off"></label>
            <label class="field"><span class="field-label">Departamento</span><select id="unit-department" class="select">${Object.entries(DEPARTMENTS).map(([key, value]) => `<option value="${key}">${escapeHtml(value.label)}</option>`).join('')}</select></label>
            <label class="field"><span class="field-label">Coordenada X</span><input id="unit-x" class="input" type="number" min="0" max="1000" step="1" placeholder="500"></label>
            <label class="field"><span class="field-label">Coordenada Y</span><input id="unit-y" class="input" type="number" min="0" max="1000" step="1" placeholder="500"></label>
            <label class="field"><span class="field-label">Efectividad</span><input id="unit-efectividad" class="input" type="number" min="0.1" step="0.1" value="1.0"></label>
            <label class="field"><span class="field-label">Velocidad</span><input id="unit-velocidad" class="input" type="number" min="1" step="1" value="30"></label>
          </div>
          <div class="settings-actions">
            <button type="button" class="btn btn-primary" data-action="config-add-unit">${icon('plus')}Agregar unidad</button>
            <button type="button" class="btn btn-secondary" data-action="config-refresh-units" ${state.units.loading ? 'disabled' : ''}>${icon('refresh')}${state.units.loading ? 'Actualizando…' : 'Actualizar unidades'}</button>
          </div>
          <div class="units-list">
            ${state.units.data.length ? state.units.data.map((unit) => `<div class="unit-row"><div><strong>${escapeHtml(unit.nombre || unit.id)}</strong><span>${escapeHtml(departmentLabel(unit.departamento))} · ${escapeHtml(unit.estado)}</span></div><span class="badge ${unit.disponible ? 'badge-success' : 'badge-muted'}">${unit.disponible ? 'DISPONIBLE' : 'EN SERVICIO'}</span></div>`).join('') : `<div class="empty-inline">${state.units.loading ? 'Cargando unidades…' : state.units.error ? 'No se pudieron cargar las unidades.' : 'No hay unidades registradas. Agrega la primera arriba.'}</div>`}
          </div>
        </section>
        <section class="panel settings-section">
          <div class="panel-head"><div><h2 class="panel-title">${icon('history')}Datos locales</h2><span class="panel-kicker">Historial de clasificaciones</span></div><span class="badge badge-muted">${state.history.length} / ${MAX_HISTORY}</span></div>
          <p class="panel-sub">El historial se guarda en este navegador. No incluye credenciales ni claves de API.</p>
          <div class="settings-actions">
            <a class="btn btn-secondary" href="#/historial">${icon('history')}Abrir historial</a>
            <button type="button" class="btn btn-danger-outline" data-action="config-clear-history" ${state.history.length ? '' : 'disabled'}>${icon('trash')}Borrar historial</button>
          </div>
        </section>
      </div>
      <aside class="side-stack">
        <section class="panel">
          <div class="panel-head"><div><h2 class="panel-title">${icon('info')}Acerca de</h2><span class="panel-kicker">Sistema de Gestión de Emergencias</span></div></div>
          <div class="about-list">
            <div class="about-row"><span>Versión</span><strong>1.0.0</strong></div>
            <div class="about-row"><span>Frontend</span><strong>HTML · CSS · JS</strong></div>
            <div class="about-row"><span>Almacenamiento</span><strong>localStorage</strong></div>
            <div class="about-row"><span>Clasificador</span><strong>Backend real</strong></div>
            <div class="about-row"><span>API de colas</span><strong>/api/colas</strong></div>
            <div class="about-row"><span>Claves de API</span><strong>Nunca en el cliente</strong></div>
          </div>
          <p class="provider-note">Esta interfaz no solicita, muestra ni almacena claves de OpenRouter ni de ningún proveedor LLM.</p>
        </section>
        <section class="panel">
          <div class="panel-head"><div><h2 class="panel-title">${icon('queues')}Rutas</h2><span class="panel-kicker">Contrato usado por la interfaz</span></div></div>
          <div class="about-list">
            ${Object.entries(DEFAULT_ENDPOINTS).map(([key, path]) => `<div class="about-row"><span>${escapeHtml(key)}</span><strong>${escapeHtml(path)}</strong></div>`).join('')}
          </div>
        </section>
      </aside>
    </form>
  </section>`;
}

async function attendRemote(item, department) {
  const base = endpointFor('emergencias').replace(/\/+$/, '');
  const identifier = encodeURIComponent(item.id);
  const body = { departamento: department, atendida: true };
  try {
    return await apiRequest(`${base}/${identifier}/atender`, {
      method: 'POST',
      body,
      timeout: 30000
    });
  } catch (error) {
    if (error instanceof AppError && (error.status === 404 || error.status === 405)) {
      return apiRequest(`${base}/${identifier}`, {
        method: 'PATCH',
        body,
        timeout: 30000
      });
    }
    throw error;
  }
}

function paintActiveDataView() {
  if (activeRoute.name === 'colas') {
    repaint(renderColasView(), false);
    return;
  }
  if (activeRoute.name === 'mapa') {
    repaint(renderMapView(), false);
    return;
  }
  if (activeRoute.name === 'detalle') {
    const item = findQueueItem(activeRoute.id);
    if (item) repaint(renderDetailView(item), false);
    else if (state.lastAttended?.id === activeRoute.id && state.lastAttended.snapshot) repaint(renderAttendedDetail(state.lastAttended), false);
    else repaint(renderDetailMissing(activeRoute.id), false);
  }
}

async function promptAttend(item, presetDepartment) {
  if (!item) return;
  const available = remainingDepartments(item);
  if (!available.length) {
    toast('warn', 'Sin colas activas', 'La emergencia ya fue atendida en todos sus departamentos.');
    return;
  }
  const defaultDepartment = available.includes(presetDepartment) ? presetDepartment : available[0];
  const options = available.map((department) => `<label class="od-row" style="cursor:pointer;justify-content:flex-start">
      <input type="radio" name="attend-department" value="${escapeHtml(department)}"${department === defaultDepartment ? ' checked' : ''}>
      <span>${escapeHtml(departmentLabel(department))}</span>
    </label>`).join('');
  const result = await openDialog({
    title: 'Marcar como atendida',
    body: `<p>Confirma la atención de <strong>${escapeHtml(item.id)}</strong>. La emergencia seguirá visible en las demás colas de departamento.</p>
      <div class="modal-check"><div class="od-stack" style="gap:10px;width:100%"><span class="field-label" style="margin-bottom:2px">Departamento que atiende</span>${options}</div></div>
      <div class="warning"><strong>Acción por cola.</strong> Esta operación no elimina la emergencia de los otros servicios ni borra su historial.</div>`,
    confirmLabel: 'Confirmar atención',
    onConfirm(modal) {
      const selected = modal.querySelector('input[name="attend-department"]:checked');
      return selected ? selected.value : false;
    }
  });
  if (!result) return;
  await attendEmergency(item, result);
}

async function attendEmergency(item, department) {
  if (!item || !department || state.attending) return;
  state.attending = { id: item.id, department };
  paintActiveDataView();
  try {
    await attendRemote(item, department);
    item.atenciones = { ...(item.atenciones || {}), [department]: true };
    state.attendedOverrides[`${item.id}|${department}`] = true;
    const snapshot = {
      ...item,
      departamentos: [...item.departamentos],
      atenciones: { ...item.atenciones }
    };
    const remaining = remainingDepartments(item).length;
    state.lastAttended = {
      id: item.id,
      department,
      remaining,
      snapshot
    };
    toast('success', `${departmentLabel(department)} atendió la emergencia`, remaining > 0 ? `Sigue activa en ${remaining} ${remaining === 1 ? 'cola' : 'colas'}.` : 'Se cerraron todas sus colas.');
    await loadQueues({ silent: true });
    state.attending = null;
    paintActiveDataView();
  } catch (error) {
    state.attending = null;
    paintActiveDataView();
    toast('error', 'No se pudo marcar como atendida', readableError(error));
  }
}

function normalizeApiBase(value) {
  let base = String(value || '').trim();
  if (!base) return '';
  if (base.startsWith('/')) return base.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) {
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/.*)?$/i.test(base)) base = `http://${base}`;
    else throw new AppError('La URL base debe comenzar con http://, https:// o /.', { type: 'validation' });
  }
  try {
    const parsed = new URL(base);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
    return base.replace(/\/+$/, '');
  } catch {
    throw new AppError('La URL base no es válida. Ejemplo: https://api.ejemplo.com', { type: 'validation' });
  }
}

function saveConfigFromForm(form, options = {}) {
  if (!form) return false;
  const data = new FormData(form);
  const previous = {
    apiBase: state.config.apiBase,
    provider: state.config.provider
  };
  const apiBase = normalizeApiBase(data.get('apiBase'));
  const provider = String(data.get('provider') || '').trim() || 'laya';
  const refreshSec = [10, 12, 15].includes(Number(data.get('refreshSec'))) ? Number(data.get('refreshSec')) : state.config.refreshSec;
  const audioMaxMb = [10, 15, 25, 30].includes(Number(data.get('audioMaxMb'))) ? Number(data.get('audioMaxMb')) : state.config.audioMaxMb;
  state.config = normalizeConfig({
    ...state.config,
    apiBase,
    provider,
    refreshSec,
    audioMaxMb
  });
  persistConfig();
  const connectionChanged = previous.apiBase !== state.config.apiBase || previous.provider !== state.config.provider;
  if (connectionChanged) {
    state.health = {
      status: 'idle',
      data: null,
      error: null,
      checkedAt: null,
      loading: false,
      failureType: null
    };
    resetQueueState();
  }
  updateChrome();
  if (!options.silent) toast('success', 'Configuración guardada', connectionChanged ? 'Se reiniciaron los datos operativos para aplicar los cambios.' : 'Los ajustes se guardaron en este navegador.');
  if (activeRoute.name === 'config') repaint(renderConfigView(), false);
  return true;
}

async function handleConfigSubmit(form) {
  try {
    saveConfigFromForm(form);
  } catch (error) {
    toast('error', 'Configuración no válida', readableError(error));
  }
}

async function testConfiguration() {
  const form = document.getElementById('config-form');
  if (!form) return;
  try {
    saveConfigFromForm(form, { silent: true });
    toast('info', 'Probando conexión', `Consultando ${endpointFor('salud')}…`, 3000);
    await refreshHealth({ manual: true });
    if (activeRoute.name === 'config') repaint(renderConfigView(), false);
  } catch (error) {
    toast('error', 'No se pudo probar', readableError(error));
  }
}

async function addUnitFromForm() {
  const id = String(document.getElementById('unit-id')?.value || '').trim();
  const department = String(document.getElementById('unit-department')?.value || '').trim();
  const rawX = String(document.getElementById('unit-x')?.value || '').trim();
  const rawY = String(document.getElementById('unit-y')?.value || '').trim();
  const efectividad = Number(document.getElementById('unit-efectividad')?.value || 1);
  const velocidad = Number(document.getElementById('unit-velocidad')?.value || 30);
  const x = Number(rawX);
  const y = Number(rawY);
  if (!id) {
    toast('error', 'Falta el identificador', 'Escribe el ID real de la unidad.');
    return;
  }
  if (!rawX || !rawY || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 1000 || y < 0 || y > 1000) {
    toast('error', 'Coordenadas inv?lidas', 'X e Y deben ser enteros entre 0 y 1000.');
    return;
  }
  if (!Number.isFinite(efectividad) || efectividad <= 0 || !Number.isFinite(velocidad) || velocidad <= 0) {
    toast('error', 'Par?metros inv?lidos', 'Efectividad y velocidad deben ser mayores que cero.');
    return;
  }
  try {
    await apiRequest(endpointFor('unidades'), {
      method: 'POST',
      body: { id, departamento: department, x, y, efectividad, velocidad },
      timeout: 20000
    });
    document.getElementById('unit-id').value = '';
    document.getElementById('unit-x').value = '';
    document.getElementById('unit-y').value = '';
    toast('success', 'Unidad registrada', `${id} qued? disponible para ${departmentLabel(department)}.`);
    await loadUnits({ silent: true });
    if (activeRoute.name === 'config') repaint(renderConfigView(), false);
  } catch (error) {
    toast('error', 'No se pudo registrar la unidad', readableError(error));
  }
}

async function resetConfiguration() {
  const confirmed = await confirmDialog(
    'Restablecer configuración',
    '<p>Se restaurarán la URL base vacía, el proveedor <strong>laya</strong> y el refresco de 12 segundos. El historial local no se borra.</p>',
    'Restablecer',
    false
  );
  if (!confirmed) return;
  state.config = normalizeConfig(null);
  persistConfig();
  state.health = {
    status: 'idle',
    data: null,
    error: null,
    checkedAt: null,
    loading: false,
    failureType: null
  };
  resetQueueState();
  updateChrome();
  if (activeRoute.name === 'config') repaint(renderConfigView(), false);
  toast('success', 'Configuración restablecida', 'Los valores predeterminados están activos.');
}

async function clearHistory() {
  if (!state.history.length) return;
  const confirmed = await confirmDialog(
    'Vaciar historial',
    `<p>Se eliminarán las <strong>${state.history.length}</strong> clasificaciones guardadas en este navegador. Esta acción no se puede deshacer.</p>`,
    'Vaciar historial',
    true
  );
  if (!confirmed) return;
  state.history = [];
  persistHistory();
  if (activeRoute.name === 'historial') repaint(renderHistorialView(), false);
  if (activeRoute.name === 'config') repaint(renderConfigView(), false);
  toast('success', 'Historial vaciado', 'No quedan clasificaciones locales.');
}

async function deleteHistoryItem(localId) {
  const item = state.history.find((entry) => entry.localId === localId);
  if (!item) return;
  const confirmed = await confirmDialog(
    'Eliminar clasificación',
    `<p>Se eliminará <strong>${escapeHtml(item.id || 'este registro')}</strong> del historial local. La emergencia encolada, si existe, no se modifica.</p>`,
    'Eliminar',
    true
  );
  if (!confirmed) return;
  state.history = state.history.filter((entry) => entry.localId !== localId);
  persistHistory();
  if (activeRoute.name === 'historial') repaint(renderHistorialView(), false);
  if (activeRoute.name === 'config') repaint(renderConfigView(), false);
  toast('success', 'Registro eliminado', 'El historial local se actualizó.');
}

async function warmupProvider() {
  if (state.warmup.loading) return;
  state.warmup.loading = true;
  if (activeRoute.name === 'estado') repaint(renderStatusView(), false);
  try {
    const url = appendQuery(endpointFor('calentar'), 'proveedor', state.config.provider);
    await apiRequest(url, {
      method: 'POST',
      body: { proveedor: state.config.provider },
      timeout: 90000
    });
    toast('success', 'Proveedor preparado', `El backend confirmó el calentamiento de ${state.config.provider}.`);
    state.warmup.loading = false;
    await refreshHealth();
    if (activeRoute.name === 'estado') repaint(renderStatusView(), false);
  } catch (error) {
    state.warmup.loading = false;
    if (activeRoute.name === 'estado') repaint(renderStatusView(), false);
    toast('error', 'No se pudo precalentar', readableError(error));
  }
}

async function refreshQueueData() {
  await loadQueues({ silent: Boolean(state.queues.data.length) });
  if (activeRoute.name === 'colas') repaint(renderColasView(), false);
}

async function refreshMapData() {
  await Promise.all([
    loadQueues({ silent: Boolean(state.queues.data.length) }),
    loadUnits({ silent: Boolean(state.units.data.length) })
  ]);
  if (activeRoute.name === 'mapa') repaint(renderMapView(), false);
}

async function refreshDetailData(id) {
  await loadQueues({ silent: true });
  if (activeRoute.name !== 'detalle' || activeRoute.id !== id) return;
  const item = findQueueItem(id);
  if (item) repaint(renderDetailView(item), false);
  else if (state.lastAttended?.id === id && state.lastAttended.snapshot) repaint(renderAttendedDetail(state.lastAttended), false);
  else repaint(renderDetailMissing(id), false);
}

async function handleAction(action, element) {
  if (!action) return;
  if (action === 'refresh-health' || action === 'retry-health') {
    await refreshHealth({ manual: true });
    return;
  }
  if (action === 'warmup') {
    await warmupProvider();
    return;
  }
  if (action === 'retry-route') {
    await handleRoute();
    return;
  }
  if (action === 'intake-mode') {
    const mode = element.dataset.mode;
    if (!['texto', 'audio', 'microfono'].includes(mode) || state.intake.submitting) return;
    state.intake.mode = mode;
    state.intake.error = null;
    repaint(renderIngresoView(), false);
    return;
  }
  if (action === 'choose-file') {
    const input = document.getElementById('audio-file');
    if (input) input.click();
    return;
  }
  if (action === 'clear-media') {
    clearIntakeMedia();
    state.intake.error = null;
    if (activeRoute.name === 'ingreso') repaint(renderIngresoView(), false);
    return;
  }
  if (action === 'record-start') {
    await startRecording();
    return;
  }
  if (action === 'record-stop') {
    stopRecording();
    return;
  }
  if (action === 'record-cancel') {
    stopRecording({ discard: true });
    return;
  }
  if (action === 'retry-intake') {
    await submitIntake();
    return;
  }
  if (action === 'result-enqueue') {
    await enqueueDraft();
    return;
  }
  if (action === 'result-new') {
    startNewReport();
    return;
  }
  if (action === 'result-reuse') {
    editDraftInIntake();
    return;
  }
  if (action === 'result-copy') {
    try {
      await copyText(draftCopyText(state.draft || {}));
      toast('success', 'Informe copiado', 'El contenido está en el portapapeles.');
    } catch (error) {
      toast('error', 'No se pudo copiar', readableError(error));
    }
    return;
  }
  if (action === 'refresh-queues') {
    await refreshQueueData();
    return;
  }
  if (action === 'queue-dept') {
    const department = element.dataset.dept;
    if (!department) return;
    state.filters.queueDept = department;
    repaint(renderColasView(), false);
    return;
  }
  if (action === 'queue-all') {
    state.filters.queueDept = 'todas';
    repaint(renderColasView(), false);
    return;
  }
  if (action === 'queue-clear-filters') {
    state.filters.queueDept = 'todas';
    state.filters.queueSeverity = 'todas';
    state.filters.queueQuery = '';
    repaint(renderColasView(), false);
    return;
  }
  if (action === 'queue-open' || action === 'map-open') {
    const id = element.dataset.id;
    if (id) navigate(`#/detalle/${encodeURIComponent(id)}`);
    return;
  }
  if (action === 'queue-attend') {
    const item = findQueueItem(element.dataset.id);
    await promptAttend(item);
    return;
  }
  if (action === 'detail-attend') {
    const item = findQueueItem(element.dataset.id);
    await promptAttend(item, element.dataset.dept);
    return;
  }
  if (action === 'refresh-detail') {
    await refreshDetailData(element.dataset.id || activeRoute.id);
    return;
  }
  if (action === 'refresh-map') {
    await refreshMapData();
    return;
  }
  if (action === 'unit-info') {
    const unit = state.units.data.find((entry) => entry.id === element.dataset.id);
    openUnitDialog(unit);
    return;
  }
  if (action === 'history-view') {
    const item = state.history.find((entry) => entry.localId === element.dataset.id);
    restoreDraft(item);
    return;
  }
  if (action === 'history-reuse') {
    const item = state.history.find((entry) => entry.localId === element.dataset.id);
    historyItemToIntake(item);
    return;
  }
  if (action === 'history-delete') {
    await deleteHistoryItem(element.dataset.id);
    return;
  }
  if (action === 'history-clear') {
    await clearHistory();
    return;
  }
  if (action === 'history-clear-search') {
    state.historyQuery = '';
    repaint(renderHistorialView(), false);
    return;
  }
  if (action === 'config-test') {
    await testConfiguration();
    return;
  }
  if (action === 'config-reset') {
    await resetConfiguration();
    return;
  }
  if (action === 'config-add-unit') {
    await addUnitFromForm();
    return;
  }
  if (action === 'config-refresh-units') {
    await loadUnits();
    if (activeRoute.name === 'config') repaint(renderConfigView(), false);
    return;
  }
  if (action === 'config-clear-history') {
    await clearHistory();
  }
}

function handleClick(event) {
  const actionElement = event.target.closest('[data-action]');
  if (!actionElement) return;
  event.preventDefault();
  const action = actionElement.dataset.action;
  Promise.resolve(handleAction(action, actionElement)).catch((error) => {
    toast('error', 'Acción no completada', readableError(error));
  });
}

function handleSubmit(event) {
  if (event.target.id === 'intake-form') {
    event.preventDefault();
    submitIntake();
    return;
  }
  if (event.target.id === 'config-form') {
    event.preventDefault();
    handleConfigSubmit(event.target);
  }
}

function handleInput(event) {
  const field = event.target.dataset.field;
  if (!field) return;
  if (field === 'intake-text') {
    state.intake.text = event.target.value;
    const count = event.target.value.length;
    const counter = document.getElementById('char-count');
    if (counter) {
      counter.textContent = `${count} / ${MAX_TEXT}`;
      counter.classList.toggle('is-over', count >= MAX_TEXT);
    }
    return;
  }
  if (field === 'loc-x' || field === 'loc-y') {
    state.intake[field === 'loc-x' ? 'x' : 'y'] = event.target.value;
    updateLocationPreview();
    return;
  }
  if (field === 'queue-search') {
    state.filters.queueQuery = event.target.value;
    updateQueueResults();
    return;
  }
  if (field === 'history-search') {
    state.historyQuery = event.target.value;
    updateHistoryResults();
  }
}

function handleChange(event) {
  const target = event.target;
  if (target.id === 'audio-file') {
    acceptAudioFile(target.files?.[0]);
    target.value = '';
    return;
  }
  if (target.dataset.filter === 'queue-severity') {
    state.filters.queueSeverity = target.value;
    repaint(renderColasView(), false);
    return;
  }
  if (target.dataset.filter === 'map-severity') {
    state.filters.mapSeverity = target.value;
    repaint(renderMapView(), false);
    return;
  }
  if (target.dataset.filter === 'map-dept') {
    state.filters.mapDept = target.value;
    repaint(renderMapView(), false);
  }
}

function handleKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && event.target.id === 'intake-text') {
    event.preventDefault();
    const form = document.getElementById('intake-form');
    if (form) form.requestSubmit();
  }
}

function handleDragOver(event) {
  const dropzone = event.target.closest('[data-dropzone]');
  if (!dropzone) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  dropzone.classList.add('is-dragover');
}

function handleDragLeave(event) {
  const dropzone = event.target.closest('[data-dropzone]');
  if (!dropzone) return;
  if (dropzone.contains(event.relatedTarget)) return;
  dropzone.classList.remove('is-dragover');
}

function handleDrop(event) {
  const dropzone = event.target.closest('[data-dropzone]');
  if (!dropzone) return;
  event.preventDefault();
  dropzone.classList.remove('is-dragover');
  const file = event.dataTransfer?.files?.[0];
  if (file) acceptAudioFile(file);
}

function bindEvents() {
  document.addEventListener('click', handleClick);
  document.addEventListener('submit', handleSubmit);
  document.addEventListener('input', handleInput);
  document.addEventListener('change', handleChange);
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('dragover', handleDragOver);
  document.addEventListener('dragleave', handleDragLeave);
  document.addEventListener('drop', handleDrop);
  window.addEventListener('hashchange', () => {
    handleRoute().catch((error) => {
      showView(renderFatalView('No se pudo navegar', readableError(error)), true);
    });
  });
  window.addEventListener('online', () => {
    updateChrome();
    toast('success', 'Conexión recuperada', 'El navegador volvió a estar en línea.');
    refreshHealth();
    if (activeRefresh && activeRoute.name !== 'estado') Promise.resolve(activeRefresh()).catch(() => {});
  });
  window.addEventListener('offline', () => {
    updateChrome();
    toast('warn', 'Conexión perdida', 'El navegador está sin conexión. Los datos visibles pueden estar desactualizados.');
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && activeRefresh && !activeDialog) {
      Promise.resolve(activeRefresh()).catch(() => {});
    }
  });
  window.addEventListener('beforeunload', () => {
    if (recorderSession) {
      if (recorderSession.timer) clearInterval(recorderSession.timer);
      recorderSession.stream.getTracks().forEach((track) => track.stop());
      recorderSession = null;
    }
  });
}

function init() {
  if (!location.hash) history.replaceState(null, '', '#/estado');
  renderNav('estado');
  updateChrome();
  bindEvents();
  handleRoute().catch((error) => {
    showView(renderFatalView('No se pudo iniciar la aplicación', readableError(error)), true);
  });
  if (parseRoute().name !== 'estado') refreshHealth();
}

init();

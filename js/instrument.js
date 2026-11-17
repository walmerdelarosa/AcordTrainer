// Modelo del acordeón diatónico de 3 hileras (31 botones + 12 bajos).
// Base: Cinco Letras (B♭–E♭–A♭), mapa "Cerrando / Abriendo" de un Corona III.
// Las demás afinaciones se obtienen por transposición.
//
// Convenciones:
//  - Botón 1 = el de arriba (cerca de la barbilla); la altura sube hacia abajo.
//  - push = cerrando el fuelle, pull = abriendo el fuelle. Valores MIDI.
//  - Octavas: estimadas para que cada hilera suba de arriba hacia abajo. La clase de nota
//    (Do, Re…) viene del mapa de referencia; el registro exacto está POR VALIDAR con un instrumento real.
//  - aux: botones auxiliares (el primero de cada hilera). Son la única fuente de algunas notas
//    cromáticas, y el método de referencia los usa en cualquier octava (p. ej. Si en Do mayor y en la cromática
//    de Do, una octava más arriba). Por eso la digitación los acepta por clase de nota.

import { midiToPc, spellPc, nameEs, nameEn } from './theory.js';

export const ROWS = [
  { id: 'afuera', label: 'Hilera de afuera' },
  { id: 'medio', label: 'Hilera del medio' },
  { id: 'adentro', label: 'Hilera de adentro' },
];

// [push, pull] por botón, de arriba hacia abajo.
const BASE = {
  afuera: [
    [64, 66, true], // Mi / Fa♯ (aux)
    [58, 60], [62, 63], [65, 67], [70, 69], [74, 72], [77, 75], [82, 79], [86, 81], [89, 84],
  ],
  medio: [
    [69, 71, true], // La / Si (aux)
    [58, 62], [63, 65], [67, 68], [70, 72], [75, 74], [79, 77], [82, 80], [87, 84], [91, 86], [94, 89],
  ],
  adentro: [
    [66, 64, true], // Fa♯ / Mi (aux)
    [63, 67], [68, 70], [72, 73], [75, 77], [80, 79], [84, 82], [87, 85], [92, 89], [96, 91],
  ],
};

// Bajos (12 botones, 2 columnas × 6). En el mapa de referencia cada nombre aparece en dos botones
// seguidos: lo modelamos como par bajo (nota sola) + acorde. Calidad del acorde POR VALIDAR.
const BASS_BASE = [
  // [columna, fila, push pc, pull pc]
  [0, 0, 7, 0], [0, 1, 7, 0], [0, 2, 0, 5], [0, 3, 0, 5], [0, 4, 1, 1], [0, 5, 1, 1],
  [1, 0, 10, 5], [1, 1, 10, 5], [1, 2, 3, 10], [1, 3, 3, 10], [1, 4, 8, 3], [1, 5, 8, 3],
];

// offset = semitonos respecto a Cinco Letras (solo cambia la clase de nota; el registro es aproximado).
export const TUNINGS = [
  { id: 'cinco-letras', name: 'Cinco Letras', rows: 'B♭ – E♭ – A♭', es: 'Si♭ – Mi♭ – La♭', offset: 0, group: 'fabrica', pref: 'flat',
    note: 'Estándar del vallenato y la cumbia.' },
  { id: 'adg', name: 'ADG', rows: 'A – D – G', es: 'La – Re – Sol', offset: -1, group: 'fabrica', pref: 'sharp',
    note: 'Brillante; muy usada en vallenato moderno y comercial.' },
  { id: 'gcf', name: 'GCF', rows: 'G – C – F', es: 'Sol – Do – Fa', offset: -3, group: 'fabrica', pref: 'flat',
    note: 'Grave y dulce; preferida en música sabanera y cumbia tradicional.' },
  { id: 'cuatro-letras', name: 'Cuatro Letras', rows: 'F – B♭ – E♭', es: 'Fa – Si♭ – Mi♭', offset: -5, group: 'fabrica', pref: 'flat',
    note: 'Grave y profunda, para voces de tesitura baja.' },
  { id: 'ead', name: 'EAD', rows: 'E – A – D', es: 'Mi – La – Re', offset: -6, group: 'fabrica', pref: 'sharp',
    note: 'Menos común en tarima; timbre grave intermedio.' },
  { id: 'simila', name: 'Simila', rows: 'B – E – A', es: 'Si – Mi – La', offset: 1, group: 'taller', pref: 'sharp',
    note: 'Cinco Letras subido medio tono.' },
  { id: 'lluvia', name: 'Lluvia', rows: 'C♯ – F♯ – B', es: 'Do♯ – Fa♯ – Si', offset: 3, group: 'taller', pref: 'sharp',
    note: 'Alta y cristalina.' },
  { id: 'colibri', name: 'Colibrí', rows: 'E♭ – A♭ – D♭', es: 'Mi♭ – La♭ – Re♭', offset: 5, group: 'taller', pref: 'flat',
    note: 'Muy aguda.' },
  { id: 'gcf-alzao', name: 'GCF Alzao / ADG medio tono abajo', rows: 'G♯ – C♯ – F♯ (= A♭ – D♭ – G♭)', es: 'Sol♯ – Do♯ – Fa♯', offset: -2, group: 'taller', pref: 'sharp',
    note: 'GCF subido medio tono. Suena igual que un ADG bajado medio tono (A♭–D♭–G♭): son la misma afinación con distinto nombre.' },
  { id: 'cfbb', name: 'C – F – B♭', rows: 'C – F – B♭', es: 'Do – Fa – Si♭', offset: 2, group: 'taller', pref: 'flat',
    note: 'GCF transportado para ganar proyección.' },
  { id: 'dgc', name: 'D – G – C', rows: 'D – G – C', es: 'Re – Sol – Do', offset: 4, group: 'taller', pref: 'sharp',
    note: 'ADG transportado a Re–Sol–Do.' },
];

export const getTuning = (id) => TUNINGS.find((t) => t.id === id) || TUNINGS[0];

/** Tónica (clase de nota) de cada hilera para una afinación. Afuera, medio, adentro. */
export function rowKeys(tuning) {
  return [10, 3, 8].map((pc) => (pc + tuning.offset + 120) % 12);
}

/** Lista de botones de la mano derecha para una afinación. */
export function buttons(tuning) {
  const out = [];
  for (const row of ROWS) {
    BASE[row.id].forEach(([push, pull, aux], i) => {
      out.push({
        id: `${row.id}-${i + 1}`,
        row: row.id,
        rowIndex: ROWS.indexOf(row),
        index: i + 1,
        aux: !!aux,
        push: push + tuning.offset,
        pull: pull + tuning.offset,
      });
    });
  }
  return out;
}

export function bassButtons(tuning) {
  return BASS_BASE.map(([col, row, push, pull]) => ({
    id: `bajo-${col}-${row}`,
    col,
    row,
    kind: row % 2 === 0 ? 'bajo' : 'acorde',
    push: (push + tuning.offset + 120) % 12,
    pull: (pull + tuning.offset + 120) % 12,
  }));
}

/** Número de botón de bajo para la tablatura (1–12: columna de afuera 1–6, de adentro 7–12). */
export const bassNumber = (b) => b.col * 6 + b.row + 1;

/** Botones de bajo que producen un bajo/acorde con esa raíz. */
export function bassPositions(tuning, kind, pc) {
  const out = [];
  for (const b of bassButtons(tuning)) {
    if (b.kind !== kind) continue;
    if (b.push === pc) out.push({ btn: b, dir: 'push' });
    if (b.pull === pc) out.push({ btn: b, dir: 'pull' });
  }
  return out;
}

/**
 * Direcciones del fuelle que impone cada evento de la mano izquierda.
 * Devuelve para cada nota de melodía 'push' | 'pull' | null según el bajo que suena a la vez.
 */
export function bellowsHintsFromBass(tuning, melody, bassEvents) {
  return melody.map((n) => {
    const mid = (n.start + n.end) / 2;
    const ev = bassEvents.find((e) => e.start <= mid && mid < e.end);
    if (!ev) return null;
    const dirs = new Set(bassPositions(tuning, ev.kind, ev.pc).map((p) => p.dir));
    return dirs.size === 1 ? [...dirs][0] : null;
  });
}

/** Asigna botón de bajo a cada evento, prefiriendo la dirección del fuelle de la melodía simultánea. */
export function assignBass(tuning, bassEvents, melody) {
  return bassEvents.map((e) => {
    const cands = bassPositions(tuning, e.kind, e.pc);
    const mid = e.start + 0.05;
    const m = melody.find((n) => n.start <= mid && mid < n.end && n.pos);
    const pick = cands.find((c) => m && c.dir === m.pos.dir) || cands[0] || null;
    return { ...e, pos: pick };
  });
}

export function buttonLabel(btn, dir, tuning, lang = 'es') {
  // Los auxiliares se nombran con sostenidos, como en los gráficos de botones (Fa♯, no Sol♭)
  const n = spellPc(midiToPc(dir === 'push' ? btn.push : btn.pull), btn.aux ? 'sharp' : tuning.pref);
  return lang === 'es' ? nameEs(n) : nameEn(n);
}

/**
 * Posiciones (botón + dirección) para una nota MIDI. Incluye la altura exacta y, para los
 * botones auxiliares, la misma clase de nota en otra octava (octaveFlex), como hace el método de referencia.
 */
export function positionsForMidi(tuning, midi, { allowAuxFlex = true } = {}) {
  const res = [];
  const pc = midiToPc(midi);
  for (const b of buttons(tuning)) {
    for (const dir of ['push', 'pull']) {
      const m = b[dir];
      if (m === midi) res.push({ btn: b, dir, midi, octaveFlex: false });
      else if (allowAuxFlex && b.aux && midiToPc(m) === pc) res.push({ btn: b, dir, midi, octaveFlex: true });
    }
  }
  return res;
}

/** Posiciones por clase de nota (cualquier octava). */
export function positionsForPc(tuning, pc) {
  const res = [];
  for (const b of buttons(tuning)) {
    if (midiToPc(b.push) === pc) res.push({ btn: b, dir: 'push', midi: b.push });
    if (midiToPc(b.pull) === pc) res.push({ btn: b, dir: 'pull', midi: b.pull });
  }
  return res;
}

// ---------- Digitación ----------
// Costo de pasar de una posición a otra. El método de referencia prioriza no cambiar el fuelle
// (p. ej. Do mayor en Cinco Letras: 7 de 8 notas abriendo), y acepta cambiar de hilera.
export const COST = { bellows: 2.0, row: 0.9, distance: 0.35, aux: 0.8, homeRow: 0.6, dirHint: 3.0 };

function stepCost(a, b) {
  if (!a) return 0;
  let c = 0;
  if (a.dir !== b.dir) c += COST.bellows;
  c += Math.abs(a.btn.rowIndex - b.btn.rowIndex) * COST.row;
  c += Math.max(0, Math.abs(a.btn.index - b.btn.index) - 1) * COST.distance;
  return c;
}

/**
 * Elige botón y fuelle para una secuencia de notas MIDI (Viterbi).
 * homeRow: hilera preferida. onlyRow: restringe a una hilera (ejercicios "por hilera").
 * dirHints: dirección del fuelle sugerida por nota ('push' | 'pull' | null), p. ej. por los bajos.
 * Devuelve { positions, cost, missing }. positions[i] es null si la nota no existe.
 */
export function fingerSequence(tuning, midis, { homeRow = null, onlyRow = null, dirHints = null } = {}) {
  const cands = midis.map((m) =>
    positionsForMidi(tuning, m).filter((p) => !onlyRow || p.btn.row === onlyRow));
  const n = midis.length;
  const cost = [], back = [];
  for (let i = 0; i < n; i++) {
    cost.push([]); back.push([]);
    cands[i].forEach((p, j) => {
      const own = (p.btn.aux ? COST.aux : 0) + (homeRow && p.btn.row !== homeRow ? COST.homeRow : 0)
        + (dirHints && dirHints[i] && dirHints[i] !== p.dir ? COST.dirHint : 0);
      if (i === 0 || cands[i - 1].length === 0) { cost[i][j] = own; back[i][j] = -1; return; }
      let best = Infinity, arg = -1;
      cands[i - 1].forEach((q, k) => {
        // Repetir el mismo botón y fuelle para notas distintas es imposible.
        const same = q.btn.id === p.btn.id && q.dir === p.dir && q.midi !== p.midi;
        const c = cost[i - 1][k] + stepCost(q, p) + (same ? 50 : 0);
        if (c < best) { best = c; arg = k; }
      });
      cost[i][j] = best + own; back[i][j] = arg;
    });
  }
  const positions = new Array(n).fill(null);
  let total = 0, missing = 0, j = -1;
  for (let i = n - 1; i >= 0; i--) {
    if (cands[i].length === 0) { j = -1; missing++; continue; }
    if (j < 0) {
      j = cost[i].reduce((bi, v, k, arr) => (v < arr[bi] ? k : bi), 0);
      total += cost[i][j];
    }
    positions[i] = cands[i][j];
    j = back[i][j];
  }
  return { positions, cost: total, missing };
}

/**
 * Plan completo para una escala o arpegio ascendente dado en clases de nota:
 * prueba cada octava de inicio posible y se queda con la de menos notas faltantes y menor costo.
 */
export function planAscending(tuning, pcs, opts = {}) {
  const startsFor = (bs) => [...new Set(bs.flatMap((b) => [b.push, b.pull])
    .filter((m) => midiToPc(m) === pcs[0]))].sort((a, b) => a - b);
  let starts = startsFor(buttons(tuning).filter((b) => !b.aux));
  if (!starts.length) {
    // La tónica solo está en un botón auxiliar: probamos arrancar en varias octavas.
    const [lo, hi] = range(tuning);
    for (let m = lo; m <= hi - 12; m++) if (midiToPc(m) === pcs[0]) starts.push(m);
  }
  let best = null;
  for (const s of starts) {
    const midis = placeAscending(tuning, pcs, s);
    const r = fingerSequence(tuning, midis, opts);
    const score = r.missing * 100 + r.cost + (s - starts[0]) * 0.05; // ligera preferencia por lo grave
    if (!best || score < best.score) best = { ...r, midis, score };
  }
  return best;
}

/** Rango de notas disponibles (MIDI) de la mano derecha. */
export function range(tuning) {
  const all = buttons(tuning).flatMap((b) => [b.push, b.pull]);
  return [Math.min(...all), Math.max(...all)];
}

/**
 * Convierte una lista de clases de nota (escala o acorde ascendente) en MIDI concretos,
 * empezando en la octava de la tónica que mejor cabe en el teclado.
 */
export function placeAscending(tuning, pcs, startMidi) {
  const out = [];
  let cur = startMidi;
  pcs.forEach((pc, i) => {
    if (i === 0) {
      cur = startMidi;
    } else {
      cur = cur + ((((pc - midiToPc(cur)) % 12) + 12) % 12 || 12);
    }
    out.push(cur);
  });
  return out;
}


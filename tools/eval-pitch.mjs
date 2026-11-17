// Banco de pruebas del detector de altura con señales sintéticas tipo acordeón.
// Uso: node tools/eval-pitch.mjs [--threshold 0.12] [--minClarity 0.75] [--json]
//
// Mide, por escenario:
//  - voiced: % de cuadros con nota donde el detector dio una altura
//  - acc50:  % de cuadros con altura dentro de ±50 cents de la nota real (precisión bruta)
//  - oct:    % de errores de octava (±12 semitonos)
//  - clase:  % de cuadros con la clase de nota correcta (ignorando octava; es lo que usa la app)
//  - cents:  error mediano en cents de los aciertos
//  - notas:  F1 a nivel de nota (onset ±80 ms) tras el seguidor
//
// IMPORTANTE: esto es sintético. Sirve para comparar ajustes; la calibración final
// debe hacerse con grabaciones reales etiquetadas (ver docs/PLAN.md, "Afinar el pitch").

import { YinDetector, freqToMidiFloat } from '../js/pitch/yin.js';
import { analyzeBuffer, createDetector } from '../js/pitch/tracker.js';
const ALGO = process.argv.includes('--algo') ? process.argv[process.argv.indexOf('--algo') + 1] : 'yin';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const detOpts = {};
for (const k of ['oddRatio', 'melodyBias', 'harmonicDecay', 'lowCutHz', 'sigmaCents', 'threshold', 'minClarity', 'minRms', 'minFreq', 'maxFreq']) if (args[k]) detOpts[k] = +args[k];

const SR = 22050;
let seed = 12345;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Una lengüeta: armónicos ricos, con leve jitter de fase.
function reed(out, f, amp, start, len, phase0 = rand() * 6.28) {
  const H = Math.min(14, Math.floor((SR / 2) / f));
  for (let h = 1; h <= H; h++) {
    const a = amp / Math.pow(h, 0.9) * (h % 2 === 0 ? 0.8 : 1);
    const w = (2 * Math.PI * f * h) / SR;
    const ph = phase0 * h;
    for (let i = 0; i < len; i++) {
      const env = Math.min(1, i / (0.015 * SR), (len - i) / (0.02 * SR));
      out[start + i] += a * env * Math.sin(w * i + ph);
    }
  }
}

// Voz de acordeón: M + M con trémolo (+cents) y opcional L (octava abajo).
function accordionNote(out, midi, start, len, { tremolo = 12, voices = 'MM', amp = 0.25 } = {}) {
  const f = mtof(midi);
  reed(out, f, amp, start, len);
  if (voices.includes('MM')) reed(out, f * Math.pow(2, tremolo / 1200), amp, start, len);
  if (voices.includes('MMM')) reed(out, f * Math.pow(2, -tremolo / 1200), amp, start, len);
  if (voices.startsWith('L')) reed(out, f / 2, amp * 0.7, start, len);
}

function addBass(out, midiRoot, amp) { // bajo + acorde de la mano izquierda
  const n = out.length, beat = Math.floor(0.25 * SR);
  for (let s = 0; s + beat < n; s += beat * 2) {
    reed(out, mtof(midiRoot - 12), amp, s, beat);
    for (const iv of [0, 4, 7]) reed(out, mtof(midiRoot + iv), amp * 0.5, s + beat, beat);
  }
}

function addPercussion(out, amp) { // caja (golpes) + guacharaca (raspado agudo)
  const n = out.length, beat = Math.floor(0.25 * SR);
  let prev = 0;
  for (let s = 0; s < n; s += beat) {
    const len = Math.floor(0.06 * SR);
    for (let i = 0; i < len && s + i < n; i++) out[s + i] += amp * gauss() * Math.exp(-i / (0.012 * SR));
  }
  for (let i = 0; i < n; i++) { // guacharaca: ruido filtrado pasa-altos, modulado
    const x = gauss(); const hp = x - prev; prev = x;
    out[i] += amp * 0.25 * hp * (0.5 + 0.5 * Math.sin((2 * Math.PI * 8 * i) / SR));
  }
}

function addNoise(out, snrDb) {
  let p = 0; for (const v of out) p += v * v; p /= out.length;
  const np = p / Math.pow(10, snrDb / 10), s = Math.sqrt(np);
  for (let i = 0; i < out.length; i++) out[i] += s * gauss();
}

// Melodía de prueba: recorre el registro de la mano derecha (Mi4–Do7 aprox.)
function melody() {
  const notes = [];
  let t = 0.1;
  for (let k = 0; k < 40; k++) {
    const midi = 60 + Math.floor(rand() * 34); // Do4..La6
    const dur = 0.12 + rand() * 0.35;
    notes.push({ midi, start: t, end: t + dur });
    t += dur + (rand() < 0.3 ? 0.05 : 0.0);
  }
  return { notes, total: t + 0.2 };
}

function render(scn) {
  const { notes, total } = melody();
  const out = new Float32Array(Math.ceil(total * SR));
  for (const n of notes) accordionNote(out, n.midi, Math.floor(n.start * SR), Math.floor((n.end - n.start) * SR), scn);
  if (scn.bass) addBass(out, 58, scn.bass);
  if (scn.perc) addPercussion(out, scn.perc);
  if (scn.snr != null) addNoise(out, scn.snr);
  return { out, notes };
}

const SCENARIOS = [
  { name: 'limpio MM trémolo 12c', voices: 'MM', tremolo: 12 },
  { name: 'MMM trémolo 20c', voices: 'MMM', tremolo: 20 },
  { name: 'LMM (octava grave)', voices: 'LMM', tremolo: 12 },
  { name: '+ bajos mano izq.', voices: 'MM', tremolo: 12, bass: 0.12 },
  { name: '+ caja y guacharaca', voices: 'MM', tremolo: 12, perc: 0.15 },
  { name: 'conjunto + ruido 15dB', voices: 'MM', tremolo: 12, bass: 0.12, perc: 0.15, snr: 15 },
  { name: 'conjunto + ruido 5dB', voices: 'MM', tremolo: 12, bass: 0.12, perc: 0.15, snr: 5 },
];

const FRAME = 2048, HOP = 256;
const rows = [];
for (const scn of SCENARIOS) {
  seed = 999; // misma melodía para todos
  const { out, notes } = render(scn);
  const det = createDetector(ALGO, { sampleRate: SR, ...detOpts });
  let voicedFrames = 0, detected = 0, ok = 0, oct = 0, pcOk = 0; const cents = [];
  const frame = new Float32Array(FRAME);
  for (let pos = 0; pos + FRAME < out.length; pos += HOP) {
    const t = (pos + FRAME / 2) / SR;
    const truth = notes.find((n) => t > n.start + 0.03 && t < n.end - 0.03);
    if (!truth) continue;
    voicedFrames++;
    frame.set(out.subarray(pos, pos + FRAME));
    const r = det.detect(frame);
    if (r.freq <= 0) continue;
    detected++;
    const err = freqToMidiFloat(r.freq) - truth.midi;
    const pe = ((err % 12) + 18) % 12 - 6;
    if (Math.abs(pe) < 0.5) pcOk++;
    if (Math.abs(err) < 0.5) { ok++; cents.push(Math.abs(err * 100)); }
    else if (Math.abs(Math.abs(err) - 12) < 0.5) { oct++; if (process.env.DBG) console.log("oct", truth.midi, err.toFixed(2), (t-truth.start).toFixed(2)); }
  }
  const { notes: found } = await analyzeBuffer(out, SR, { frameSize: FRAME, hop: HOP, algorithm: ALGO, detector: detOpts });
  let tp = 0; const used = new Set();
  for (const n of notes) {
    const m = found.findIndex((f, i) => !used.has(i) && f.midi === n.midi && Math.abs(f.start - n.start) < 0.08);
    if (m >= 0) { tp++; used.add(m); }
  }
  const prec = found.length ? tp / found.length : 0, rec = tp / notes.length;
  cents.sort((a, b) => a - b);
  rows.push({
    escenario: scn.name,
    voiced: (100 * detected / voicedFrames).toFixed(1),
    acc50: (100 * ok / voicedFrames).toFixed(1),
    oct: (100 * oct / voicedFrames).toFixed(1),
    clase: (100 * pcOk / voicedFrames).toFixed(1),
    cents: cents.length ? cents[Math.floor(cents.length / 2)].toFixed(1) : '-',
    notasF1: ((2 * prec * rec) / (prec + rec || 1)).toFixed(2),
  });
}
if (args.json) console.log(JSON.stringify({ detOpts, rows }, null, 2));
else { console.log('Algoritmo:', ALGO, 'Parámetros:', JSON.stringify(detOpts)); console.table(rows); }

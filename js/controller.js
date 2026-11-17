// Instrumento único de la app: sonido, fuelle y teclado del PC, compartidos por todas las
// botoneras en pantalla (los costados, la página Botonera, la práctica).
import { noteOn, noteOff, allNotesOff } from './audio.js';
import { attachKeys, hintsFor } from './pckeys.js';
import { buttons, bassButtons } from './instrument.js';

const store = {
  get(k, d) { try { const v = localStorage.getItem('acordeon:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('acordeon:' + k, JSON.stringify(v)); } catch { /* */ } },
};
const finePointer = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;

export const prefs = {
  orientation: store.get('kb.orientation', finePointer() ? 'horizontal' : 'vertical'),
  layout: store.get('kb.layout', 'latam'),
  mirror: store.get('kb.mirror', false),
  bellowsMode: store.get('kb.bellows', 'hold'),
  hints: store.get('kb.hints', finePointer()),
};
const PREF_KEYS = { orientation: 'kb.orientation', layout: 'kb.layout', mirror: 'kb.mirror', bellowsMode: 'kb.bellows', hints: 'kb.hints' };

let tuning = null, dir = 'push', ids = {}, keys = null;
const held = new Map();
const keyboards = new Set();
const noteListeners = new Set(), dirListeners = new Set(), prefListeners = new Set();
let marks = [];

const midiOf = (b, d) => (b.bass ? (b.kind === 'bajo' ? 36 + b[d] : 48 + b[d]) : b[d]);
const index = () => {
  ids = Object.fromEntries([...buttons(tuning).map((b) => [b.id, b]), ...bassButtons(tuning).map((b) => [b.id, { ...b, bass: true }])]);
};

function sound(id, b, on) {
  if (!on) { noteOff(id); noteOff(id + 'c3'); noteOff(id + 'c5'); return; }
  const midi = midiOf(b, dir);
  if (b.bass && b.kind === 'acorde') {
    noteOn(id, midi, { bass: true, chord: true, gain: 0.22 });
    noteOn(id + 'c3', midi + 4, { bass: true, chord: true, gain: 0.18 });
    noteOn(id + 'c5', midi + 7, { bass: true, chord: true, gain: 0.18 });
  } else noteOn(id, midi, { bass: !!b.bass });
}

export const ctrl = {
  init(t) {
    tuning = t; index();
    this.attachKeys();
  },
  get tuning() { return tuning; },
  get dir() { return dir; },

  press(id, source = 'pantalla') {
    const b = ids[id]; if (!b) return;
    held.set(id, b);
    sound(id, b, true);
    keyboards.forEach((k) => k.press(id, true));
    const e = { btn: b, dir, midi: midiOf(b, dir), bass: !!b.bass, source };
    noteListeners.forEach((fn) => fn(e));
  },
  release(id) {
    if (!held.has(id)) return;
    held.delete(id);
    sound(id, null, false);
    keyboards.forEach((k) => k.press(id, false));
  },
  setDir(d) {
    if (d === dir) return;
    dir = d;
    keyboards.forEach((k) => { if (k.mode !== 'both') k.setMode(d); });
    dirListeners.forEach((fn) => fn(d));
    // Botones sostenidos: al invertir el fuelle cambia la nota (instrumento bisonoro)
    for (const id of [...held.keys()]) { held.delete(id); sound(id, null, false); this.press(id, 'fuelle'); }
  },
  setTuning(t) {
    allNotesOff(); held.clear();
    tuning = t; index();
    keyboards.forEach((k) => k.setTuning(t));
  },

  /** Registra una botonera en pantalla para que refleje fuelle, botones presionados y marcas. */
  register(kb, { follow = true } = {}) {
    keyboards.add(kb);
    if (follow && kb.mode !== 'both') kb.setMode(dir);
    if (marks.length) kb.mark(marks);
    return () => keyboards.delete(kb);
  },
  /** Marca botones en todas las botoneras (p. ej. la nota que toca ahora). */
  mark(list = []) { marks = list; keyboards.forEach((k) => k.mark(list)); },

  onNote(fn) { noteListeners.add(fn); return () => noteListeners.delete(fn); },
  onDir(fn) { dirListeners.add(fn); return () => dirListeners.delete(fn); },
  onPrefs(fn) { prefListeners.add(fn); return () => prefListeners.delete(fn); },

  hints() { return prefs.hints ? hintsFor(prefs) : null; },
  setPrefs(p) {
    Object.assign(prefs, p);
    Object.entries(PREF_KEYS).forEach(([k, s]) => store.set(s, prefs[k]));
    this.attachKeys();
    prefListeners.forEach((fn) => fn(prefs));
  },
  attachKeys() {
    keys?.detach();
    keys = attachKeys({
      down: (ref) => this.press(ref.id, 'teclado'),
      up: (ref) => this.release(ref.id),
      bellows: (d) => this.setDir(d),
    }, { mirror: prefs.mirror, bellowsMode: prefs.bellowsMode });
  },
  /** Para la barra o el botón de fuelle en pantalla. */
  bellowsDown() { this.setDir(prefs.bellowsMode === 'toggle' ? (dir === 'push' ? 'pull' : 'push') : 'pull'); },
  bellowsUp() { if (prefs.bellowsMode === 'hold') this.setDir('push'); },
};

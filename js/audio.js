// Sonido: lengüetas de acordeón modeladas (ver reed.js) y percusión (guacharaca y caja)
// para el metrónomo. Sin muestras grabadas.
import { reedVoice } from './reed.js';

let ctx = null, master = null, noiseBuf = null;

export function audioCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = 0.35;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Bus independiente (para detener una reproducción sin cortar lo demás). */
export function createBus(gain = 1) {
  const c = audioCtx();
  const g = c.createGain();
  g.gain.value = gain;
  g.connect(master);
  return g;
}

const kindOf = (bass, chord) => (bass ? (chord ? 'acorde' : 'bajo') : 'melodia');

/** Nota con duración fija (secuencias, reproductor). */
export function playMidi(midi, dur = 0.5, { when = 0, at = null, gain = 0.5, bass = false, chord = false, dest } = {}) {
  const c = audioCtx();
  const t0 = at ?? c.currentTime + when;
  const v = reedVoice(c, dest || master, midi, { t0, gain, kind: kindOf(bass, chord) });
  v.release(t0 + dur);
}

export function playChord(midis, dur = 1.0, opts = {}) {
  midis.forEach((m) => playMidi(m, dur, { gain: 0.22, chord: true, ...opts }));
}

// ----- Notas sostenidas (teclado de PC / pantalla) -----
const held = new Map();
export function noteOn(key, midi, { bass = false, chord = false, gain = 0.45 } = {}) {
  noteOff(key);
  const c = audioCtx();
  held.set(key, reedVoice(c, master, midi, { t0: c.currentTime, gain, kind: kindOf(bass, chord) }));
}
export function noteOff(key) {
  const v = held.get(key);
  if (!v) return;
  v.release(audioCtx().currentTime);
  held.delete(key);
}
export function allNotesOff() { [...held.keys()].forEach(noteOff); }

// ----- Percusión para el metrónomo -----
/** Guacharaca: raspado de ruido agudo. strong = acento. */
export function guacharaca(at, { strong = false, dest } = {}) {
  const c = audioCtx();
  const src = c.createBufferSource(); src.buffer = noiseBuf;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = 1.4;
  const g = c.createGain();
  const len = strong ? 0.11 : 0.06, peak = strong ? 0.5 : 0.28;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, at + len);
  src.connect(bp).connect(g).connect(dest || master);
  src.start(at, Math.random() * 0.5); src.stop(at + len + 0.02);
}
/** Caja: golpe grave con cuerpo de membrana. */
export function caja(at, { dest } = {}) {
  const c = audioCtx();
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(190, at); o.frequency.exponentialRampToValueAtTime(90, at + 0.12);
  const g = c.createGain();
  g.gain.setValueAtTime(0.9, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
  o.connect(g).connect(dest || master);
  o.start(at); o.stop(at + 0.2);
  const n = c.createBufferSource(); n.buffer = noiseBuf;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900;
  const gn = c.createGain(); gn.gain.setValueAtTime(0.25, at); gn.gain.exponentialRampToValueAtTime(0.001, at + 0.06);
  n.connect(bp).connect(gn).connect(dest || master); n.start(at); n.stop(at + 0.08);
}

/** Reproduce una secuencia simple; onStep(i) al sonar cada nota. Devuelve función para detener. */
export function playSequence(midis, { bpm = 90, onStep, onEnd } = {}) {
  const step = 60 / bpm;
  const timers = [];
  const bus = createBus();
  const c = audioCtx(), t0 = c.currentTime + 0.05;
  midis.forEach((m, i) => {
    if (m != null) playMidi(m, step * 0.95, { at: t0 + i * step, dest: bus });
    timers.push(setTimeout(() => onStep && onStep(i), i * step * 1000));
  });
  timers.push(setTimeout(() => onEnd && onEnd(), midis.length * step * 1000));
  return () => { timers.forEach(clearTimeout); bus.disconnect(); };
}

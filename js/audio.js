// Síntesis sin muestras: lengüetas con trémolo (dos voces desafinadas), bajos y percusión
// (guacharaca y caja) para el metrónomo.
import { midiToFreq } from './theory.js';

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

const TREMOLO_CENTS = 12;

function voice(c, midi, { bass = false, dest = master, gain = 0.5 }) {
  const f = midiToFreq(midi);
  const out = c.createGain();
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = bass ? 900 : Math.min(5000, f * 6);
  lp.Q.value = 0.7;
  lp.connect(out).connect(dest);
  const detunes = bass ? [0] : [0, TREMOLO_CENTS];
  const oscs = detunes.map((d) => {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = d;
    const g = c.createGain();
    g.gain.value = 1 / detunes.length;
    o.connect(g).connect(lp);
    return o;
  });
  return { out, oscs, gain };
}

export function playMidi(midi, dur = 0.5, { when = 0, at = null, gain = 0.5, bass = false, dest } = {}) {
  const c = audioCtx();
  const t0 = at ?? c.currentTime + when;
  const v = voice(c, midi, { bass, dest: dest || master, gain });
  v.out.gain.setValueAtTime(0, t0);
  v.out.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  v.out.gain.setValueAtTime(gain, t0 + Math.max(0.03, dur - 0.05));
  v.out.gain.linearRampToValueAtTime(0, t0 + dur);
  v.oscs.forEach((o) => { o.start(t0); o.stop(t0 + dur + 0.05); });
}

export function playChord(midis, dur = 1.0, opts = {}) {
  midis.forEach((m) => playMidi(m, dur, { gain: 0.25, ...opts }));
}

// ----- Notas sostenidas (teclado de PC / pantalla) -----
const held = new Map();
export function noteOn(key, midi, { bass = false, gain = 0.45 } = {}) {
  noteOff(key);
  const c = audioCtx();
  const v = voice(c, midi, { bass, gain });
  const t = c.currentTime;
  v.out.gain.setValueAtTime(0, t);
  v.out.gain.linearRampToValueAtTime(gain, t + 0.015);
  v.oscs.forEach((o) => o.start(t));
  held.set(key, v);
}
export function noteOff(key) {
  const v = held.get(key);
  if (!v) return;
  const c = audioCtx(), t = c.currentTime;
  v.out.gain.cancelScheduledValues(t);
  v.out.gain.setValueAtTime(v.out.gain.value, t);
  v.out.gain.linearRampToValueAtTime(0, t + 0.04);
  v.oscs.forEach((o) => o.stop(t + 0.06));
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

// Sintetizador sencillo de lengüetas con trémolo (dos voces desafinadas), sin muestras.
import { midiToFreq } from './theory.js';

let ctx = null, master = null;

export function audioCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const TREMOLO_CENTS = 12;

export function playMidi(midi, dur = 0.5, { when = 0, gain = 0.5, bass = false } = {}) {
  const c = audioCtx();
  const t0 = c.currentTime + when;
  const f = midiToFreq(midi);
  const out = c.createGain();
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = bass ? 900 : Math.min(5000, f * 6);
  lp.Q.value = 0.7;
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  out.gain.setValueAtTime(gain, t0 + Math.max(0.03, dur - 0.05));
  out.gain.linearRampToValueAtTime(0, t0 + dur);
  lp.connect(out).connect(master);
  const detunes = bass ? [0] : [0, TREMOLO_CENTS];
  for (const d of detunes) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = d;
    const g = c.createGain();
    g.gain.value = 1 / detunes.length;
    o.connect(g).connect(lp);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
}

/** Reproduce una secuencia; onStep(i) se llama al sonar cada nota. Devuelve función para detener. */
export function playSequence(midis, { bpm = 90, onStep, onEnd } = {}) {
  const step = 60 / bpm;
  const timers = [];
  midis.forEach((m, i) => {
    if (m != null) playMidi(m, step * 0.95, { when: i * step });
    timers.push(setTimeout(() => onStep && onStep(i), i * step * 1000));
  });
  timers.push(setTimeout(() => onEnd && onEnd(), midis.length * step * 1000));
  return () => timers.forEach(clearTimeout);
}

export function playChord(midis, dur = 1.0) {
  midis.forEach((m) => playMidi(m, dur, { gain: 0.3 }));
}

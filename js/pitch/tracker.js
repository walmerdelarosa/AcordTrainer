// Seguimiento de notas: convierte detecciones por cuadro en notas estables (segmentos).
// Sin DOM. Funciona en tiempo real (push por cuadro) y fuera de línea (analyzeBuffer).

import { YinDetector, freqToMidiFloat } from './yin.js';
import { SalienceDetector } from './salience.js';

/** Fábrica de detectores: 'yin' (rápido, ideal para práctica con micrófono, una sola voz)
 *  o 'salience' (espectral, mejor con acompañamiento: videos de conjunto). */
export function createDetector(algorithm, opts) {
  return algorithm === 'salience' ? new SalienceDetector(opts) : new YinDetector(opts);
}

export const TRACK_DEFAULTS = {
  medianSize: 5,       // cuadros para el filtro de mediana
  minNoteSec: 0.07,    // duración mínima de una nota
  stableCents: 45,     // tolerancia para considerar la misma nota
  gapSec: 0.05,        // silencio corto que no corta la nota
};

function median(arr) {
  const a = arr.filter((x) => x > 0).sort((x, y) => x - y);
  if (a.length < Math.ceil(arr.length / 2)) return 0;
  return a[Math.floor(a.length / 2)];
}

/** Seguidor en tiempo real. */
export class NoteTracker {
  constructor(opts = {}) {
    this.o = { ...TRACK_DEFAULTS, ...opts };
    this.hist = [];
    this.current = null; // { midi, start, last, cents[] }
  }

  /** midiFloat: 0 si no hay altura. Devuelve { stable, ended } */
  push(midiFloat, t) {
    const o = this.o;
    this.hist.push(midiFloat);
    if (this.hist.length > o.medianSize) this.hist.shift();
    const m = median(this.hist);
    let ended = null;

    if (m > 0) {
      const r = Math.round(m);
      if (this.current && this.current.midi === r) {
        this.current.last = t;
        this.current.cents.push((m - r) * 100);
      } else {
        if (this.current) ended = this._close();
        this.current = { midi: r, start: t, last: t, cents: [(m - r) * 100] };
      }
    } else if (this.current && t - this.current.last > o.gapSec) {
      ended = this._close();
    }
    const stable = this.current && this.current.last - this.current.start >= o.minNoteSec ? this.current : null;
    return { midiFloat: m, stable, ended };
  }

  _close() {
    const c = this.current;
    this.current = null;
    if (c.last - c.start < this.o.minNoteSec) return null;
    const cents = c.cents.slice().sort((a, b) => a - b)[Math.floor(c.cents.length / 2)];
    return { midi: c.midi, start: c.start, end: c.last, cents };
  }

  flush() { return this.current ? this._close() : null; }
}

/**
 * Análisis fuera de línea de un buffer mono.
 * onProgress(0..1) opcional. Devuelve { notes, frames }.
 */
export async function analyzeBuffer(samples, sampleRate, {
  frameSize = 2048, hop = 512, algorithm = 'yin', detector = {}, tracker = {}, onProgress,
} = {}) {
  const det = createDetector(algorithm, { sampleRate, ...detector });
  const tr = new NoteTracker(tracker);
  const notes = [];
  const frames = [];
  const frame = new Float32Array(frameSize);
  const total = Math.max(0, samples.length - frameSize);
  for (let pos = 0, k = 0; pos <= total; pos += hop, k++) {
    frame.set(samples.subarray(pos, pos + frameSize));
    const r = det.detect(frame);
    const mf = r.freq > 0 ? freqToMidiFloat(r.freq) : 0;
    const t = (pos + frameSize / 2) / sampleRate;
    frames.push({ t, midi: mf, clarity: r.clarity, rms: r.rms });
    const { ended } = tr.push(mf, t);
    if (ended) notes.push(ended);
    if (onProgress && k % 200 === 0) {
      onProgress(pos / total);
      await new Promise((res) => setTimeout(res, 0)); // ceder al navegador
    }
  }
  const last = tr.flush();
  if (last) notes.push(last);
  onProgress && onProgress(1);
  return { notes, frames };
}

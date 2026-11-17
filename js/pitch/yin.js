// Motor de detección de altura (pitch) — módulo independiente, sin DOM.
// Algoritmo YIN (de Cheveigné & Kawahara, 2002) con ajustes para acordeón:
//  - Umbral absoluto configurable y búsqueda del primer mínimo bajo el umbral
//    (evita errores de octava hacia abajo por las lengüetas en trémolo).
//  - Interpolación parabólica para precisión sub-muestra.
//  - Compuerta por energía (RMS) para ignorar silencio y ruido de fondo.
//
// Interfaz estable (pensada para poder separarlo como paquete propio):
//   const det = new YinDetector({ sampleRate });
//   const r = det.detect(float32Frame); // { freq, clarity, rms } | { freq: 0, ... }

export const DEFAULTS = {
  threshold: 0.12,   // umbral sobre la función de diferencia normalizada (0.1–0.2)
  minFreq: 120,      // Hz. Mano derecha: ~Mi3 hacia arriba (con margen)
  maxFreq: 2200,     // Hz. ~Do7
  minRms: 0.01,      // compuerta de energía
  minClarity: 0.75,  // 1 - d'(tau) mínimo para aceptar el resultado
};

export class YinDetector {
  constructor(opts = {}) {
    this.o = { ...DEFAULTS, ...opts };
    if (!this.o.sampleRate) throw new Error('sampleRate requerido');
    this._buf = null;
  }

  setOptions(opts) { Object.assign(this.o, opts); }

  detect(frame) {
    const { sampleRate, threshold, minFreq, maxFreq, minRms, minClarity } = this.o;
    const n = frame.length;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / n);
    if (rms < minRms) return { freq: 0, clarity: 0, rms };

    const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
    const tauMax = Math.min(Math.floor(sampleRate / minFreq), Math.floor(n / 2));
    const w = n - tauMax;
    if (!this._buf || this._buf.length < tauMax + 2) this._buf = new Float32Array(tauMax + 2);
    const d = this._buf;

    // Función de diferencia
    d[0] = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      let s = 0;
      for (let i = 0; i < w; i++) {
        const diff = frame[i] - frame[i + tau];
        s += diff * diff;
      }
      d[tau] = s;
    }
    // Diferencia media acumulada normalizada
    let running = 0;
    d[0] = 1;
    for (let tau = 1; tau <= tauMax; tau++) {
      running += d[tau];
      d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
    }

    // Primer mínimo por debajo del umbral
    let tau = -1;
    for (let t = tauMin; t < tauMax; t++) {
      if (d[t] < threshold) {
        while (t + 1 < tauMax && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) {
      // Sin cruce: tomar el mínimo global como candidato de baja confianza
      let best = tauMin;
      for (let t = tauMin; t < tauMax; t++) if (d[t] < d[best]) best = t;
      tau = best;
    }
    const clarity = 1 - d[tau];
    if (clarity < minClarity) return { freq: 0, clarity, rms };

    // Interpolación parabólica
    let betterTau = tau;
    if (tau > 0 && tau < tauMax - 1) {
      const s0 = d[tau - 1], s1 = d[tau], s2 = d[tau + 1];
      const den = 2 * (2 * s1 - s2 - s0);
      if (den !== 0) betterTau = tau + (s2 - s0) / den;
    }
    return { freq: sampleRate / betterTau, clarity, rms };
  }
}

export const freqToMidiFloat = (f) => 69 + 12 * Math.log2(f / 440);

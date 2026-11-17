// Detector por saliencia armónica (espectral), pensado para música de conjunto:
// el acordeón (melodía) suena junto con bajos/acordes de la mano izquierda, caja y guacharaca.
// Idea: buscar la frecuencia fundamental cuyos armónicos explican más energía espectral,
// y entre candidatos fuertes no relacionados armónicamente, preferir la voz más aguda (melodía).
//
// Interfaz igual a YinDetector: new SalienceDetector({ sampleRate }).detect(frame)

export const SAL_DEFAULTS = {
  minFreq: 150,
  maxFreq: 2200,
  minRms: 0.01,
  harmonics: 8,
  harmonicDecay: 0.82,
  sigmaCents: 25,
  stepCents: 10,
  melodyBias: 0.7,     // un candidato más agudo gana si tiene ≥ 70% de la saliencia máxima
  minClarity: 0.25,    // saliencia relativa mínima (0..1) para aceptar
  peakDb: -50,         // picos espectrales por encima de este nivel relativo al máximo
  lowCutHz: 220,       // atenúa el registro de los bajos antes de buscar picos
  oddRatio: 0.5,       // corrección de octava: armónicos impares / pares de la octava baja
};

function fft(re, im) { // radix-2 in situ
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

export class SalienceDetector {
  constructor(opts = {}) {
    this.o = { ...SAL_DEFAULTS, ...opts };
    if (!this.o.sampleRate) throw new Error('sampleRate requerido');
    this._n = 0;
  }
  setOptions(opts) { Object.assign(this.o, opts); }

  _prepare(n) {
    let size = 1; while (size < n) size <<= 1;
    size = Math.max(size, 4096); // relleno con ceros para mejor resolución
    this._n = n; this._size = size;
    this.re = new Float64Array(size); this.im = new Float64Array(size);
    this.win = new Float64Array(n);
    for (let i = 0; i < n; i++) this.win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    const o = this.o;
    this.cands = [];
    const lo = 69 + 12 * Math.log2(o.minFreq / 440), hi = 69 + 12 * Math.log2(o.maxFreq / 440);
    for (let m = lo; m <= hi; m += o.stepCents / 100) this.cands.push(m);
  }

  detect(frame) {
    const o = this.o, n = frame.length, sr = o.sampleRate;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / n);
    if (rms < o.minRms) return { freq: 0, clarity: 0, rms };
    if (this._n !== n) this._prepare(n);
    const { re, im, win, _size: size } = this;
    re.fill(0); im.fill(0);
    for (let i = 0; i < n; i++) re[i] = frame[i] * win[i];
    fft(re, im);
    const half = size / 2, binHz = sr / size;
    const mag = new Float64Array(half);
    let maxMag = 0;
    for (let k = 1; k < half; k++) {
      const f = k * binHz;
      let m = Math.hypot(re[k], im[k]);
      if (f < o.lowCutHz) m *= Math.pow(f / o.lowCutHz, 2); // pasa-altos suave
      mag[k] = m; if (m > maxMag) maxMag = m;
    }
    // Picos
    const floor = maxMag * Math.pow(10, o.peakDb / 20);
    const peaks = [];
    for (let k = 2; k < half - 1; k++) {
      const a = mag[k - 1], b = mag[k], c = mag[k + 1];
      if (b > floor && b > a && b >= c) {
        const la = Math.log(a + 1e-12), lb = Math.log(b), lc = Math.log(c + 1e-12);
        const den = la - 2 * lb + lc;
        const delta = den !== 0 ? 0.5 * (la - lc) / den : 0;
        const f = (k + delta) * binHz;
        if (f > 60) peaks.push({ midi: 69 + 12 * Math.log2(f / 440), amp: Math.sqrt(b / maxMag) });
      }
    }
    if (!peaks.length) return { freq: 0, clarity: 0, rms };

    // Saliencia por candidato
    const H = o.harmonics, inv2s2 = 1 / (2 * (o.sigmaCents / 100) ** 2);
    const hOff = []; for (let h = 1; h <= H; h++) hOff.push(12 * Math.log2(h));
    const sal = new Float64Array(this.cands.length);
    let best = 0, bestI = -1;
    for (let ci = 0; ci < this.cands.length; ci++) {
      const m0 = this.cands[ci];
      let s = 0, fund = 0, w = 1;
      for (let h = 0; h < H; h++, w *= o.harmonicDecay) {
        const target = m0 + hOff[h];
        let acc = 0;
        for (const p of peaks) {
          const d = p.midi - target;
          if (d > 0.75 || d < -0.75) continue;
          acc = Math.max(acc, p.amp * Math.exp(-d * d * inv2s2));
        }
        if (h === 0) fund = acc;
        s += w * acc;
      }
      s *= 0.35 + 0.65 * fund; // exige fundamental presente (evita subarmónicos)
      sal[ci] = s;
      if (s > best) { best = s; bestI = ci; }
    }
    if (bestI < 0) return { freq: 0, clarity: 0, rms };

    // Máximos locales y sesgo hacia la melodía (voz aguda no relacionada armónicamente)
    let pick = bestI;
    const isHarmonic = (a, b) => {
      const r = Math.abs(a - b) / 12 * Math.log2(2) ; // en octavas
      const ratio = Math.pow(2, Math.abs(a - b) / 12);
      const nearInt = Math.abs(ratio - Math.round(ratio)) < 0.03;
      return nearInt || r < 0.02;
    };
    for (let ci = bestI + 1; ci < sal.length - 1; ci++) {
      if (sal[ci] >= o.melodyBias * best && sal[ci] >= sal[ci - 1] && sal[ci] >= sal[ci + 1]
          && !isHarmonic(this.cands[ci], this.cands[bestI])) pick = ci;
    }
    // Corrección de octava: el trémolo (dos lengüetas desafinadas a propósito) produce batidos
    // que a ratos anulan la fundamental. Si la octava de abajo tiene armónicos impares (3º, 5º),
    // que la candidata de arriba no puede explicar, la nota real es la de abajo.
    const hAcc = (m0, h) => {
      const target = m0 + 12 * Math.log2(h);
      let acc = 0;
      for (const p of peaks) {
        const d = p.midi - target;
        if (d > 0.75 || d < -0.75) continue;
        acc = Math.max(acc, p.amp * Math.exp(-d * d * inv2s2));
      }
      return acc;
    };
    for (let guard = 0; guard < 2; guard++) {
      const low = this.cands[pick] - 12;
      if (low < this.cands[0]) break;
      const odd = hAcc(low, 3) + hAcc(low, 5);
      const even = hAcc(low, 2) + hAcc(low, 4);
      if (even > 0 && odd >= o.oddRatio * even) {
        pick = Math.max(0, Math.round((low - this.cands[0]) / (o.stepCents / 100)));
      } else break;
    }
    // Refinar con el pico espectral más cercano a la fundamental elegida
    let m = this.cands[pick], bestD = 0.5;
    for (const p of peaks) { const d = Math.abs(p.midi - this.cands[pick]); if (d < bestD) { bestD = d; m = p.midi; } }
    const total = sal.reduce((a, b) => a + b, 0) / sal.length;
    const clarity = Math.min(1, Math.max(sal[pick], sal[bestI] * 0.8) / (best + 1e-12) - total / (best + 1e-12));
    if (clarity < o.minClarity) return { freq: 0, clarity, rms };
    return { freq: 440 * Math.pow(2, (m - 69) / 12), clarity, rms };
  }
}

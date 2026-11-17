// Detección de la mano izquierda (bajos y acordes) en grabaciones.
//
// En el acordeón vallenato la mano izquierda suele alternar bajo (nota grave) y acorde
// (tríada en registro medio) a tiempo con la caja. Como los bajos también son bisonoros,
// lo que suena en los bajos revela la dirección del fuelle, y eso ayuda a elegir
// botón y fuelle de la melodía.
//
// Método:
//  1. Ataques con una envolvente corta (≈23 ms) de la banda grave-media: precisión temporal.
//  2. Para cada ataque, un espectro con ventana larga (≈186 ms) justo después del golpe:
//     resolución en graves. Croma por picos interpolados, sin los armónicos de la melodía.
//  3. Clasificación: bajo (energía bajo 200 Hz) o acorde (tríada mayor/menor en 190–620 Hz).

export const BASS_DEFAULTS = {
  frameSize: 4096,
  bassBand: [50, 200],
  chordBand: [190, 620],
  envHop: 256,
  envWin: 512,
  envCutHz: 400,         // la envolvente de ataques solo mira la mano izquierda
  onsetDb: 2.5,          // subida mínima de energía (dB) en ~35 ms para contar como ataque
  minGapSec: 0.09,
  maxEventSec: 0.6,
  bassRatio: 0.9,
  minConfidence: 0.35,
  rootPrior: 0.15,
};

function fft(re, im) {
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
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

const TEMPLATES = [];
for (let r = 0; r < 12; r++) {
  TEMPLATES.push({ root: r, quality: 'mayor', pcs: [r, (r + 4) % 12, (r + 7) % 12] });
  TEMPLATES.push({ root: r, quality: 'menor', pcs: [r, (r + 3) % 12, (r + 7) % 12] });
}

/** Paso-bajo biquad (RBJ), 2º orden. Se aplica dos veces (4º orden) para aislar la mano izquierda. */
function biquadLowpass(x, sr, fc, q = 0.707) {
  const w = (2 * Math.PI * fc) / sr, al = Math.sin(w) / (2 * q), cw = Math.cos(w);
  const b0 = (1 - cw) / 2, b1 = 1 - cw, b2 = (1 - cw) / 2, a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

export function detectOnsets(samples, sr, o = BASS_DEFAULTS) {
  const lp = biquadLowpass(biquadLowpass(samples, sr, o.envCutHz), sr, o.envCutHz);
  const env = [];
  for (let pos = 0; pos + o.envWin <= lp.length; pos += o.envHop) {
    let e = 0;
    for (let i = 0; i < o.envWin; i++) e += lp[pos + i] * lp[pos + i];
    env.push(10 * Math.log10(e / o.envWin + 1e-10));
  }
  const look = Math.max(1, Math.round((0.035 * sr) / o.envHop));
  const rise = env.map((v, i) => {
    let m = i < look ? -100 : v; // antes del inicio: silencio
    for (let j = Math.max(0, i - look); j < i; j++) m = Math.min(m, env[j]);
    return v - m;
  });
  const onsets = [];
  for (let i = 0; i < env.length - 1; i++) {
    if (rise[i] < o.onsetDb || (i > 0 && rise[i] < rise[i - 1]) || rise[i] < rise[i + 1]) continue;
    let j = i; while (j > 0 && env[j - 1] < env[j] - 0.5) j--; // comienzo de la subida
    const t = (j * o.envHop + o.envWin / 2) / sr;
    if (onsets.length && t - onsets.at(-1) < o.minGapSec) continue;
    onsets.push(t);
  }
  return onsets;
}

/**
 * Analiza la mano izquierda.
 * melodyFrames (opcional): [{ t, midi }] del análisis de melodía para excluir sus armónicos.
 * Devuelve [{ start, end, kind: 'bajo'|'acorde', pc, quality, conf }]
 */
export async function analyzeBass(samples, sampleRate, { melodyFrames = [], onProgress, ...opts } = {}) {
  const o = { ...BASS_DEFAULTS, ...opts };
  const onsets = detectOnsets(samples, sampleRate, o);
  const N = o.frameSize, size = N * 2, binHz = sampleRate / size;
  const re = new Float64Array(size), im = new Float64Array(size);
  const kLo = Math.max(2, Math.floor(o.bassBand[0] / binHz));
  const bassEdge = Math.floor(o.bassBand[1] / binHz);
  const kMid = Math.floor(o.chordBand[0] / binHz), kHi = Math.ceil(o.chordBand[1] / binHz);

  const melodyAt = (t) => {
    if (!melodyFrames.length) return 0;
    let lo = 0, hi = melodyFrames.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (melodyFrames[m].t < t) lo = m + 1; else hi = m; }
    return melodyFrames[lo].midi || 0;
  };

  const events = [];
  let maxE = 0;
  for (let n = 0; n < onsets.length; n++) {
    const t0 = onsets[n];
    const tEnd = Math.min(n + 1 < onsets.length ? onsets[n + 1] : samples.length / sampleRate, t0 + o.maxEventSec);
    // Ventana que empieza justo después del ataque (sin mezclar el evento anterior)
    const start = Math.max(0, Math.floor((t0 + 0.01) * sampleRate));
    const avail = Math.min(N, Math.floor((tEnd - t0 - 0.01) * sampleRate), samples.length - start);
    if (avail < N / 4) continue;
    re.fill(0); im.fill(0);
    for (let i = 0; i < avail; i++) re[i] = samples[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (avail - 1)));
    fft(re, im);
    const mag = new Float64Array(kHi + 2);
    for (let k = kLo - 1; k <= kHi + 1; k++) mag[k] = Math.hypot(re[k], im[k]);
    const mel = melodyAt(t0 + 0.08);
    const cB = new Float64Array(12), cC = new Float64Array(12);
    let eB = 0, eC = 0;
    for (let k = kLo; k <= kHi; k++) {
      const a = mag[k - 1], b = mag[k], c = mag[k + 1];
      if (!(b > a && b >= c)) continue;
      const la = Math.log(a + 1e-12), lb = Math.log(b + 1e-12), lc = Math.log(c + 1e-12);
      const den = la - 2 * lb + lc;
      const delta = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (la - lc)) / den)) : 0;
      const midi = 69 + 12 * Math.log2(((k + delta) * binHz) / 440);
      if (mel > 0) {
        let skip = false;
        for (let h = 1; h <= 4 && !skip; h++) { const d = midi - (mel + 12 * Math.log2(h)); if (d > -0.6 && d < 0.6) skip = true; }
        if (skip) continue;
      }
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      const p = b * b;
      if (k <= bassEdge) { cB[pc] += p; eB += p; }
      if (k >= kMid) { cC[pc] += p; eC += p; }
    }
    maxE = Math.max(maxE, eB + eC);
    let ev;
    if (eB >= o.bassRatio * eC) {
      const sum = cB.reduce((x, y) => x + y, 0) + 1e-12;
      let pc = 0; for (let p = 1; p < 12; p++) if (cB[p] > cB[pc]) pc = p;
      ev = { kind: 'bajo', pc, quality: null, conf: cB[pc] / sum };
    } else {
      const sum = cC.reduce((x, y) => x + y, 0) + 1e-12;
      // Prior musical: en el patrón bajo–acorde, el acorde suele tener la raíz del bajo anterior
      const prevBass = [...events].reverse().find((e) => e.kind === 'bajo' && t0 - e.start < 0.7);
      let best = null;
      for (const tpl of TEMPLATES) {
        const s = tpl.pcs.reduce((x, p) => x + cC[p], 0) / sum
          + (prevBass && prevBass.pc === tpl.root ? o.rootPrior : 0)
          + (tpl.quality === 'mayor' ? 0.02 : 0);
        if (!best || s > best.s) best = { ...tpl, s };
      }
      ev = { kind: 'acorde', pc: best.root, quality: best.quality, conf: Math.min(1, best.s) };
    }
    events.push({ start: t0, end: tEnd, energy: eB + eC, ...ev });
    if (onProgress && n % 50 === 0) { onProgress(n / onsets.length); await new Promise((r) => setTimeout(r, 0)); }
  }
  onProgress && onProgress(1);
  return events
    .filter((e) => e.conf >= o.minConfidence && e.energy > maxE * 1e-3)
    .map(({ energy, ...e }) => e);
}

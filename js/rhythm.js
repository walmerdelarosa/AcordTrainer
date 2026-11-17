// Tempo y cuantización. Sin DOM.
//
// El pulso se estima con los ataques de la melodía y, sobre todo, de los bajos
// (en vallenato la mano izquierda marca el tiempo con la caja).

export const METERS = {
  '2/4': { beats: 2, beatType: 4, ticksPerBeat: 4, divisions: 4, label: '2/4 (paseo, son)' },
  '4/4': { beats: 4, beatType: 4, ticksPerBeat: 4, divisions: 4, label: '4/4' },
  '6/8': { beats: 2, beatType: 8, ticksPerBeat: 3, divisions: 2, label: '6/8 (merengue, puya)' },
};
// ticksPerBeat: subdivisiones del pulso (semicorcheas en x/4, corcheas en 6/8).
// divisions: ticks por negra (unidad de MusicXML).

export const ticksPerMeasure = (meter) => {
  const m = METERS[meter];
  return meter === '6/8' ? 6 : m.beats * m.ticksPerBeat;
};

/**
 * Estima el tempo (pulsos por minuto) y la fase a partir de ataques ponderados.
 * onsets: [{ t, w }]. Devuelve { bpm, offset } (offset = segundo del primer pulso).
 */
export function estimateTempo(onsets, { min = 60, max = 190, prior: priorBpm = 115 } = {}) {
  if (onsets.length < 4) return { bpm: priorBpm, offset: onsets[0]?.t ?? 0 };
  const fs = 100; // Hz
  const T = Math.max(...onsets.map((o) => o.t)) + 1;
  const n = Math.ceil(T * fs);
  const env = new Float64Array(n);
  for (const o of onsets) { // impulsos suavizados (σ ≈ 20 ms)
    const c = Math.round(o.t * fs);
    for (let d = -4; d <= 4; d++) if (c + d >= 0 && c + d < n) env[c + d] += o.w * Math.exp(-(d * d) / 8);
  }
  const lagMin = Math.floor((60 / max) * fs), lagMax = Math.ceil((60 / min) * fs);
  const sc = [];
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let ac = 0;
    for (let i = 0; i + lag < n; i++) ac += env[i] * env[i + lag];
    sc.push({ lag, ac });
  }
  const prior = (bpm) => Math.exp(-0.5 * (Math.log2(bpm / priorBpm) / 0.85) ** 2);
  // Ajuste a la rejilla: qué tanto caen los ataques (sobre todo los bajos) en los pulsos
  const fit = (period) => {
    let best = { s: -Infinity, ph: 0 };
    const tw = onsets.reduce((a, o) => a + o.w, 0);
    for (let k = 0; k < 48; k++) {
      const ph = (k / 48) * period;
      let s = 0;
      for (const o of onsets) {
        const r = (((o.t - ph) / period) % 1 + 1) % 1;
        const d = Math.min(r, 1 - r) * period;
        s += o.w * Math.exp(-(d * d) / (2 * 0.035 * 0.035));
      }
      if (s > best.s) best = { s, ph };
    }
    return { s: best.s / tw, ph: best.ph };
  };
  // Candidatos: máximos locales de la autocorrelación
  const peaks = sc.filter((x, i) => i > 0 && i < sc.length - 1 && x.ac >= sc[i - 1].ac && x.ac >= sc[i + 1].ac)
    .sort((a, b) => b.ac - a.ac).slice(0, 6);
  if (!peaks.length) peaks.push(sc[0]);
  const maxAc = peaks[0].ac || 1;
  let best = null;
  for (const p of peaks) {
    const period = p.lag / fs, f = fit(period);
    const score = f.s * prior(60 / period) * (0.5 + 0.5 * p.ac / maxAc);
    if (!best || score > best.score) best = { score, lag: p.lag, ph: f.ph };
  }
  const period = best.lag / fs;
  const bestPh = { ph: best.ph };
  // Ajuste fino del tempo por mínimos cuadrados sobre ataques cercanos a la rejilla
  const pts = [];
  for (const o of onsets) {
    const k = Math.round((o.t - bestPh.ph) / period);
    if (Math.abs(o.t - bestPh.ph - k * period) < period * 0.15) pts.push([k, o.t]);
  }
  let bpmOut = 60 / period, offset = bestPh.ph;
  if (pts.length >= 4) {
    const mk = pts.reduce((a, p) => a + p[0], 0) / pts.length, mt = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    let num = 0, den = 0;
    for (const [k, t] of pts) { num += (k - mk) * (t - mt); den += (k - mk) ** 2; }
    if (den > 0) {
      const p = num / den;
      if (Math.abs(p - period) / period < 0.05) { bpmOut = 60 / p; offset = mt - p * mk; }
    }
  }
  // Primer pulso: el más cercano antes del primer ataque
  const per = 60 / bpmOut;
  const first = Math.min(...onsets.map((o) => o.t));
  offset = offset - Math.ceil((offset - first) / per) * per;
  if (offset > first) offset -= per;
  return { bpm: Math.round(bpmOut * 10) / 10, offset };
}

/** Convierte segundos a ticks enteros en la rejilla del compás. */
export function toTick(t, { bpm, offset, meter }) {
  const tpb = METERS[meter].ticksPerBeat;
  return Math.round(((t - offset) * bpm * tpb) / 60);
}
export function tickToSec(tick, { bpm, offset, meter }) {
  return offset + (tick * 60) / (bpm * METERS[meter].ticksPerBeat);
}

/**
 * Cuantiza eventos { t0, t1 } a { tick, dur } sin solapes en la misma voz.
 */
export function quantize(events, grid) {
  const out = events.map((e) => {
    const tick = Math.max(0, toTick(e.t0, grid));
    const end = Math.max(tick + 1, toTick(e.t1, grid));
    return { ...e, tick, dur: end - tick };
  });
  out.sort((a, b) => a.tick - b.tick);
  // Una nota por tick: si dos caen en el mismo tick, se mueve la segunda o se descarta
  const res = [];
  for (const e of out) {
    const prev = res[res.length - 1];
    if (prev && e.tick <= prev.tick) {
      if (prev.dur > 1) { e.tick = prev.tick + 1; e.dur = Math.max(1, e.dur - 1); } else continue;
    }
    if (prev && prev.tick + prev.dur > e.tick) prev.dur = Math.max(1, e.tick - prev.tick);
    res.push(e);
  }
  return res;
}

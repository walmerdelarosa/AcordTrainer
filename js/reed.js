// Modelo de lengüeta libre (acordeón) con Web Audio, sin muestras grabadas.
//
// Calibrado con una grabación real de acordeón vallenato (ver tools/calibrar-sonido.py):
//  - Timbre: perfil de armónicos medido por registro (grave, medio, agudo), interpolado por nota.
//  - Trémolo casi seco: dos lengüetas a ~4 cents (la medición dio mediana de 3 cents).
//    Un trémolo ancho (12–20 cents) es lo que hace sonar "a acordeón alemán o de musette".
//  - Ataque de ~50 ms con la afinación entrando un poco baja (la lengüeta arranca con el aire).
//  - Soplo: ruido de aire filtrado, fuerte al atacar y leve mientras suena.
//  - Pequeña variación de presión del fuelle.
// Funciona con AudioContext y con OfflineAudioContext (para pruebas y exportar audio).

import { midiToFreq } from './theory.js';

const cache = new WeakMap();

// Perfil armónico medido en una grabación de acordeón vallenato (Cinco Letras), en dB respecto
// a la fundamental, mediana por registro. Solo se guardan estos números, no el audio.
const PROFILE = {
  grave: { f: 200, db: [0.0, -11.8, -11.7, -14.1, -10.8, -15.6, -14.4, -20.2, -21.5, -21.4, -26.7, -23.6, -22.5, -23.2, -25.6, -23.4, -22.9, -30.9, -28.9, -31.0, -32.0, -31.0, -33.7, -32.2] },
  medio: { f: 450, db: [0.0, -12.6, -10.5, -10.8, -15.6, -20.0, -22.1, -26.2, -21.9, -23.7, -22.0, -26.6, -32.6, -37.0, -38.8, -39.8, -39.8, -50.4, -53.4, -53.3, -57.1, -58.3, -57.1, -63.4] },
  agudo: { f: 1000, db: [0.0, -15.5, -14.3, -22.7, -23.2, -33.7, -29.9, -38.9, -43.4, -49.5, -54.3, -52.6, -71.1, -73.0, -80, -68.8, -80, -80, -80, -80, -80, -80, -80, -80] },
};

/** Perfil interpolado (en dB, sobre log-frecuencia) para la fundamental f. */
function profileFor(f) {
  const pts = [PROFILE.grave, PROFILE.medio, PROFILE.agudo];
  if (f <= pts[0].f) return pts[0].db;
  if (f >= pts[2].f) return pts[2].db;
  const i = f < pts[1].f ? 0 : 1;
  const a = pts[i], b = pts[i + 1];
  const w = Math.log(f / a.f) / Math.log(b.f / a.f);
  return a.db.map((v, k) => v * (1 - w) + b.db[k] * w);
}

function resources(c) {
  let r = cache.get(c);
  if (r) return r;
  const noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  r = { noise, waves: new Map() };
  cache.set(c, r);
  return r;
}

/** Forma de onda para una nota (cacheada por semitono). */
function waveFor(c, R, midi) {
  const key = Math.round(midi);
  let w = R.waves.get(key);
  if (w) return w;
  const f = midiToFreq(key);
  const db = profileFor(f);
  const N = db.length, real = new Float32Array(N + 1), imag = new Float32Array(N + 1);
  for (let n = 1; n <= N; n++) {
    if (f * n > c.sampleRate / 2 - 200) break;
    const a = Math.pow(10, db[n - 1] / 20);
    // fases alternadas: forma de pulso suave, como la de una lengüeta
    imag[n] = a * (n % 4 < 2 ? 1 : -1);
  }
  w = c.createPeriodicWave(real, imag);
  R.waves.set(key, w);
  return w;
}

export const REED_DEFAULTS = {
  tremoloCents: 4,    // medido: la mayoría de notas bate a 0–4 cents (afinación casi seca)
  lowReed: 0,         // no se observa lengüeta una octava abajo
  air: 1,             // soplo (muy bajo: el ruido entre armónicos medido es ≈ −52 dB)
};
export const reedSettings = { ...REED_DEFAULTS };

/**
 * Crea una voz. kind: 'melodia' | 'bajo' | 'acorde'.
 * Devuelve { release(t) } — la nota suena desde t0 hasta que se llame release.
 */
export function reedVoice(c, dest, midi, { t0 = c.currentTime, gain = 0.5, kind = 'melodia' } = {}) {
  const R = resources(c), S = reedSettings;
  const f = midiToFreq(midi);
  const nodes = [];
  const mk = (n) => { nodes.push(n); return n; };

  const env = mk(c.createGain());
  env.gain.setValueAtTime(0, t0);
  env.gain.setTargetAtTime(gain, t0, kind === 'melodia' ? 0.017 : 0.012);
  env.connect(dest);

  // Cuerpo: el perfil medido ya incluye la respuesta de la caja; solo se limpian extremos
  const hp = mk(c.createBiquadFilter()); hp.type = 'highpass'; hp.frequency.value = kind === 'bajo' ? 40 : 90;
  const lp = mk(c.createBiquadFilter()); lp.type = 'lowpass'; lp.Q.value = 0.5;
  lp.frequency.value = kind === 'bajo' ? 2500 : kind === 'acorde' ? 4000 : Math.min(12000, Math.max(3500, f * 16));
  const pre = mk(c.createGain()); pre.gain.value = 0.7;
  pre.connect(hp).connect(lp).connect(env);

  // Presión del fuelle: variación lenta y leve
  const lfo = mk(c.createOscillator()); lfo.frequency.value = 0.6 + Math.random() * 0.5;
  const lfoG = mk(c.createGain()); lfoG.gain.value = 0.04;
  const press = mk(c.createGain()); press.gain.value = 1;
  lfo.connect(lfoG).connect(press.gain);
  press.connect(pre);

  // Lengüetas
  const reeds = kind === 'melodia'
    ? [{ cents: 0, g: 0.55, pan: -0.15 }, { cents: S.tremoloCents, g: 0.45, pan: 0.15 }, ...(S.lowReed > 0 ? [{ cents: -1200, g: S.lowReed, pan: 0 }] : [])]
    : kind === 'bajo'
      ? [{ cents: 0, g: 0.7, pan: 0 }, { cents: 1200 + 2, g: 0.3, pan: 0 }]
      : [{ cents: 0, g: 0.6, pan: 0 }, { cents: 3, g: 0.4, pan: 0 }];
  const oscs = [];
  for (const r of reeds) {
    const o = mk(c.createOscillator());
    o.setPeriodicWave(waveFor(c, R, midi + r.cents / 100));
    o.frequency.value = f;
    // La lengüeta entra un poco baja y se asienta
    o.detune.setValueAtTime(r.cents - 8, t0);
    o.detune.setTargetAtTime(r.cents, t0, 0.025);
    const g = mk(c.createGain()); g.gain.value = r.g;
    if (c.createStereoPanner && r.pan) { const p = mk(c.createStereoPanner()); p.pan.value = r.pan; o.connect(g).connect(p).connect(press); }
    else o.connect(g).connect(press);
    oscs.push(o);
  }

  // Soplo: ruido de aire filtrado cerca del registro de la nota
  let air = null;
  if (S.air > 0) {
    air = mk(c.createBufferSource()); air.buffer = R.noise; air.loop = true;
    const bp = mk(c.createBiquadFilter()); bp.type = 'bandpass';
    bp.frequency.value = Math.min(6000, Math.max(900, f * 3)); bp.Q.value = 0.7;
    const ag = mk(c.createGain());
    const amt = 0.018 * S.air * (kind === 'bajo' ? 0.4 : 1);
    ag.gain.setValueAtTime(0, t0);
    ag.gain.linearRampToValueAtTime(amt, t0 + 0.012);
    ag.gain.setTargetAtTime(amt * 0.12, t0 + 0.015, 0.05);
    air.connect(bp).connect(ag).connect(env);
    air.start(t0, Math.random() * 1.5);
  }

  lfo.start(t0);
  oscs.forEach((o) => o.start(t0));
  let released = false;
  return {
    release(t = c.currentTime) {
      if (released) return;
      released = true;
      const tr = Math.max(t, t0 + 0.02);
      env.gain.cancelScheduledValues(tr);
      env.gain.setValueAtTime(env.gain.value || gain, tr);
      env.gain.setTargetAtTime(0, tr, kind === 'melodia' ? 0.035 : 0.05);
      const end = tr + 0.35;
      oscs.forEach((o) => o.stop(end));
      lfo.stop(end);
      air && air.stop(end);
      if (typeof OfflineAudioContext === 'undefined' || !(c instanceof OfflineAudioContext)) {
        setTimeout(() => nodes.forEach((n) => { try { n.disconnect(); } catch { /* */ } }), Math.max(0, (end - c.currentTime) * 1000 + 100));
      }
    },
  };
}

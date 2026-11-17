// Modelo de lengüeta libre (acordeón) con Web Audio, sin muestras grabadas.
//
// Lo que hace que suene a acordeón y no a sintetizador:
//  - Forma de onda de pulso estrecho (la lengüeta abre y cierra el paso del aire): timbre nasal,
//    con armónicos pares e impares y "huecos" periódicos en el espectro.
//  - Trémolo: dos lengüetas medias afinadas a unos cents de diferencia → batido lento.
//  - Lengüeta grave (octava abajo) muy suave, para dar cuerpo.
//  - Ataque de ~50 ms con la afinación entrando un poco baja (la lengüeta arranca con el aire).
//  - Soplo: ruido de aire filtrado, fuerte al atacar y leve mientras suena.
//  - Resonancias de la caja (picos hacia 1,2 y 2,8 kHz) y una saturación suave.
//  - Pequeña variación de presión del fuelle.
// Funciona con AudioContext y con OfflineAudioContext (para pruebas y exportar audio).

import { midiToFreq } from './theory.js';

const cache = new WeakMap();

function resources(c) {
  let r = cache.get(c);
  if (r) return r;
  const N = 48, real = new Float32Array(N + 1), imag = new Float32Array(N + 1);
  const duty = 0.27;
  for (let n = 1; n <= N; n++) {
    const pulse = Math.abs(Math.sin(Math.PI * n * duty)) / (Math.PI * n * duty);
    imag[n] = (0.35 + 0.65 * pulse) * Math.pow(n, -0.55) * (n % 2 ? 1 : 0.85);
  }
  const reedWave = c.createPeriodicWave(real, imag, { disableNormalization: false });
  // Bajos: más fundamental y zumbido de pares
  const realB = new Float32Array(N + 1), imagB = new Float32Array(N + 1);
  for (let n = 1; n <= N; n++) imagB[n] = Math.pow(n, -0.75) * (n === 2 ? 1.2 : 1) * (0.5 + 0.5 * Math.abs(Math.sin(Math.PI * n * 0.38)));
  const bassWave = c.createPeriodicWave(realB, imagB);
  const noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) { const x = (i / 511.5) - 1; curve[i] = Math.tanh(1.6 * x) / Math.tanh(1.6); }
  r = { reedWave, bassWave, noise, curve };
  cache.set(c, r);
  return r;
}

export const REED_DEFAULTS = {
  tremoloCents: 14,   // separación entre las dos lengüetas medias (vallenato: trémolo marcado)
  lowReed: 0.2,       // nivel de la lengüeta grave (0 = sin octava)
  air: 1,             // cantidad de soplo
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

  // Cuerpo: resonancias de la caja + paso-bajo según la altura
  const hp = mk(c.createBiquadFilter()); hp.type = 'highpass'; hp.frequency.value = kind === 'bajo' ? 45 : 110;
  const pk1 = mk(c.createBiquadFilter()); pk1.type = 'peaking'; pk1.frequency.value = kind === 'bajo' ? 320 : 1200; pk1.Q.value = 1.1; pk1.gain.value = 4;
  const pk2 = mk(c.createBiquadFilter()); pk2.type = 'peaking'; pk2.frequency.value = 2800; pk2.Q.value = 1.4; pk2.gain.value = kind === 'bajo' ? 0 : 3;
  const lp = mk(c.createBiquadFilter()); lp.type = 'lowpass'; lp.Q.value = 0.5;
  lp.frequency.value = kind === 'bajo' ? 1400 : kind === 'acorde' ? 2600 : Math.min(9000, Math.max(2500, f * 13));
  const sat = mk(c.createWaveShaper()); sat.curve = R.curve; sat.oversample = '2x';
  const pre = mk(c.createGain()); pre.gain.value = 0.55;
  pre.connect(sat).connect(hp).connect(pk1).connect(pk2).connect(lp).connect(env);

  // Presión del fuelle: variación lenta y leve
  const lfo = mk(c.createOscillator()); lfo.frequency.value = 0.6 + Math.random() * 0.5;
  const lfoG = mk(c.createGain()); lfoG.gain.value = 0.04;
  const press = mk(c.createGain()); press.gain.value = 1;
  lfo.connect(lfoG).connect(press.gain);
  press.connect(pre);

  // Lengüetas
  const reeds = kind === 'melodia'
    ? [{ cents: 0, g: 0.5, pan: -0.25 }, { cents: S.tremoloCents, g: 0.5, pan: 0.25 }, ...(S.lowReed > 0 ? [{ cents: -1200 - 2, g: S.lowReed, pan: 0 }] : [])]
    : kind === 'bajo'
      ? [{ cents: 0, g: 0.6, pan: 0, wave: 'bass' }, { cents: 1200 + 3, g: 0.35, pan: 0, wave: 'bass' }]
      : [{ cents: 0, g: 0.6, pan: 0 }, { cents: 8, g: 0.3, pan: 0 }];
  const oscs = [];
  for (const r of reeds) {
    const o = mk(c.createOscillator());
    o.setPeriodicWave(r.wave === 'bass' ? R.bassWave : R.reedWave);
    o.frequency.value = f;
    // La lengüeta entra un poco baja y se asienta
    o.detune.setValueAtTime(r.cents - 12, t0);
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
    const amt = 0.05 * S.air * (kind === 'bajo' ? 0.4 : 1);
    ag.gain.setValueAtTime(0, t0);
    ag.gain.linearRampToValueAtTime(amt, t0 + 0.012);
    ag.gain.setTargetAtTime(amt * 0.18, t0 + 0.015, 0.05);
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

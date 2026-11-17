// Práctica con micrófono: la app escucha y avanza cuando tocas la nota correcta.
import * as T from './theory.js';
import { ROWS } from './instrument.js';
import { createKeyboard } from './keyboard.js';
import { createDetector, NoteTracker } from './pitch/tracker.js';
import { freqToMidiFloat } from './pitch/yin.js';
import { marksFor } from './exercises.js';
import { playMidi } from './audio.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function mountPractice(main, state, F) {
  const t = state.tuning;
  let ex = state.exercise || F.scaleExercise(t, F.rowTonic(t, 'afuera'), 'mayor', { onlyRow: 'afuera' });

  const root = document.createElement('section');
  root.className = 'card practice';
  root.innerHTML = `
    <h1>Practicar con micrófono</h1>
    <p class="muted">Ejercicio: <b class="ex-title"></b>. Si llegaste directo, puedes elegir otro en <a href="#/explorar">Explorar</a> o desde una lección.</p>
    <div class="practice-grid">
      <div>
        <div class="target"><span class="muted">Toca</span><div class="big-note">—</div><div class="where muted"></div></div>
        <div class="heard"><span class="muted">Escucho</span><div class="mid-note">—</div>
          <div class="tuner"><div class="needle"></div><span>−50</span><span>0</span><span>+50</span></div></div>
        <div class="row-ctrls">
          <button class="btn start">🎤 Empezar</button>
          <button class="btn ghost restart">↺ Reiniciar</button>
          <button class="btn ghost hint">▶ Oír la nota</button>
        </div>
        <details class="settings"><summary>Ajustes del detector</summary>
          <label>Detector <select name="algo"><option value="salience">Espectral (recomendado; tolera acompañamiento)</option><option value="yin">YIN (una sola voz, muy preciso en afinación)</option></select></label>
          <label>Sensibilidad <input type="range" name="rms" min="0.002" max="0.05" step="0.001" value="0.01"></label>
          <label class="check"><input type="checkbox" name="octave" checked> Aceptar la nota en cualquier octava</label>
          <p class="muted">Desactiva la cancelación de eco del navegador si notas cortes. Se usan los ajustes de audio "crudos" cuando el navegador lo permite.</p>
        </details>
        <p class="score muted"></p>
      </div>
      <div class="kb-wrap"></div>
    </div>`;
  main.append(root);
  const q = (s) => root.querySelector(s);
  q('.ex-title').textContent = ex.title;
  const kb = createKeyboard(q('.kb-wrap'), { tuning: t, mode: 'both', showBass: false, onPress: (b, d) => playMidi(b[d], 0.4) });

  let i = 0, hits = 0, misses = 0, startTime = 0;
  const targets = ex.midis.map((m, k) => ({ midi: m, name: ex.names[k], pos: ex.positions[k] })).filter((x) => x.pos);

  function showTarget() {
    if (i >= targets.length) {
      q('.big-note').textContent = '¡Listo!';
      const secs = ((performance.now() - startTime) / 1000).toFixed(1);
      q('.where').textContent = `Terminaste en ${secs} s.`;
      kb.mark(marksFor(ex));
      return;
    }
    const tg = targets[i];
    q('.big-note').textContent = tg.name;
    const row = ROWS.find((r) => r.id === tg.pos.btn.row).label;
    q('.where').innerHTML = `${esc(row)}, botón ${tg.pos.btn.index} · <b class="${tg.pos.dir}-t">${tg.pos.dir === 'push' ? 'cerrando' : 'abriendo'}</b>`;
    kb.mark(marksFor(ex, ex.positions.indexOf(tg.pos)));
    q('.score').textContent = `Nota ${i + 1} de ${targets.length}`;
  }
  showTarget();

  // ----- Audio -----
  let stream = null, ctx = null, raf = 0;
  async function start() {
    if (stream) { stop(); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      q('.where').textContent = 'No se pudo usar el micrófono: ' + e.message;
      return;
    }
    ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 120;
    const an = ctx.createAnalyser(); an.fftSize = 4096;
    src.connect(hp).connect(an);
    const buf = new Float32Array(an.fftSize);
    const det = createDetector(q('[name=algo]').value, { sampleRate: ctx.sampleRate, minRms: +q('[name=rms]').value });
    const tr = new NoteTracker({ minNoteSec: 0.08 });
    let lastAccepted = -1;
    startTime = performance.now();
    q('.start').textContent = '■ Detener';
    const loop = () => {
      an.getFloatTimeDomainData(buf);
      const r = det.detect(buf);
      const mf = r.freq > 0 ? freqToMidiFloat(r.freq) : 0;
      const { midiFloat, stable } = tr.push(mf, ctx.currentTime);
      if (midiFloat > 0) {
        const near = Math.round(midiFloat);
        const cents = (midiFloat - near) * 100;
        q('.mid-note').textContent = T.midiName(near, t.pref);
        q('.needle').style.left = `${50 + Math.max(-50, Math.min(50, cents))}%`;
        q('.needle').classList.toggle('ok', Math.abs(cents) < 15);
      }
      if (stable && i < targets.length && stable.start !== lastAccepted) {
        const tg = targets[i];
        const anyOct = q('[name=octave]').checked;
        const ok = anyOct ? T.midiToPc(stable.midi) === T.midiToPc(tg.midi) : stable.midi === tg.midi;
        if (ok) {
          lastAccepted = stable.start; hits++; i++;
          kb.flash(tg.pos.btn.id, tg.pos.dir);
          showTarget();
        } else if (stable.last - stable.start > 0.35 && stable.start !== lastAccepted) {
          lastAccepted = stable.start; misses++;
          root.classList.add('miss'); setTimeout(() => root.classList.remove('miss'), 300);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
  }
  function stop() {
    cancelAnimationFrame(raf);
    stream && stream.getTracks().forEach((x) => x.stop());
    ctx && ctx.close();
    stream = null; ctx = null;
    q('.start').textContent = '🎤 Empezar';
  }
  q('.start').onclick = start;
  q('.restart').onclick = () => { i = 0; hits = 0; misses = 0; startTime = performance.now(); showTarget(); };
  q('.hint').onclick = () => targets[i] && playMidi(targets[i].midi, 0.7);
  state.cleanup.push(stop);
}

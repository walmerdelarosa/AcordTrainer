// Práctica: ejercicios o canciones, con el teclado (PC o pantalla) o con el micrófono
// (acordeón real). Modo paso a paso (espera la nota) o con ritmo (guacharaca y bajos,
// mide si llegas a tiempo).
import * as T from './theory.js';
import { ROWS } from './instrument.js';
import { createSurface } from './surface.js';
import { createDetector, NoteTracker } from './pitch/tracker.js';
import { freqToMidiFloat } from './pitch/yin.js';
import { marksFor } from './exercises.js';
import { playMidi } from './audio.js';
import { renderScore } from './notation.js';
import { SongPlayer } from './player.js';
import { METERS, ticksPerMeasure } from './rhythm.js';
import { listSongs, getSong } from './library.js';
import { icon } from './icons.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PRAISE = ['¡Eso es!', '¡Bien tocao!', '¡Ajá!', '¡Qué nota!', '¡Así mismo!'];
const AGAIN = ['Otra vez', 'Casi, vuelve', 'Esa no es, tranquilo', 'Revisa el fuelle'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function mountPractice(main, state, F) {
  const t = state.tuning;
  const song = state.song && state.song.tuningId === t.id ? state.song : null;
  const ex = !song ? (state.exercise || F.scaleExercise(t, F.rowTonic(t, 'afuera'), 'mayor', { onlyRow: 'afuera' })) : null;
  const saved = listSongs().filter((s) => s.tuningId === t.id);

  const root = document.createElement('section');
  root.className = 'practice';
  root.innerHTML = `
    <header class="page-head"><h1>A practicar</h1>
      <div class="row-ctrls">
        <label>Qué tocar <select name="source">
          <option value="ex" ${ex ? 'selected' : ''}>Ejercicio: ${esc(ex ? ex.title : 'escala de la hilera de afuera')}</option>
          <option value="demo-${t.id}" ${song?.id === 'demo-' + t.id ? 'selected' : ''}>Canción: Paseo de práctica (ejemplo)</option>
          ${song && !song.id.startsWith('demo') && !saved.some((s) => s.id === song.id) ? `<option value="current" selected>Canción: ${esc(song.title)} (sin guardar)</option>` : ''}
          ${saved.map((s) => `<option value="${s.id}" ${song?.id === s.id ? 'selected' : ''}>Canción: ${esc(s.title)}</option>`).join('')}
        </select></label>
        <span class="muted small">Más ejercicios en <a href="#/explorar">Explorar</a>; tus canciones en <a href="#/canciones">Canciones</a>.</span>
      </div>
    </header>
    <div class="card practice-card">
      <div class="row-ctrls">
        <div class="seg" role="group" aria-label="Entrada">
          <button class="btn ghost sm" data-in="keys">${icon('keys')} Teclado o pantalla</button>
          <button class="btn ghost sm" data-in="mic">${icon('mic')} Acordeón real (micrófono)</button>
        </div>
        ${song ? `<div class="seg" role="group" aria-label="Modo">
          <button class="btn ghost sm" data-mode="step">Paso a paso</button>
          <button class="btn ghost sm" data-mode="rhythm">Con ritmo</button></div>
          <label class="rhythm-only">Velocidad <select name="speed"><option value="0.5">50 %</option><option value="0.75" selected>75 %</option><option value="0.9">90 %</option><option value="1">100 %</option></select></label>
          <label>Compases <input type="number" name="from" min="1" value="1"> a <input type="number" name="to" min="1" value="${song.measures}"></label>` : ''}
        <button class="btn accent start">${icon('play')} Empezar</button>
      </div>
      <div class="target-row">
        <div class="target"><span class="muted">Toca</span><div class="big-note">—</div><div class="where muted"></div></div>
        <div class="feedback" aria-live="polite"></div>
        <div class="heard mic-only"><span class="muted">Escucho</span><div class="mid-note">—</div>
          <div class="tuner"><div class="needle"></div><span>−50</span><span>0</span><span>+50</span></div></div>
        <div class="score-line"><span class="muted">Aciertos</span><div class="tally">0 / 0</div></div>
      </div>
      <details class="settings mic-only"><summary>Ajustes del micrófono</summary>
        <label>Detector <select name="algo"><option value="salience">Espectral (tolera los bajos)</option><option value="yin">YIN (solo melodía)</option></select></label>
        <label>Sensibilidad <input type="range" name="rms" min="0.002" max="0.05" step="0.001" value="0.01"></label>
        <label class="check"><input type="checkbox" name="octave" checked> Aceptar la nota en cualquier octava</label>
      </details>
      ${song ? '<div class="score-scroll practice-score"><div class="score-box"></div></div>' : '<ol class="chips ex-chips"></ol>'}
    </div>
    <div class="surface-host"></div>
    <div class="results" hidden></div>`;
  main.append(root);
  const q = (s) => root.querySelector(s);

  q('[name=source]').onchange = (e) => {
    const v = e.target.value;
    if (v === 'ex') { state.song = null; } else if (v !== 'current') { state.song = getSong(v, t.id); state.exercise = null; }
    location.hash = '#/practicar'; window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  // ----- Objetivos -----
  let targets;
  if (song) targets = song.notes.map((n, i) => ({ midi: n.midi, pos: n.pos, name: T.nameEs(T.spellPc(T.midiToPc(n.midi), t.pref)), tick: n.tick, i }));
  else targets = ex.midis.map((m, i) => ({ midi: m, pos: ex.positions[i], name: ex.names[i], i })).filter((x) => x.pos);

  let input = state.practiceInput || 'keys', mode = 'step', running = false;
  let cur = 0, hits = 0, misses = 0, results = [];
  let score = null;
  if (song) score = renderScore(q('.score-box'), song, {});
  const chips = q('.ex-chips');
  if (chips) chips.innerHTML = targets.map((x, k) => `<li class="chip ${x.pos.dir}" data-k="${k}"><b>${k + 1}</b> ${esc(x.name)}</li>`).join('');

  const surface = createSurface(q('.surface-host'), {
    tuning: t,
    onNote: (e) => { if (input === 'keys' && !e.bass) judge({ midi: e.midi, btnId: e.btn.id, dir: e.dir }); },
  });

  function rangeTargets() {
    if (!song) return targets;
    const tpm = ticksPerMeasure(song.meter);
    const f = Math.max(1, +q('[name=from]').value || 1), to = Math.max(f, +q('[name=to]').value || song.measures);
    return targets.filter((x) => x.tick >= (f - 1) * tpm && x.tick < to * tpm);
  }
  let active = rangeTargets();

  function show() {
    const tg = active[cur];
    if (!tg) { q('.big-note').textContent = '¡Listo!'; q('.where').textContent = ''; surface.kb.mark([]); return; }
    q('.big-note').textContent = tg.name;
    const row = ROWS.find((r) => r.id === tg.pos?.btn.row)?.label ?? '';
    q('.where').innerHTML = tg.pos ? `${esc(row)}, botón ${tg.pos.btn.index} · <b class="${tg.pos.dir}-t">${tg.pos.dir === 'push' ? 'cerrando' : 'abriendo'}</b>` : '';
    const next = active[cur + 1];
    const marks = [];
    if (next?.pos && mode === 'step') marks.push({ btnId: next.pos.btn.id, dir: next.pos.dir, label: '›' });
    if (tg.pos) marks.push({ btnId: tg.pos.btn.id, dir: tg.pos.dir, label: '●', active: true });
    surface.kb.mark(marks);
    if (score && mode === 'step') { score.select(tg.i); score.setCursor(tg.tick); }
    if (chips) chips.querySelectorAll('li').forEach((li) => li.classList.toggle('on', +li.dataset.k === cur));
    q('.tally').textContent = `${hits} / ${hits + misses}`;
  }

  function feedback(text, cls) {
    const f = q('.feedback');
    f.textContent = text; f.className = 'feedback ' + cls;
    clearTimeout(f._t); f._t = setTimeout(() => { f.textContent = ''; f.className = 'feedback'; }, 1100);
  }

  function matches(tg, e) {
    if (e.btnId) return (e.btnId === tg.pos?.btn.id && e.dir === tg.pos?.dir) || e.midi === tg.midi;
    return q('[name=octave]').checked ? T.midiToPc(e.midi) === T.midiToPc(tg.midi) : e.midi === tg.midi;
  }

  // ----- Modo paso a paso -----
  function judge(e, when = null) {
    if (!running) return;
    if (mode === 'rhythm') return judgeRhythm(e, when);
    const tg = active[cur];
    if (!tg) return;
    if (matches(tg, e)) {
      hits++;
      score?.mark(tg.i, 'ok');
      if (e.btnId && e.btnId !== tg.pos?.btn.id) feedback('Bien, aunque usaste otra posición', 'ok');
      else feedback(pick(PRAISE), 'ok');
      cur++;
      if (cur >= active.length) finish(); else show();
    } else {
      misses++;
      feedback(pick(AGAIN), 'bad');
      root.querySelector('.practice-card').classList.add('miss');
      setTimeout(() => root.querySelector('.practice-card')?.classList.remove('miss'), 300);
      show();
    }
  }

  // ----- Modo con ritmo -----
  let player = null, matched = new Set(), rhythmTimer = 0;
  function judgeRhythm(e, whenTick) {
    if (!player?.playing) return;
    const tick = whenTick ?? player.tick;
    const tickSec = 60 / (song.bpm * METERS[song.meter].ticksPerBeat) / player.opts.speed;
    const win = 0.28 / tickSec;
    let best = null;
    for (const tg of active) {
      if (matched.has(tg.i)) continue;
      const d = tick - tg.tick;
      if (Math.abs(d) <= win && matches(tg, e) && (!best || Math.abs(d) < Math.abs(best.d))) best = { tg, d };
    }
    if (!best) { misses++; feedback('Esa sobró', 'bad'); q('.tally').textContent = `${hits} / ${hits + misses}`; return; }
    matched.add(best.tg.i);
    const ms = Math.round(best.d * tickSec * 1000);
    results.push(ms);
    hits++;
    const cls = Math.abs(ms) <= 70 ? 'ok' : ms < 0 ? 'early' : 'late';
    score.mark(best.tg.i, cls);
    feedback(cls === 'ok' ? '¡A tiempo!' : cls === 'early' ? `Adelantado ${-ms} ms` : `Atrasado ${ms} ms`, cls === 'ok' ? 'ok' : 'warn');
    q('.tally').textContent = `${hits} / ${active.length}`;
  }
  function rhythmWatch() {
    if (!player?.playing) return;
    const tickSec = 60 / (song.bpm * METERS[song.meter].ticksPerBeat) / player.opts.speed;
    const now = player.tick, win = 0.28 / tickSec;
    for (const tg of active) {
      if (!matched.has(tg.i) && now - tg.tick > win && !tg._missed) { tg._missed = true; misses++; score.mark(tg.i, 'miss'); }
    }
    // Mostrar la siguiente nota por tocar
    const nxt = active.find((tg) => !matched.has(tg.i) && !tg._missed && tg.tick >= now - win);
    if (nxt && nxt !== active[cur]) { cur = active.indexOf(nxt); show(); }
  }

  // ----- Micrófono -----
  let stream = null, actx = null, raf = 0;
  async function startMic() {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    actx = new AudioContext();
    const src = actx.createMediaStreamSource(stream);
    const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 120;
    const an = actx.createAnalyser(); an.fftSize = 4096;
    src.connect(hp).connect(an);
    const buf = new Float32Array(an.fftSize);
    const det = createDetector(q('[name=algo]').value, { sampleRate: actx.sampleRate, minRms: +q('[name=rms]').value });
    const tr = new NoteTracker({ minNoteSec: 0.08 });
    let lastAccepted = -1;
    const latencySec = an.fftSize / actx.sampleRate / 2 + 0.08;
    const loop = () => {
      an.getFloatTimeDomainData(buf);
      const r = det.detect(buf);
      const mf = r.freq > 0 ? freqToMidiFloat(r.freq) : 0;
      const { midiFloat, stable } = tr.push(mf, actx.currentTime);
      if (midiFloat > 0) {
        const near = Math.round(midiFloat), cents = (midiFloat - near) * 100;
        q('.mid-note').textContent = T.midiName(near, t.pref);
        q('.needle').style.left = `${50 + Math.max(-50, Math.min(50, cents))}%`;
        q('.needle').classList.toggle('ok', Math.abs(cents) < 15);
      }
      if (stable && stable.start !== lastAccepted) {
        lastAccepted = stable.start;
        let when = null;
        if (mode === 'rhythm' && player?.playing) when = player.tick - latencySec / (60 / (song.bpm * METERS[song.meter].ticksPerBeat) / player.opts.speed);
        judge({ midi: stable.midi }, when);
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
  }
  function stopMic() {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((x) => x.stop());
    actx?.close();
    stream = null; actx = null;
  }

  // ----- Control -----
  async function start() {
    if (running) { stop(); return; }
    active = rangeTargets();
    active.forEach((tg) => { delete tg._missed; });
    cur = 0; hits = 0; misses = 0; results = []; matched = new Set();
    score?.clearMarks('ok'); score?.clearMarks('miss'); score?.clearMarks('early'); score?.clearMarks('late');
    q('.results').hidden = true;
    if (input === 'mic') {
      try { await startMic(); } catch (e) { feedback('No se pudo usar el micrófono: ' + e.message, 'bad'); return; }
    }
    running = true;
    q('.start').innerHTML = `${icon('stop')} Parar`;
    if (mode === 'rhythm' && song) {
      const tpm = ticksPerMeasure(song.meter);
      const f = Math.max(1, +q('[name=from]').value || 1), to = Math.max(f, +q('[name=to]').value || song.measures);
      player = new SongPlayer(song, { onTick: (tk) => score.setCursor(tk), onEnd: () => setTimeout(finish, 400) });
      player.play({ from: (f - 1) * tpm, to: to * tpm, speed: +q('[name=speed]').value, melody: false, bass: true, metronome: true, countIn: true });
      rhythmTimer = setInterval(rhythmWatch, 50);
      feedback('Un compás de cuenta y arrancas', 'ok');
    }
    show();
  }
  function stop() {
    running = false;
    player?.stop(); clearInterval(rhythmTimer);
    stopMic();
    q('.start').innerHTML = `${icon('play')} Empezar`;
  }
  function finish() {
    if (!running) return;
    stop();
    const total = active.length;
    const pct = Math.round((100 * hits) / Math.max(1, mode === 'rhythm' ? total : hits + misses));
    let extra = '';
    if (mode === 'rhythm' && results.length) {
      const avg = Math.round(results.reduce((a, b) => a + b, 0) / results.length);
      const onTime = results.filter((x) => Math.abs(x) <= 70).length;
      extra = `<p>${onTime} de ${results.length} notas a tiempo. En promedio vas ${Math.abs(avg)} ms ${avg < 0 ? 'adelantado' : 'atrasado'}.</p>`;
    }
    const r = q('.results');
    r.hidden = false;
    r.innerHTML = `<div class="card result-card"><h2>${pct >= 90 ? '¡Te quedó sabrosa!' : pct >= 70 ? 'Vas bien, sigue así' : 'Vamos por partes'}</h2>
      <p class="big-pct">${pct} %</p><p>${hits} aciertos${mode === 'rhythm' ? ` de ${total} notas` : `, ${misses} errores`}.</p>${extra}
      <p class="muted">${pct < 70 ? 'Baja la velocidad o practica menos compases a la vez.' : 'Prueba subir la velocidad o el modo con ritmo.'}</p></div>`;
    r.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function setInput(v) {
    input = v; state.practiceInput = v;
    root.querySelectorAll('[data-in]').forEach((b) => b.classList.toggle('on', b.dataset.in === v));
    root.classList.toggle('using-mic', v === 'mic');
    if (running) stop();
  }
  function setMode(v) {
    mode = v;
    root.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === v));
    root.classList.toggle('rhythm', v === 'rhythm');
    if (running) stop();
    show();
  }
  root.querySelectorAll('[data-in]').forEach((b) => b.onclick = () => setInput(b.dataset.in));
  root.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => setMode(b.dataset.mode));
  q('.start').onclick = start;
  ['from', 'to'].forEach((n) => { const x = q(`[name=${n}]`); if (x) x.onchange = () => { active = rangeTargets(); cur = 0; show(); }; });
  setInput(input); setMode('step');
  show();
  state.cleanup.push(() => { stop(); surface.destroy(); });
}

export { playMidi };

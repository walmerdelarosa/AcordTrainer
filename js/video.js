// Aprender de un video: extrae la melodía del audio, la convierte en botones y fuelle,
// y la muestra sincronizada con el video (velocidad y bucle A–B).
import * as T from './theory.js';
import { buttons, fingerSequence, ROWS } from './instrument.js';
import { createKeyboard } from './keyboard.js';
import { analyzeBuffer } from './pitch/tracker.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ANALYSIS_SR = 22050;

/** Lleva cada nota detectada a una altura que exista en el teclado (misma clase, octava más cercana). */
export function foldToInstrument(tuning, notes) {
  const avail = [...new Set(buttons(tuning).flatMap((b) => [b.push, b.pull]))];
  return notes.map((n) => {
    const pc = T.midiToPc(n.midi);
    let best = null;
    for (const m of avail) if (T.midiToPc(m) === pc && (best == null || Math.abs(m - n.midi) < Math.abs(best - n.midi))) best = m;
    return { ...n, played: best ?? n.midi, folded: best !== n.midi };
  });
}

/** Une notas repetidas separadas por huecos mínimos (artefactos del trémolo). */
export function cleanNotes(notes, { minDur = 0.08, mergeGap = 0.03 } = {}) {
  const out = [];
  for (const n of notes) {
    const prev = out[out.length - 1];
    if (prev && prev.midi === n.midi && n.start - prev.end < mergeGap) { prev.end = n.end; continue; }
    if (n.end - n.start >= minDur) out.push({ ...n });
  }
  return out;
}

export function mountVideo(main, state) {
  const t = state.tuning;
  const root = document.createElement('section');
  root.className = 'card video-view';
  root.innerHTML = `
    <h1>Aprender de un video</h1>
    <p>Carga un video o audio de un acordeonero (de tu teléfono o computador). La app escucha la melodía, propone botón y fuelle para cada nota en tu afinación (<b>${esc(t.name)}</b>) y la sincroniza con el video.</p>
    <p class="muted">Todo se procesa en tu dispositivo. Los enlaces de YouTube no se pueden analizar directamente: usa archivos propios o descargados.</p>
    <div class="row-ctrls">
      <label class="btn">📁 Elegir archivo<input type="file" accept="video/*,audio/*" hidden></label>
      <label>Detector <select name="algo"><option value="salience">Espectral (con acompañamiento)</option><option value="yin">YIN (acordeón solo)</option></select></label>
      <button class="btn analyze" disabled>Analizar</button>
      <span class="status muted"></span>
    </div>
    <div class="bar" hidden><div></div></div>
    <div class="video-grid" hidden>
      <div>
        <video controls playsinline></video>
        <div class="row-ctrls">
          <label>Velocidad <select name="rate"><option>0.5</option><option>0.75</option><option selected>1</option></select></label>
          <button class="btn ghost setA">A</button><button class="btn ghost setB">B</button>
          <label class="check"><input type="checkbox" name="loop"> Bucle A–B</label>
          <span class="ab muted"></span>
        </div>
        <canvas class="roll" height="160"></canvas>
        <div class="now-note"><span class="big-note">—</span><span class="where muted"></span></div>
        <ol class="chips tab"></ol>
        <div class="row-ctrls"><button class="btn ghost csv" disabled>⬇ Descargar notas (CSV)</button></div>
      </div>
      <div class="kb-wrap"></div>
    </div>`;
  main.append(root);
  const q = (s) => root.querySelector(s);
  const video = q('video');
  const kb = createKeyboard(q('.kb-wrap'), { tuning: t, mode: 'both', showBass: false });
  let file = null, notes = [], A = null, B = null, raf = 0, lastIdx = -2;

  q('input[type=file]').onchange = (e) => {
    file = e.target.files[0];
    if (!file) return;
    video.src = URL.createObjectURL(file);
    q('.video-grid').hidden = false;
    q('.analyze').disabled = false;
    q('.status').textContent = file.name;
  };
  q('[name=rate]').onchange = (e) => { video.playbackRate = +e.target.value; };
  q('.setA').onclick = () => { A = video.currentTime; showAB(); };
  q('.setB').onclick = () => { B = video.currentTime; showAB(); };
  const showAB = () => { q('.ab').textContent = `A ${A?.toFixed(1) ?? '–'} s · B ${B?.toFixed(1) ?? '–'} s`; };

  q('.analyze').onclick = async () => {
    q('.analyze').disabled = true;
    q('.bar').hidden = false;
    try {
      q('.status').textContent = 'Decodificando audio…';
      const data = await file.arrayBuffer();
      const tmp = new AudioContext();
      const decoded = await tmp.decodeAudioData(data);
      tmp.close();
      // Mezcla a mono, remuestrea y filtra el registro de la melodía
      const len = Math.ceil(decoded.duration * ANALYSIS_SR);
      const off = new OfflineAudioContext(1, len, ANALYSIS_SR);
      const src = off.createBufferSource(); src.buffer = decoded;
      const hp = off.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140;
      const lp = off.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000;
      src.connect(hp).connect(lp).connect(off.destination); src.start();
      const rendered = await off.startRendering();
      const samples = rendered.getChannelData(0);
      // Normaliza para que la compuerta de energía no dependa del volumen de la grabación
      let peak = 0; for (let k = 0; k < samples.length; k++) peak = Math.max(peak, Math.abs(samples[k]));
      if (peak > 0) for (let k = 0; k < samples.length; k++) samples[k] /= peak;
      q('.status').textContent = 'Buscando notas…';
      const { notes: raw } = await analyzeBuffer(samples, ANALYSIS_SR, {
        frameSize: 2048, hop: 256, algorithm: q('[name=algo]').value,
        detector: { minRms: 0.02 },
        onProgress: (p) => { q('.bar div').style.width = `${(p * 100).toFixed(0)}%`; },
      });
      const cleaned = foldToInstrument(t, cleanNotes(raw));
      const fing = fingerSequence(t, cleaned.map((n) => n.played));
      notes = cleaned.map((n, k) => ({ ...n, pos: fing.positions[k] }));
      q('.status').textContent = `${notes.length} notas encontradas. Revisa a oído: es una propuesta, no una partitura exacta.`;
      renderTab(); drawRoll(); q('.csv').disabled = false;
      cancelAnimationFrame(raf); tick();
    } catch (e) {
      console.error(e);
      q('.status').textContent = 'No se pudo analizar este archivo: ' + e.message;
    } finally {
      q('.analyze').disabled = false;
      q('.bar').hidden = true;
    }
  };

  function label(n) {
    if (!n.pos) return 'sin botón';
    const row = ROWS.find((r) => r.id === n.pos.btn.row).label.replace('Hilera ', '');
    return `${row} ${n.pos.btn.index} · ${n.pos.dir === 'push' ? 'cerrando' : 'abriendo'}`;
  }

  function renderTab() {
    q('.tab').innerHTML = notes.map((n, k) =>
      `<li class="chip ${n.pos ? n.pos.dir : 'missing'}" data-k="${k}" title="${esc(label(n))} · ${n.start.toFixed(2)} s"><b>${k + 1}</b> ${esc(T.nameEs(T.spellPc(n.played, t.pref)))}</li>`).join('');
    q('.tab').querySelectorAll('li').forEach((li) => li.onclick = () => { video.currentTime = notes[+li.dataset.k].start; });
  }

  function drawRoll() {
    const cv = q('.roll');
    cv.width = cv.clientWidth * devicePixelRatio; cv.height = 160 * devicePixelRatio;
    const g = cv.getContext('2d'); g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    const W = cv.clientWidth, H = 160, dur = video.duration || (notes.at(-1)?.end ?? 1);
    g.clearRect(0, 0, W, H);
    if (!notes.length) return;
    const lo = Math.min(...notes.map((n) => n.played)) - 1, hi = Math.max(...notes.map((n) => n.played)) + 1;
    const css = getComputedStyle(document.documentElement);
    for (const n of notes) {
      g.fillStyle = n.pos?.dir === 'pull' ? css.getPropertyValue('--pull') : css.getPropertyValue('--push');
      const y = H - ((n.played - lo) / (hi - lo)) * H;
      g.fillRect((n.start / dur) * W, y - 3, Math.max(2, ((n.end - n.start) / dur) * W), 6);
    }
    g.fillStyle = css.getPropertyValue('--ink');
    g.fillRect((video.currentTime / dur) * W, 0, 2, H);
    if (A != null && B != null) { g.fillStyle = 'rgba(120,120,255,.15)'; g.fillRect((A / dur) * W, 0, ((B - A) / dur) * W, H); }
  }
  q('.roll').onclick = (e) => { const r = e.target.getBoundingClientRect(); video.currentTime = ((e.clientX - r.left) / r.width) * (video.duration || 0); };

  function tick() {
    const tNow = video.currentTime;
    if (q('[name=loop]').checked && A != null && B != null && B > A && tNow >= B) video.currentTime = A;
    let idx = -1;
    for (let k = 0; k < notes.length; k++) { if (notes[k].start <= tNow + 0.02) idx = k; else break; }
    if (idx !== lastIdx) {
      lastIdx = idx;
      const cur = notes[idx], next = notes[idx + 1];
      const marks = [];
      if (next?.pos) marks.push({ btnId: next.pos.btn.id, dir: next.pos.dir, label: '›' });
      if (cur?.pos && tNow <= cur.end + 0.15) marks.push({ btnId: cur.pos.btn.id, dir: cur.pos.dir, label: '●', active: true });
      kb.mark(marks);
      q('.big-note').textContent = cur ? T.nameEs(T.spellPc(cur.played, t.pref)) : '—';
      q('.where').textContent = cur ? label(cur) : '';
      q('.tab').querySelectorAll('li').forEach((li) => li.classList.toggle('on', +li.dataset.k === idx));
      const on = q('.tab li.on'); if (on && !video.paused) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    drawRoll();
    raf = requestAnimationFrame(tick);
  }

  q('.csv').onclick = () => {
    const rows = [['n', 'inicio_s', 'fin_s', 'nota', 'cifrado', 'hilera', 'boton', 'fuelle']];
    notes.forEach((n, k) => {
      const sp = T.spellPc(n.played, t.pref);
      rows.push([k + 1, n.start.toFixed(3), n.end.toFixed(3), T.nameEs(sp), T.nameEn(sp), n.pos?.btn.row ?? '', n.pos?.btn.index ?? '', n.pos ? (n.pos.dir === 'push' ? 'cerrando' : 'abriendo') : '']);
    });
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = (file?.name || 'video').replace(/\.\w+$/, '') + `-${t.id}.csv`; a.click();
  };

  state.cleanup.push(() => { cancelAnimationFrame(raf); video.pause(); if (video.src) URL.revokeObjectURL(video.src); });
}

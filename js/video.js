// Aprender de un video o audio: melodía + mano izquierda → canción con tempo,
// partitura y tablatura sincronizadas con el video, lista para practicar o exportar.
import * as T from './theory.js';
import { buttons } from './instrument.js';
import { analyzeBuffer } from './pitch/tracker.js';
import { analyzeBass } from './pitch/bass.js';
import { songFromAnalysis } from './song.js';
import { mountSongPanel } from './songview.js';
import { icon } from './icons.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ANALYSIS_SR = 22050;

/** Lleva cada nota detectada a una altura que exista en el teclado (misma clase, octava más cercana). */
export function foldToInstrument(tuning, notes) {
  const avail = [...new Set(buttons(tuning).flatMap((b) => [b.push, b.pull]))];
  return notes.map((n) => {
    const pc = T.midiToPc(n.midi);
    let best = null;
    for (const m of avail) if (T.midiToPc(m) === pc && (best == null || Math.abs(m - n.midi) < Math.abs(best - n.midi))) best = m;
    return { ...n, midi: best ?? n.midi, heard: n.midi };
  });
}

/** Une notas repetidas separadas por huecos mínimos (artefactos del trémolo) y quita las muy cortas. */
export function cleanNotes(notes, { minDur = 0.07, mergeGap = 0.03 } = {}) {
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
  root.className = 'video-view';
  root.innerHTML = `
    <header class="page-head">
      <h1>Sácala de oído… con ayuda</h1>
      <p>Carga el video o el audio de un acordeonero. La app escucha la melodía y los bajos, calcula el tempo y te arma la partitura con la tablatura en tu acordeón <b>${esc(t.name)}</b>. Desde ahí la practicas, la corriges o la descargas.</p>
    </header>
    <div class="card">
      <div class="row-ctrls">
        <label class="btn">${icon('file')} Elegir video o audio<input type="file" accept="video/*,audio/*" hidden></label>
        <label>Título <input name="title" placeholder="Nombre de la canción"></label>
        <label>Compás <select name="meter"><option value="2/4">2/4 (paseo, son)</option><option value="6/8">6/8 (merengue, puya)</option><option value="4/4">4/4</option></select></label>
        <label>Detector <select name="algo"><option value="salience">Con conjunto (caja, guacharaca, voz)</option><option value="yin">Acordeón solo</option></select></label>
        <button class="btn accent analyze" disabled>Analizar</button>
      </div>
      <p class="status muted">Se procesa en tu dispositivo, no se sube a ningún lado. Sirve un video grabado con el celular. Los enlaces de YouTube no se pueden leer desde el navegador.</p>
      <div class="bar" hidden><div></div></div>
      <video controls playsinline hidden></video>
    </div>
    <div class="panel-host"></div>`;
  main.append(root);
  const q = (s) => root.querySelector(s);
  const video = q('video');
  let file = null;

  q('input[type=file]').onchange = (e) => {
    file = e.target.files[0];
    if (!file) return;
    if (video.src) URL.revokeObjectURL(video.src);
    video.src = URL.createObjectURL(file);
    video.hidden = false;
    q('.analyze').disabled = false;
    if (!q('[name=title]').value) q('[name=title]').value = file.name.replace(/\.\w+$/, '').replace(/[_-]+/g, ' ');
    q('.status').textContent = `${file.name} listo. Dale a Analizar.`;
  };

  const setP = (p, msg) => { q('.bar div').style.width = `${Math.round(p * 100)}%`; if (msg) q('.status').textContent = msg; };

  q('.analyze').onclick = async () => {
    q('.analyze').disabled = true;
    q('.bar').hidden = false;
    try {
      setP(0.02, 'Leyendo el audio…');
      const data = await file.arrayBuffer();
      const tmp = new AudioContext();
      const decoded = await tmp.decodeAudioData(data);
      tmp.close();
      const len = Math.ceil(decoded.duration * ANALYSIS_SR);
      const off = new OfflineAudioContext(1, len, ANALYSIS_SR);
      const src = off.createBufferSource(); src.buffer = decoded;
      const lp = off.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
      src.connect(lp).connect(off.destination); src.start();
      const samples = (await off.startRendering()).getChannelData(0);
      let peak = 0; for (let k = 0; k < samples.length; k++) peak = Math.max(peak, Math.abs(samples[k]));
      if (peak > 0) for (let k = 0; k < samples.length; k++) samples[k] /= peak;

      setP(0.08, 'Buscando la melodía…');
      const { notes: raw, frames } = await analyzeBuffer(samples, ANALYSIS_SR, {
        frameSize: 2048, hop: 256, algorithm: q('[name=algo]').value, detector: { minRms: 0.02 },
        onProgress: (p) => setP(0.08 + p * 0.6),
      });
      setP(0.7, 'Escuchando los bajos…');
      const bass = await analyzeBass(samples, ANALYSIS_SR, { melodyFrames: frames, onProgress: (p) => setP(0.7 + p * 0.25) });
      setP(0.97, 'Calculando tempo y tablatura…');
      const melody = foldToInstrument(t, cleanNotes(raw));
      const song = songFromAnalysis({ title: q('[name=title]').value.trim() || file.name, tuningId: t.id, melody, bass, meter: q('[name=meter]').value, duration: decoded.duration });
      song.source = { file: file.name };
      state.song = song;
      setP(1, `Listo: ${song.notes.length} notas y ${song.bass.length} golpes de bajo, a unos ${Math.round(song.bpm)} pulsos por minuto. Revisa a oído: es una propuesta, se puede corregir nota por nota.`);
      mountSongPanel(q('.panel-host'), song, { state, video });
      q('.panel-host').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      console.error(e);
      q('.status').textContent = 'No se pudo analizar este archivo: ' + e.message;
    } finally {
      q('.analyze').disabled = false;
      q('.bar').hidden = true;
    }
  };

  state.cleanup.push(() => { video.pause(); if (video.src) URL.revokeObjectURL(video.src); });
}

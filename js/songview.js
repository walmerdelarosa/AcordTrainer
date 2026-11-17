// Panel de canción: partitura + tablatura, reproducción, edición de notas y exportación.
import * as T from './theory.js';
import { getTuning, positionsForMidi, ROWS } from './instrument.js';
import { renderScore } from './notation.js';
import { SongPlayer } from './player.js';
import { METERS, ticksPerMeasure, toTick } from './rhythm.js';
import { requantize, refinger, toMusicXML, toMIDI, toCSV, tabCode } from './song.js';
import { saveSong } from './library.js';
import { createKeyboard } from './keyboard.js';
import { playMidi } from './audio.js';
import { icon } from './icons.js';
import { ctrl } from './controller.js';

const pref = {
  get(k, d) { try { const v = localStorage.getItem('acordeon:play.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('acordeon:play.' + k, JSON.stringify(v)); } catch { /* */ } },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'cancion';

function download(name, data, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function mountSongPanel(root, song, { state, video = null, onSaved } = {}) {
  const tuning = getTuning(song.tuningId);
  const tpm = ticksPerMeasure(song.meter);
  root.innerHTML = `
  <section class="song-panel">
    <div class="song-head">
      <input class="song-title" value="${esc(song.title)}" aria-label="Título de la canción">
      <div class="song-meta">
        <span class="pill">${esc(tuning.name)}</span>
        <label>Compás <select name="meter">${Object.entries(METERS).map(([k, v]) => `<option value="${k}" ${k === song.meter ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
        <label class="tempo">Tempo <input type="number" name="bpm" min="30" max="260" step="1" value="${Math.round(song.bpm)}"> <span class="muted">pulsos/min</span></label>
        <span class="seg tiny" title="Corrige el tempo si quedó al doble o a la mitad">
          <button class="btn ghost xs" data-k="0.5">÷2</button><button class="btn ghost xs" data-k="0.6667">÷1,5</button><button class="btn ghost xs" data-k="1.5">×1,5</button><button class="btn ghost xs" data-k="2">×2</button>
        </span>
      </div>
    </div>
    <div class="transport">
      <button class="btn play">${icon('play')} Escuchar</button>
      <label>Velocidad <select name="speed"><option value="0.5">50 %</option><option value="0.75">75 %</option><option value="0.9">90 %</option><option value="1" selected>100 %</option></select></label>
      <label>Compases <input type="number" name="from" min="1" value="1"> a <input type="number" name="to" min="1" value="${song.measures}"></label>
      <label class="check"><input type="checkbox" name="loop"> Repetir</label>
      <label class="check"><input type="checkbox" name="melody" ${pref.get('melody', true) ? 'checked' : ''}> Melodía</label>
      <label class="check"><input type="checkbox" name="bass" ${pref.get('bass', false) ? 'checked' : ''}> Bajos</label>
      <label class="check"><input type="checkbox" name="metro" ${pref.get('metro', false) ? 'checked' : ''}> Compás (guacharaca)</label>
    </div>
    <div class="score-legend muted small">Tablatura: <b>af / me / ad</b> = hilera de afuera, del medio y de adentro; el número es el botón (1 = arriba). Fuelle: <span class="push-t">C cerrando</span> · <span class="pull-t">A abriendo</span>. Bajos: <b>Sib</b> = bajo, <b>sib</b> = acorde; el número pequeño es el botón de bajo. Toca una nota para editarla.</div>
    <div class="score-scroll"><div class="score-box"></div></div>
    <div class="editor" hidden></div>
    <div class="follow-kb"></div>
    <div class="actions">
      <button class="btn accent practice">${icon('mic')} Practicar esta canción</button>
      <button class="btn ghost save">${icon('save')} Guardar en Mis canciones</button>
      <span class="dl">Descargar:
        <button class="btn ghost sm xml" title="Para MuseScore, Finale, Sibelius, Dorico, Guitar Pro…">MusicXML</button>
        <button class="btn ghost sm mid" title="Para cualquier programa o secuenciador">MIDI</button>
        <button class="btn ghost sm csv">CSV</button></span>
      <span class="save-msg muted"></span>
    </div>
  </section>`;
  const q = (s) => root.querySelector(s);
  ['melody', 'bass', 'metro'].forEach((k) => { q(`[name=${k}]`).onchange = (e) => pref.set(k, e.target.checked); });
  let score, selected = -1;
  const bassOnly = song.notes.length === 0;
  const followKb = createKeyboard(q('.follow-kb'), { tuning, mode: 'both', showBass: bassOnly, orientation: 'horizontal' });

  const player = new SongPlayer(song, {
    onTick: (tick) => { score.setCursor(tick); follow(tick); },
    onEnd: () => { q('.play').innerHTML = `${icon('play')} Escuchar`; score.setCursor(null); },
  });

  const followList = () => (song.notes.length ? song.notes : song.bass);
  function noteAt(tick) {
    const list = followList();
    let idx = -1;
    for (let i = 0; i < list.length; i++) { if (list[i].tick <= tick + 0.01) idx = i; else break; }
    return idx;
  }
  let lastFollow = -2;
  function follow(tick) {
    const i = noteAt(tick);
    if (i === lastFollow) return;
    lastFollow = i;
    const list = followList();
    const cur = list[i], next = list[i + 1];
    const marks = [];
    if (next?.pos) marks.push({ btnId: next.pos.btn.id, dir: next.pos.dir, label: '›' });
    if (cur?.pos && tick < cur.tick + cur.dur + 0.5) marks.push({ btnId: cur.pos.btn.id, dir: cur.pos.dir, label: '●', active: true });
    followKb.mark(marks);
    ctrl.mark(marks.filter((m) => m.active));
  }

  function draw() {
    score = renderScore(q('.score-box'), song, { onSelect: select });
    if (selected >= 0) score.select(selected);
    q('[name=to]').max = song.measures; q('[name=from]').max = song.measures;
  }
  draw();
  let lastW = q('.score-box').clientWidth;
  const ro = new ResizeObserver(() => { const w = q('.score-box').clientWidth; if (Math.abs(w - lastW) > 40) { lastW = w; draw(); } });
  ro.observe(q('.score-box'));

  // ----- Edición -----
  function select(i) {
    selected = i;
    score.select(i);
    const n = song.notes[i];
    if (!n) { q('.editor').hidden = true; return; }
    playMidi(n.midi, 0.4);
    if (video) video.currentTime = n.t0;
    const sp = T.spellPc(T.midiToPc(n.midi), tuning.pref);
    const alts = positionsForMidi(tuning, n.midi);
    const ed = q('.editor');
    ed.hidden = false;
    ed.innerHTML = `
      <b>Nota ${i + 1}:</b> ${T.nameEs(sp)}${T.midiOctave(n.midi)} · compás ${Math.floor(n.tick / tpm) + 1}
      · ${n.pos ? `${ROWS.find((r) => r.id === n.pos.btn.row).label.toLowerCase()}, botón ${n.pos.btn.index}, <span class="${n.pos.dir}-t">${n.pos.dir === 'push' ? 'cerrando' : 'abriendo'}</span>` : 'sin botón'}
      <div class="row-ctrls">
        <button class="btn ghost sm" data-a="alt" ${alts.length < 2 ? 'disabled' : ''}>Otra posición (${alts.length})</button>
        <button class="btn ghost sm" data-a="down">− semitono</button><button class="btn ghost sm" data-a="up">+ semitono</button>
        <button class="btn ghost sm" data-a="shorter">− corta</button><button class="btn ghost sm" data-a="longer">+ larga</button>
        <button class="btn ghost sm danger" data-a="del">Borrar</button>
        <button class="btn ghost sm" data-a="refinger" title="Recalcula botones y fuelle de toda la canción">Re-digitar todo</button>
        <button class="btn ghost sm" data-a="close">Cerrar</button>
      </div>`;
    ed.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => edit(b.dataset.a));
  }
  function edit(a) {
    const n = song.notes[selected];
    if (!n) return;
    const setPos = (p) => { n.pos = p; n.btnId = p?.btn.id ?? null; n.dir = p?.dir ?? null; };
    if (a === 'alt') {
      const alts = positionsForMidi(tuning, n.midi);
      const k = alts.findIndex((p) => p.btn.id === n.btnId && p.dir === n.dir);
      setPos(alts[(k + 1) % alts.length]);
    } else if (a === 'up' || a === 'down') {
      n.midi += a === 'up' ? 1 : -1;
      const alts = positionsForMidi(tuning, n.midi);
      setPos(alts.find((p) => p.dir === n.dir) || alts[0] || null);
    } else if (a === 'shorter') n.dur = Math.max(1, n.dur - 1);
    else if (a === 'longer') {
      const next = song.notes[selected + 1];
      if (!next || n.tick + n.dur < next.tick) n.dur += 1;
    } else if (a === 'del') { song.notes.splice(selected, 1); selected = Math.min(selected, song.notes.length - 1); }
    else if (a === 'refinger') refinger(song);
    else if (a === 'close') { selected = -1; q('.editor').hidden = true; score.select(-1); return; }
    dirty();
    draw();
    if (selected >= 0 && a !== 'del') select(selected); else q('.editor').hidden = true;
  }
  function dirty() { q('.save-msg').textContent = 'Cambios sin guardar'; }

  // ----- Tempo y compás -----
  const retime = () => {
    requantize(song);
    q('[name=to]').value = song.measures;
    dirty(); draw();
  };
  q('[name=bpm]').onchange = (e) => {
    const nb = +e.target.value;
    if (!(nb >= 30 && nb <= 260)) return;
    song.bpm = nb; retime();
  };
  root.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => {
    song.bpm = Math.round(song.bpm * +b.dataset.k * 10) / 10;
    q('[name=bpm]').value = Math.round(song.bpm); retime();
  });
  q('[name=meter]').onchange = (e) => { song.meter = e.target.value; retime(); };
  q('.song-title').onchange = (e) => { song.title = e.target.value.trim() || song.title; dirty(); };

  // ----- Reproducción -----
  const range = () => {
    const tpmNow = ticksPerMeasure(song.meter);
    const f = Math.max(1, Math.min(song.measures, +q('[name=from]').value || 1));
    const t = Math.max(f, Math.min(song.measures, +q('[name=to]').value || song.measures));
    return [(f - 1) * tpmNow, t * tpmNow];
  };
  q('.play').onclick = () => {
    if (player.playing) { player.stop(); q('.play').innerHTML = `${icon('play')} Escuchar`; return; }
    if (video && !video.paused) video.pause();
    const [from, to] = range();
    player.play({ from, to, loop: q('[name=loop]').checked, speed: +q('[name=speed]').value,
      metronome: q('[name=metro]').checked, bass: q('[name=bass]').checked, melody: q('[name=melody]').checked });
    q('.play').innerHTML = `${icon('stop')} Detener`;
  };
  if (video) {
    q('[name=speed]').onchange = (e) => { video.playbackRate = +e.target.value; };
    let raf = 0;
    const tick = () => {
      if (!video.paused && !player.playing) {
        const tk = toTick(video.currentTime, song);
        const [from, to] = range();
        if (q('[name=loop]').checked && tk >= to) video.currentTime = video.currentTime - ((to - from) * 60) / (song.bpm * METERS[song.meter].ticksPerBeat);
        score.setCursor(tk); follow(tk);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    state.cleanup.push(() => cancelAnimationFrame(raf));
  }

  // ----- Acciones -----
  q('.practice').onclick = () => { player.stop(); state.song = song; state.exercise = null; location.hash = '#/practicar'; };
  q('.save').onclick = () => {
    const id = saveSong(song);
    if (id) { song.id = id; song.demo = false; q('.save-msg').textContent = '¡Guardada! Está en Mis canciones.'; onSaved && onSaved(id); }
    else q('.save-msg').textContent = 'No se pudo guardar (almacenamiento lleno o bloqueado).';
  };
  const base = () => `${slug(song.title)}-${tuning.id}`;
  q('.xml').onclick = () => download(base() + '.musicxml', toMusicXML(song), 'application/vnd.recordare.musicxml+xml');
  q('.mid').onclick = () => download(base() + '.mid', toMIDI(song), 'audio/midi');
  q('.csv').onclick = () => download(base() + '.csv', '﻿' + toCSV(song), 'text/csv;charset=utf-8');

  state.cleanup.push(() => { player.stop(); ro.disconnect(); });
  return { player, redraw: draw, song };
}

export { tabCode };

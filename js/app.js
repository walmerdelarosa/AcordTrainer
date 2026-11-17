import * as T from './theory.js';
import { TUNINGS, getTuning, rowKeys, ROWS } from './instrument.js';
import { createKeyboard } from './keyboard.js';
import { playMidi, playSequence, playChord, audioCtx } from './audio.js';
import { LESSONS, UNITS } from './lessons.js';
import { scaleExercise, chordExercise, intervalExercise, marksFor, rowTonic } from './exercises.js';
import { mountPractice } from './practice.js';
import { mountVideo } from './video.js';
import { createSurface } from './surface.js';
import { mountSongPanel } from './songview.js';
import { listSongs, getSong, deleteSong } from './library.js';
import { icon } from './icons.js';

// ---------- Estado persistente (best effort) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('acordeon:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('acordeon:' + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};

export const state = {
  tuning: getTuning(store.get('tuning', 'cinco-letras')),
  done: new Set(store.get('done', [])),
  exercise: null, // ejercicio enviado a "Practicar"
  song: null,     // canción abierta (análisis o biblioteca)
  cleanup: [],
};

const $ = (sel, root = document) => root.querySelector(sel);
const h = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- Selector de afinación ----------
function renderTuningSelect() {
  const sel = $('#tuning');
  sel.innerHTML = ['fabrica', 'taller'].map((g) => `<optgroup label="${g === 'fabrica' ? 'De fábrica' : 'De taller'}">${
    TUNINGS.filter((t) => t.group === g).map((t) => `<option value="${t.id}">${esc(t.name)} (${esc(t.rows)})</option>`).join('')}</optgroup>`).join('');
  sel.value = state.tuning.id;
  sel.onchange = () => {
    state.tuning = getTuning(sel.value);
    store.set('tuning', sel.value);
    route();
  };
}

// ---------- Widgets ----------
export function exerciseCard(ex, { compact = false } = {}) {
  const card = h(`<section class="card exercise">
    <header><h3>${esc(ex.title)}</h3>${ex.note ? `<p class="muted">${esc(ex.note)}</p>` : ''}</header>
    <ol class="chips">${ex.names.map((n, i) => {
      const p = ex.positions[i];
      const where = p ? `${p.btn.row} ${p.btn.index} · ${p.dir === 'push' ? 'cerrando' : 'abriendo'}${p.octaveFlex ? ' · otra octava' : ''}` : 'no disponible';
      return `<li class="chip ${p ? p.dir : 'missing'}" title="${esc(where)}"><b>${i + 1}</b> ${esc(n)}</li>`;
    }).join('')}</ol>
    ${ex.missing ? `<p class="warn">${ex.missing} nota(s) no existen en esta afinación con esta restricción.</p>` : ''}
    <div class="row-ctrls">
      <button class="btn play">${icon('play')} Escuchar</button>
      <label class="bpm">Tempo <input type="range" min="40" max="160" value="80"> <span>80</span></label>
      <button class="btn ghost practice">${icon('mic')} Practicar</button>
    </div>
    <div class="kb-wrap"></div>
    <p class="legend"><span class="dot push"></span> cerrando <span class="dot pull"></span> abriendo · los números son el orden</p>
  </section>`);
  const kb = createKeyboard($('.kb-wrap', card), { tuning: state.tuning, mode: 'both', showBass: false,
    onPress: (b, dir) => playMidi(b[dir], 0.4) });
  kb.mark(marksFor(ex));
  const bpm = $('.bpm input', card);
  bpm.oninput = () => { $('.bpm span', card).textContent = bpm.value; };
  let stop = null;
  $('.play', card).onclick = () => {
    if (stop) { stop(); stop = null; kb.mark(marksFor(ex)); $('.play', card).innerHTML = `${icon('play')} Escuchar`; return; }
    $('.play', card).innerHTML = `${icon('stop')} Detener`;
    stop = playSequence(ex.midis, { bpm: +bpm.value,
      onStep: (i) => kb.mark(marksFor(ex, i)),
      onEnd: () => { stop = null; kb.mark(marksFor(ex)); $('.play', card).innerHTML = `${icon('play')} Escuchar`; } });
  };
  $('.practice', card).onclick = () => { state.exercise = ex; state.song = null; location.hash = '#/practicar'; };
  return card;
}

function quizCard(w) {
  const card = h(`<section class="card quiz"><h3>${esc(w.q)}</h3><div class="opts">${
    w.options.map((o, i) => `<button class="btn ghost" data-i="${i}">${esc(o)}</button>`).join('')}</div><p class="fb" hidden></p></section>`);
  card.querySelectorAll('.opts button').forEach((b) => b.onclick = () => {
    const ok = +b.dataset.i === w.answer;
    card.querySelectorAll('.opts button').forEach((x) => x.classList.toggle('right', +x.dataset.i === w.answer));
    if (!ok) b.classList.add('wrong');
    const fb = $('.fb', card); fb.hidden = false;
    fb.innerHTML = (ok ? '<b>¡Correcto!</b> ' : '<b>Casi.</b> ') + esc(w.explain);
  });
  return card;
}

function renderWidget(w) {
  const t = state.tuning;
  switch (w.type) {
    case 'exercise': return exerciseCard(w.ex);
    case 'quiz': return quizCard(w);
    case 'keyboard': {
      const c = h('<section class="card"><div class="kb-wrap"></div></section>');
      createKeyboard($('.kb-wrap', c), { tuning: t, mode: w.mode || 'both', onPress: (b, dir) => b.bass ? playMidi(48 + b[dir], 0.6, { bass: true }) : playMidi(b[dir], 0.5) });
      return c;
    }
    case 'links': return h(`<section class="card links"><h3>Videos de referencia</h3><ul>${w.items.map(([n, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${esc(n)}</a></li>`).join('')}</ul></section>`);
    case 'tunings': return h(`<section class="card"><table class="tbl"><tr><th>Afinación</th><th>Hileras (afuera–medio–adentro)</th><th>Tipo</th></tr>${
      TUNINGS.map((x) => `<tr class="${x.id === t.id ? 'sel' : ''}"><td><b>${esc(x.name)}</b></td><td>${esc(x.rows)}<br><span class="muted">${esc(x.es)}</span></td><td>${x.group === 'fabrica' ? 'Fábrica' : 'Taller'}</td></tr>`).join('')}</table>
      <p class="muted">Las de taller se obtienen transportando una de fábrica. Información de referencia, por validar con un técnico.</p></section>`);
    case 'interval-demo': {
      const c = h(`<section class="card"><div class="opts">${w.pairs.map(([n], i) => `<button class="btn ghost" data-i="${i}">${icon('play')} ${esc(n)}</button>`).join('')}</div></section>`);
      c.querySelectorAll('button').forEach((b) => b.onclick = () => { const [, a, z] = w.pairs[+b.dataset.i]; playMidi(a, 0.5); playMidi(z, 0.5, { when: 0.55 }); });
      return c;
    }
    case 'progression': {
      const c = h(`<section class="card"><p>${w.chords.map((r, i) => `<b>${['I', 'IV', 'V', 'I'][i]}</b> ${T.nameEs(r)}`).join(' → ')}</p><button class="btn">${icon('play')} Escuchar progresión</button></section>`);
      $('button', c).onclick = () => w.chords.forEach((r, i) => setTimeout(() => {
        const base = 60 + ((T.pcOf(r) - 0 + 12) % 12);
        playChord(T.triad(r).map((n, k) => base + [0, 4, 7][k]), 0.9);
        playMidi(base - 24, 0.9, { bass: true });
      }, i * 1000));
      return c;
    }
    case 'toggle-accidentals': {
      const c = h(`<section class="card"><p>Escucha: Do♯ y Re♭ son el mismo sonido.</p><button class="btn ghost">${icon('play')} Do♯</button> <button class="btn ghost">${icon('play')} Re♭</button></section>`);
      c.querySelectorAll('button').forEach((b) => b.onclick = () => playMidi(61, 0.6));
      return c;
    }
    default: return h('<div></div>');
  }
}

// ---------- Vistas ----------
function viewLearn(main) {
  const total = LESSONS.filter((l) => !l.draft).length;
  const done = LESSONS.filter((l) => state.done.has(l.id)).length;
  main.append(h(`<section class="hero">
    <div class="hero-text">
      <p class="kicker">Escuela de acordeón vallenato</p>
      <h1>Botón a botón, del cero a la parranda</h1>
      <p>Teoría con ejemplos en tu propia afinación, la botonera con sonido, tu teclado de computador como acordeón y canciones que sacas de un video. Todo en el navegador, sin instalar nada.</p>
      <div class="row-ctrls">
        <a class="btn accent" href="#/leccion/${(LESSONS.find((l) => !state.done.has(l.id) && !l.draft) || LESSONS[0]).id}">${done ? 'Seguir donde iba' : 'Arrancar la primera lección'}</a>
        <a class="btn ghost" href="#/teclado">${icon('keys')} Tocar con el teclado</a>
        <a class="btn ghost" href="#/video">${icon('ear')} Sacar una canción</a>
      </div>
      <div class="progress" aria-label="Progreso"><div style="width:${(100 * done / total).toFixed(0)}%"></div></div>
      <p class="muted small">${done} de ${total} lecciones completadas</p>
    </div>
    <div class="hero-art" aria-hidden="true">${ACCORDION_ART}</div>
  </section>`));
  for (const u of UNITS) {
    const ls = LESSONS.filter((l) => l.unit === u.id);
    main.append(h(`<section class="unit"><h2><span class="unit-n">${u.id}</span> ${esc(u.title)}</h2><ol class="lessons">${ls.map((l) =>
      `<li class="${state.done.has(l.id) ? 'done' : ''} ${l.draft ? 'draft' : ''}"><a href="#/leccion/${l.id}">${esc(l.title)}</a><span class="muted">${l.minutes} min${l.draft ? ' · en construcción' : ''}</span></li>`).join('')}</ol></section>`));
  }
}

// Acordeón ilustrado (original): fuelle con los colores de la bandera y teclado de botones.
const ACCORDION_ART = `<svg viewBox="0 0 300 220" class="accordion-art">
  <rect x="20" y="40" width="70" height="150" rx="10" class="acc-case"/>
  ${[0, 1, 2].map((c) => [...Array(c === 1 ? 6 : 5)].map((_, i) => `<circle cx="${38 + c * 17}" cy="${(c === 1 ? 58 : 66) + i * 22}" r="6.5" class="acc-btn"/>`).join('')).join('')}
  ${[...Array(9)].map((_, i) => `<path d="M${92 + i * 14} 46 l7 -8 l7 8 v136 l-7 8 l-7 -8 z" class="fold f${i % 3}"/>`).join('')}
  <rect x="218" y="40" width="64" height="150" rx="10" class="acc-case"/>
  ${[...Array(6)].map((_, i) => `<circle cx="240" cy="${66 + i * 22}" r="6" class="acc-btn b"/><circle cx="262" cy="${66 + i * 22}" r="6" class="acc-btn b"/>`).join('')}
  <path d="M30 40 q 25 -26 55 0" class="strap"/>
</svg>`;

function viewLesson(main, id) {
  const idx = LESSONS.findIndex((l) => l.id === id);
  const l = LESSONS[idx];
  if (!l) { main.append(h('<p>Lección no encontrada.</p>')); return; }
  const t = state.tuning;
  main.append(h(`<nav class="crumbs"><a href="#/">Lecciones</a> › Unidad ${l.unit}</nav>`));
  main.append(h(`<article class="lesson"><h1>${esc(l.title)}</h1><div class="body">${l.body(t)}</div></article>`));
  for (const w of l.widgets(t)) main.append(renderWidget(w));
  const prev = LESSONS[idx - 1], next = LESSONS[idx + 1];
  const nav = h(`<nav class="lesson-nav">
    ${prev ? `<a class="btn ghost" href="#/leccion/${prev.id}">← ${esc(prev.title)}</a>` : '<span></span>'}
    ${l.draft ? '' : `<button class="btn mark">${state.done.has(l.id) ? '✓ Completada' : 'Marcar como completada'}</button>`}
    ${next ? `<a class="btn ghost" href="#/leccion/${next.id}">${esc(next.title)} →</a>` : '<span></span>'}</nav>`);
  const mark = $('.mark', nav);
  if (mark) mark.onclick = () => {
    state.done.has(l.id) ? state.done.delete(l.id) : state.done.add(l.id);
    store.set('done', [...state.done]);
    mark.textContent = state.done.has(l.id) ? '✓ Completada' : 'Marcar como completada';
  };
  main.append(nav);
}

function viewExplore(main) {
  const t = state.tuning;
  const form = h(`<section class="card"><h1>Escalas y acordes</h1>
    <div class="form">
      <label>Tipo <select name="type">
        <option value="mayor">Escala mayor</option><option value="menor">Escala menor natural</option>
        <option value="cromatica">Escala cromática</option>
        <option value="ch-mayor">Acorde mayor</option><option value="ch-menor">Acorde menor</option>
        <option value="ch-disminuido">Acorde disminuido</option><option value="ch-aumentado">Acorde aumentado</option>
        <option value="iv-3">Terceras (por hilera)</option><option value="iv-6">Sextas (por hilera)</option>
        <option value="iv-8">Octavas (por hilera)</option><option value="iv-10">Décimas (por hilera)</option>
      </select></label>
      <label>Tónica <select name="tonic">${T.TONICS.map((n, i) => `<option value="${i}">${T.nameEs(n)} (${T.nameEn(n)})</option>`).join('')}</select></label>
      <label>Hilera <select name="row"><option value="">Libre (toda la botonera)</option>${ROWS.map((r) => `<option value="${r.id}">${r.label} (${T.nameEs(rowTonic(t, r.id))})</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" name="descend"> Subir y bajar</label>
    </div>
    <p class="muted">La digitación es una sugerencia calculada (minimiza cambios de fuelle y saltos). Compárala con la de tu profesor.</p></section>`);
  const out = h('<div></div>');
  main.append(form, out);
  const f = (n) => form.querySelector(`[name=${n}]`);
  f('tonic').value = String(T.TONICS.findIndex((n) => T.pcOf(n) === rowKeys(t)[0]));
  const update = () => {
    const type = f('type').value, row = f('row').value || null, tonic = T.TONICS[+f('tonic').value];
    f('tonic').disabled = type.startsWith('iv-');
    let ex;
    if (type.startsWith('ch-')) ex = chordExercise(t, tonic, type.slice(3), { onlyRow: row });
    else if (type.startsWith('iv-')) ex = intervalExercise(t, row || 'afuera', +type.slice(3));
    else {
      const ton = type === 'menor' ? T.MINOR_TONICS.find((n) => T.pcOf(n) === T.pcOf(tonic)) : tonic;
      ex = scaleExercise(t, ton, type, { onlyRow: row, descend: f('descend').checked });
    }
    out.innerHTML = ''; out.append(exerciseCard(ex));
  };
  form.querySelectorAll('select,input').forEach((x) => x.onchange = update);
  update();
}

function viewKeyboard(main) {
  main.append(h(`<header class="page-head"><h1>La botonera</h1>
    <p>Toca con el mouse, con el dedo o con el <b>teclado del computador</b>: cada fila de letras es una hilera y la barra espaciadora es el fuelle. Mantén un botón y cambia el fuelle para oír cómo cambia la nota.</p></header>`));
  const now = h('<p class="now-playing muted">Toca un botón.</p>');
  const host = h('<div></div>');
  main.append(host, now);
  const s = createSurface(host, { tuning: state.tuning, onNote: (e) => {
    const n = e.bass ? `${e.btn.kind === 'bajo' ? 'bajo' : 'acorde'} ${T.nameEs(T.spellPc(e.btn[e.dir], state.tuning.pref))}` : T.midiName(e.midi, state.tuning.pref);
    now.innerHTML = `${e.bass ? 'Bajos' : `${esc(e.btn.row)} ${e.btn.index}`} · <span class="${e.dir}-t">${e.dir === 'push' ? 'cerrando' : 'abriendo'}</span> → <b>${esc(n)}</b>`;
  } });
  state.cleanup.push(() => s.destroy());
}

function viewSongs(main) {
  const t = state.tuning;
  const songs = listSongs();
  main.append(h(`<header class="page-head"><h1>Mis canciones</h1>
    <p>Las canciones que sacas de un video quedan guardadas aquí, en este navegador. Ábrelas para verlas en partitura y tablatura, practicarlas o descargarlas.</p>
    <div class="row-ctrls"><a class="btn accent" href="#/video">${icon('ear')} Sacar una canción de un video</a></div></header>`));
  const list = h(`<ul class="song-list">
    <li><a href="#/cancion/demo-${t.id}"><b>Paseo de práctica</b> <span class="muted">ejemplo · ${esc(t.name)}</span></a></li>
    ${songs.map((s) => `<li><a href="#/cancion/${s.id}"><b>${esc(s.title)}</b> <span class="muted">${esc(getTuning(s.tuningId).name)} · ${s.meter} · ${Math.round(s.bpm)} pulsos/min · ${s.notes.length} notas</span></a><button class="btn ghost xs del" data-id="${s.id}" title="Borrar">${icon('trash')}</button></li>`).join('')}
  </ul>`);
  list.querySelectorAll('.del').forEach((b) => b.onclick = () => { if (confirm('¿Borrar esta canción de este navegador?')) { deleteSong(b.dataset.id); route(); } });
  main.append(list);
  if (!songs.length) main.append(h('<p class="muted">Todavía no has guardado canciones.</p>'));
}

function viewSong(main, id) {
  let song = state.song && state.song.id === id ? state.song : getSong(id, state.tuning.id);
  if (!song) { main.append(h('<p>No encontré esa canción. <a href="#/canciones">Ver Mis canciones</a></p>')); return; }
  if (song.tuningId !== state.tuning.id && !id.startsWith('demo')) {
    main.append(h(`<p class="warn">Esta canción está digitada para ${esc(getTuning(song.tuningId).name)}. Cambia la afinación arriba para verla con los botones correctos.</p>`));
  }
  if (id.startsWith('demo') && song.tuningId !== state.tuning.id) song = getSong('demo-' + state.tuning.id);
  state.song = song;
  main.append(h(`<nav class="crumbs"><a href="#/canciones">Mis canciones</a> › ${esc(song.title)}</nav>`));
  const host = h('<div></div>');
  main.append(host);
  mountSongPanel(host, song, { state, onSaved: (nid) => history.replaceState(null, '', '#/cancion/' + nid) });
}

function viewAbout(main) {
  main.append(h(`<article class="lesson card"><h1>Acerca de AcorTrainer</h1>
    <p>Una escuela de acordeón diatónico colombiano que cabe en el navegador. El mapa de botones parte de Cinco Letras y las demás afinaciones se calculan por transposición.</p>
    <h3>Cómo funciona el análisis de videos</h3>
    <ul><li>La melodía se detecta con un método espectral que tolera caja, guacharaca y bajos.</li>
      <li>La mano izquierda (bajo y acorde) se detecta aparte. Como el fuelle es uno solo, los bajos ayudan a decidir si la melodía va cerrando o abriendo.</li>
      <li>El tempo sale de los golpes de los bajos y la melodía, y las notas se ajustan a la rejilla del compás.</li>
      <li>El resultado se descarga en MusicXML (MuseScore, Finale, Sibelius, Dorico, Guitar Pro), MIDI o CSV.</li></ul>
    <h3>Qué falta validar</h3><ul>
      <li>Octava exacta de los botones auxiliares (el primero de cada hilera) y registro absoluto de cada afinación.</li>
      <li>Calidad (mayor o menor) de los acordes de los bajos.</li>
      <li>Datos de las afinaciones de taller.</li>
      <li>Digitaciones sugeridas frente a las de un profesor.</li></ul>
    <h3>Privacidad</h3><p>El micrófono y los videos se procesan en tu dispositivo. Nada se sube a ningún servidor; tus canciones quedan guardadas solo en este navegador.</p></article>`));
}

// ---------- Router ----------
const ROUTES = [
  [/^#?\/?$/, viewLearn, 'aprender'],
  [/^#\/leccion\/([\w-]+)$/, viewLesson, 'aprender'],
  [/^#\/explorar$/, viewExplore, 'explorar'],
  [/^#\/teclado$/, viewKeyboard, 'teclado'],
  [/^#\/canciones$/, viewSongs, 'canciones'],
  [/^#\/cancion\/([\w-]+)$/, viewSong, 'canciones'],
  [/^#\/practicar$/, (m) => mountPractice(m, state, exerciseFactory), 'practicar'],
  [/^#\/video$/, (m) => mountVideo(m, state), 'video'],
  [/^#\/acerca$/, viewAbout, 'acerca'],
];

const exerciseFactory = { scaleExercise, chordExercise, intervalExercise, rowTonic };

function route() {
  state.cleanup.forEach((fn) => { try { fn(); } catch { /* */ } });
  state.cleanup = [];
  const main = $('#main');
  main.innerHTML = '';
  const hash = location.hash || '#/';
  for (const [re, view, tab] of ROUTES) {
    const m = hash.match(re);
    if (m) {
      document.querySelectorAll('nav.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
      view(main, ...m.slice(1));
      window.scrollTo(0, 0);
      return;
    }
  }
  viewLearn(main);
}

window.addEventListener('hashchange', route);
document.addEventListener('pointerdown', () => audioCtx(), { once: true });
renderTuningSelect();
route();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo sin conexión */ });
}

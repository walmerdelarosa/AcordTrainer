import * as T from './theory.js';
import { TUNINGS, getTuning, rowKeys, ROWS } from './instrument.js';
import { createKeyboard } from './keyboard.js';
import { playMidi, playSequence, playChord, audioCtx } from './audio.js';
import { LESSONS, UNITS } from './lessons.js';
import { scaleExercise, chordExercise, intervalExercise, marksFor, rowTonic } from './exercises.js';
import { mountPractice } from './practice.js';
import { mountVideo } from './video.js';

// ---------- Estado persistente (best effort) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('acordeon:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('acordeon:' + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};

export const state = {
  tuning: getTuning(store.get('tuning', 'cinco-letras')),
  done: new Set(store.get('done', [])),
  exercise: null, // ejercicio enviado a "Practicar"
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
      <button class="btn play">▶ Escuchar</button>
      <label class="bpm">Tempo <input type="range" min="40" max="160" value="80"> <span>80</span></label>
      <button class="btn ghost practice">🎤 Practicar</button>
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
    if (stop) { stop(); stop = null; kb.mark(marksFor(ex)); $('.play', card).textContent = '▶ Escuchar'; return; }
    $('.play', card).textContent = '■ Detener';
    stop = playSequence(ex.midis, { bpm: +bpm.value,
      onStep: (i) => kb.mark(marksFor(ex, i)),
      onEnd: () => { stop = null; kb.mark(marksFor(ex)); $('.play', card).textContent = '▶ Escuchar'; } });
  };
  $('.practice', card).onclick = () => { state.exercise = ex; location.hash = '#/practicar'; };
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
      const c = h(`<section class="card"><div class="opts">${w.pairs.map(([n], i) => `<button class="btn ghost" data-i="${i}">▶ ${esc(n)}</button>`).join('')}</div></section>`);
      c.querySelectorAll('button').forEach((b) => b.onclick = () => { const [, a, z] = w.pairs[+b.dataset.i]; playMidi(a, 0.5); playMidi(z, 0.5, { when: 0.55 }); });
      return c;
    }
    case 'progression': {
      const c = h(`<section class="card"><p>${w.chords.map((r, i) => `<b>${['I', 'IV', 'V', 'I'][i]}</b> ${T.nameEs(r)}`).join(' → ')}</p><button class="btn">▶ Escuchar progresión</button></section>`);
      $('button', c).onclick = () => w.chords.forEach((r, i) => setTimeout(() => {
        const base = 60 + ((T.pcOf(r) - 0 + 12) % 12);
        playChord(T.triad(r).map((n, k) => base + [0, 4, 7][k]), 0.9);
        playMidi(base - 24, 0.9, { bass: true });
      }, i * 1000));
      return c;
    }
    case 'toggle-accidentals': {
      const c = h(`<section class="card"><p>Escucha: Do♯ y Re♭ son el mismo sonido.</p><button class="btn ghost">▶ Do♯</button> <button class="btn ghost">▶ Re♭</button></section>`);
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
  main.append(h(`<section class="hero"><h1>Aprende acordeón vallenato desde cero</h1>
    <p>Teoría con ejemplos en tu propia afinación, teclado con sonido, práctica con micrófono y análisis de videos. Todo funciona en tu navegador.</p>
    <div class="progress"><div style="width:${(100 * done / total).toFixed(0)}%"></div></div><p class="muted">${done} de ${total} lecciones completadas</p></section>`));
  for (const u of UNITS) {
    const ls = LESSONS.filter((l) => l.unit === u.id);
    main.append(h(`<section class="unit"><h2>Unidad ${u.id}. ${esc(u.title)}</h2><ol class="lessons">${ls.map((l) =>
      `<li class="${state.done.has(l.id) ? 'done' : ''} ${l.draft ? 'draft' : ''}"><a href="#/leccion/${l.id}">${esc(l.title)}</a><span class="muted">${l.minutes} min${l.draft ? ' · en construcción' : ''}</span></li>`).join('')}</ol></section>`));
  }
}

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
  const form = h(`<section class="card"><h1>Explorar escalas y acordes</h1>
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
  const c = h(`<section class="card"><h1>Teclado libre</h1>
    <div class="row-ctrls"><span>Fuelle:</span>
      <button class="btn ghost" data-m="push">Cerrando</button><button class="btn ghost" data-m="pull">Abriendo</button><button class="btn ghost" data-m="both">Ver ambos</button>
      <span class="muted">Atajo: mantén la barra espaciadora para abrir.</span></div>
    <div class="kb-wrap big"></div><p class="now muted">Toca un botón.</p></section>`);
  main.append(c);
  const kb = createKeyboard($('.kb-wrap', c), { tuning: state.tuning, mode: 'push', onPress: (b, dir) => {
    if (b.bass) { playMidi(48 + b[dir], 0.6, { bass: true }); return; }
    playMidi(b[dir], 0.5); kb.flash(b.id, dir);
    $('.now', c).textContent = `${b.row} ${b.index} · ${dir === 'push' ? 'cerrando' : 'abriendo'} → ${T.midiName(b[dir], state.tuning.pref)}`;
  } });
  const setMode = (m) => { kb.setMode(m); c.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('on', x.dataset.m === m)); };
  c.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => setMode(b.dataset.m));
  setMode('push');
  const down = (e) => { if (e.code === 'Space' && !e.repeat && kb.mode === 'push') { e.preventDefault(); setMode('pull'); } };
  const up = (e) => { if (e.code === 'Space' && kb.mode === 'pull') { e.preventDefault(); setMode('push'); } };
  window.addEventListener('keydown', down); window.addEventListener('keyup', up);
  state.cleanup.push(() => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); });
}

function viewAbout(main) {
  main.append(h(`<article class="lesson card"><h1>Acerca de</h1>
    <p>Proyecto abierto para aprender acordeón diatónico colombiano. El mapa de botones parte de Cinco Letras; las demás afinaciones se calculan por transposición.</p>
    <h3>Qué falta validar</h3><ul>
      <li>Octava exacta de los botones auxiliares (el primero de cada hilera) y registro absoluto de cada afinación.</li>
      <li>Calidad (mayor/menor) de los acordes de los bajos.</li>
      <li>Datos de las afinaciones de taller.</li>
      <li>Digitaciones sugeridas frente a las del profesor.</li></ul>
    <h3>Privacidad</h3><p>El micrófono y los videos se procesan en tu dispositivo. No se sube nada a ningún servidor.</p></article>`));
}

// ---------- Router ----------
const ROUTES = [
  [/^#?\/?$/, viewLearn, 'aprender'],
  [/^#\/leccion\/([\w-]+)$/, viewLesson, 'aprender'],
  [/^#\/explorar$/, viewExplore, 'explorar'],
  [/^#\/teclado$/, viewKeyboard, 'teclado'],
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

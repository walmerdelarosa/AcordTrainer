// Teclado del acordeón en SVG. Rojo = cerrando, verde = abriendo.
// Orientación vertical (como se ve el instrumento) u horizontal (como el teclado del PC:
// fila Q = afuera, fila A = medio, fila Z = adentro, fila de números = bajos, espacio = fuelle).
import { buttons, bassButtons, buttonLabel, bassNumber } from './instrument.js';
import { spellPc, nameEs, nameEn } from './theory.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
};

const R = 21;

function geometryVertical(btns, showBass) {
  const COL_X = { afuera: 46, medio: 100, adentro: 154 }, START_Y = { afuera: 62, medio: 36, adentro: 62 };
  const pos = {};
  for (const b of btns) pos[b.id] = { x: COL_X[b.row], y: START_Y[b.row] + (b.index - 1) * 52 };
  const bass = {};
  if (showBass) for (const b of bassButtons({ offset: 0 })) bass[b.id] = { x: 240 + b.col * 52, y: 125 + b.row * 56 };
  return { pos, bass, w: showBass ? 340 : 200, h: 618, body: { x: 14, y: 8, w: 172, h: 600 }, bassBody: showBass ? { x: 206, y: 90, w: 120, h: 360 } : null };
}

function geometryBassOnly() {
  const bass = {};
  for (const b of bassButtons({ offset: 0 })) bass[b.id] = { x: 36 + b.col * 50, y: 40 + b.row * 54 };
  return { pos: {}, bass, w: 122, h: 340, body: null, bassBody: { x: 6, y: 10, w: 110, h: 322 } };
}

function geometryHorizontal(btns, showBass, mirror) {
  const step = 52, x0 = 60, rowY = { afuera: 98, medio: 150, adentro: 202 }, off = { afuera: 0, medio: -step / 2, adentro: 0 };
  const pos = {};
  const maxX = x0 + 10 * step;
  for (const b of btns) {
    let x = x0 + off[b.row] + (b.index - 1) * step;
    if (mirror) x = maxX - (x - x0) + x0 - step;
    pos[b.id] = { x: x + 26, y: rowY[b.row] };
  }
  const bass = {};
  if (showBass) bassButtons({ offset: 0 }).forEach((b) => {
    const i = b.col * 6 + b.row;
    bass[b.id] = { x: 34 + i * 46 + (i >= 6 ? 14 : 0), y: 30 };
  });
  return { pos, bass, w: 640, h: 262, body: { x: 8, y: 68, w: 624, h: 162 }, bassBody: showBass ? { x: 8, y: 6, w: 588, h: 48 } : null };
}

export function createKeyboard(container, opts = {}) {
  const state = {
    tuning: opts.tuning,
    mode: opts.mode || 'push',       // 'push' | 'pull' | 'both'
    lang: opts.lang || 'es',
    showBass: opts.showBass !== false,
    part: opts.part || 'both',       // 'both' | 'treble' | 'bass'
    orientation: opts.orientation || 'vertical',
    mirror: !!opts.mirror,
    hints: opts.hints || null,      // { btnId: 'Q', ... }
    marks: new Map(),
    pressed: new Set(),
    onPress: opts.onPress || (() => {}),
    onRelease: opts.onRelease || (() => {}),
  };
  const svg = el('svg', { class: 'kb', role: 'group', 'aria-label': 'Teclado del acordeón' });
  container.innerHTML = '';
  container.appendChild(svg);
  container.classList.toggle('horizontal', state.orientation === 'horizontal');

  function render() {
    svg.innerHTML = '';
    const t = state.tuning;
    const btns = buttons(t);
    const bassOnly = state.part === 'bass';
    const showBass = state.part === 'treble' ? false : state.showBass;
    const geo = bassOnly ? geometryBassOnly()
      : state.orientation === 'horizontal' ? geometryHorizontal(btns, showBass, state.mirror) : geometryVertical(btns, showBass);
    svg.setAttribute('viewBox', `0 0 ${geo.w} ${geo.h}`);
    container.classList.toggle('horizontal', state.orientation === 'horizontal');
    if (geo.body) el('rect', { x: geo.body.x, y: geo.body.y, width: geo.body.w, height: geo.body.h, rx: 16, class: 'kb-body' }, svg);
    if (geo.bassBody) el('rect', { x: geo.bassBody.x, y: geo.bassBody.y, width: geo.bassBody.w, height: geo.bassBody.h, rx: state.orientation === 'horizontal' ? 12 : 40, class: 'kb-body bass' }, svg);
    if (bassOnly) { /* sin rótulos */ } else if (state.orientation === 'vertical') {
      [['Afuera', 46], ['Medio', 100], ['Adentro', 154]].forEach(([l, x]) => el('text', { x, y: 614, class: 'kb-rowlabel', 'text-anchor': 'middle' }, svg, l));
      if (showBass) el('text', { x: 266, y: 80, class: 'kb-rowlabel', 'text-anchor': 'middle' }, svg, 'Bajos');
    } else {
      [['afuera', 98], ['medio', 150], ['adentro', 202]].forEach(([l, y]) => el('text', { x: state.mirror ? 620 : 20, y: y + 4, class: 'kb-rowlabel', 'text-anchor': 'middle' }, svg, l.slice(0, 2)));
    }

    for (const b of bassOnly ? [] : btns) {
      const { x: cx, y: cy } = geo.pos[b.id];
      const g = el('g', { class: 'kb-btn' + (b.aux ? ' aux' : '') + (state.pressed.has(b.id) ? ' pressed' : ''), 'data-id': b.id, tabindex: 0, role: 'button', 'aria-label': `${b.row} ${b.index}` }, svg);
      const markPush = state.marks.get(`${b.id}:push`), markPull = state.marks.get(`${b.id}:pull`);
      if (state.mode === 'both') {
        el('circle', { cx, cy, r: R, class: 'kb-circle' }, g);
        el('path', { d: `M${cx - R} ${cy} A${R} ${R} 0 0 1 ${cx + R} ${cy} Z`, class: 'half push' + (markPush ? ' marked' + (markPush.active ? ' active' : '') : '') }, g);
        el('path', { d: `M${cx - R} ${cy} A${R} ${R} 0 0 0 ${cx + R} ${cy} Z`, class: 'half pull' + (markPull ? ' marked' + (markPull.active ? ' active' : '') : '') }, g);
        el('text', { x: cx, y: cy - 5, class: 'kb-lbl small' + (markPush ? ' on' : ''), 'text-anchor': 'middle' }, g, markPush?.label ?? buttonLabel(b, 'push', t, state.lang));
        el('text', { x: cx, y: cy + 14, class: 'kb-lbl small' + (markPull ? ' on' : ''), 'text-anchor': 'middle' }, g, markPull?.label ?? buttonLabel(b, 'pull', t, state.lang));
      } else {
        const mode = state.mode;
        const m = state.marks.get(`${b.id}:${mode}`);
        const other = state.marks.get(`${b.id}:${mode === 'push' ? 'pull' : 'push'}`);
        el('circle', { cx, cy, r: R, class: `kb-circle ${mode}` + (m ? ' marked' + (m.active ? ' active' : '') : '') + (other ? ' other-dir' : '') }, g);
        el('text', { x: cx, y: cy + (m?.label ? 2 : 5), class: 'kb-lbl', 'text-anchor': 'middle' }, g, m?.label ?? buttonLabel(b, mode, t, state.lang));
        if (m?.label) el('text', { x: cx, y: cy + 15, class: 'kb-sub', 'text-anchor': 'middle' }, g, buttonLabel(b, mode, t, state.lang));
      }
      if (state.hints?.[b.id]) {
        const hx = state.orientation === 'horizontal' ? cx + 15 : cx + 17, hy = cy - 15;
        el('rect', { x: hx - 7, y: hy - 7, width: 14, height: 13, rx: 3, class: 'kb-hint-bg' }, g);
        el('text', { x: hx, y: hy + 3, class: 'kb-hint', 'text-anchor': 'middle' }, g, state.hints[b.id]);
      }
      bindPress(g, b, cy);
    }

    if (showBass || bassOnly) {
      for (const b of bassButtons(t)) {
        const { x: cx, y: cy } = geo.bass[b.id];
        const r = bassOnly ? 21 : state.orientation === 'horizontal' ? 17 : 20;
        const dir = state.mode === 'pull' ? 'pull' : 'push';
        const g = el('g', { class: 'kb-btn bass ' + b.kind + (state.pressed.has(b.id) ? ' pressed' : ''), 'data-id': b.id }, svg);
        const bm = state.marks.get(`${b.id}:push`) || state.marks.get(`${b.id}:pull`);
        el('circle', { cx, cy, r, class: `kb-circle ${bm ? bm.dir : dir}` + (bm ? ' marked' + (bm.active ? ' active' : '') : '') }, g);
        const n = spellPc(b[dir], t.pref);
        const nm = state.lang === 'es' ? nameEs(n) : nameEn(n);
        el('text', { x: cx, y: cy + 2, class: 'kb-lbl small', 'text-anchor': 'middle' }, g, b.kind === 'bajo' ? nm : nm.toLowerCase());
        el('text', { x: cx, y: cy + 12, class: 'kb-sub', 'text-anchor': 'middle' }, g, b.kind === 'bajo' ? `bajo ${bassNumber(b)}` : `acorde ${bassNumber(b)}`);
        if (state.hints?.[b.id]) {
          el('rect', { x: cx + 7, y: cy - 22, width: 14, height: 13, rx: 3, class: 'kb-hint-bg' }, g);
          el('text', { x: cx + 14, y: cy - 12, class: 'kb-hint', 'text-anchor': 'middle' }, g, state.hints[b.id]);
        }
        bindPress(g, { ...b, bass: true }, cy);
      }
    }
  }

  function svgY(ev) {
    const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse()).y;
  }
  function bindPress(g, b, cy) {
    const dirFor = (ev) => (state.mode === 'both' ? (ev.clientY != null && svgY(ev) > cy ? 'pull' : 'push') : state.mode);
    g.addEventListener('pointerdown', (ev) => { ev.preventDefault(); g.setPointerCapture?.(ev.pointerId); state.onPress(b, dirFor(ev)); });
    const up = () => state.onRelease(b);
    g.addEventListener('pointerup', up);
    g.addEventListener('pointercancel', up);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); state.onPress(b, state.mode === 'both' ? 'push' : state.mode); setTimeout(up, 300); } });
  }

  render();
  return {
    setTuning(t) { state.tuning = t; render(); },
    setMode(m) { state.mode = m; render(); },
    setOptions(o) { Object.assign(state, o); render(); },
    get mode() { return state.mode; },
    mark(list) { state.marks = new Map(list.map((m) => [`${m.btnId}:${m.dir}`, m])); render(); },
    clear() { state.marks.clear(); render(); },
    press(id, on) {
      if (on) state.pressed.add(id); else state.pressed.delete(id);
      const g = svg.querySelector(`[data-id="${id}"]`);
      if (g) g.classList.toggle('pressed', on);
    },
    flash(btnId, dir) {
      const g = svg.querySelector(`[data-id="${btnId}"]`);
      if (!g) return;
      g.classList.add('flash', dir);
      setTimeout(() => g.classList.remove('flash', dir), 250);
    },
  };
}

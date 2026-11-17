// Teclado virtual del acordeón (SVG). Rojo = cerrando, verde = abriendo (convención habitual de los métodos).
import { buttons, bassButtons, buttonLabel, ROWS } from './instrument.js';
import { spellPc, nameEs, nameEn } from './theory.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

const COL_X = { afuera: 46, medio: 100, adentro: 154 };
const START_Y = { afuera: 62, medio: 36, adentro: 62 };
const STEP_Y = 52, R = 22;

export function createKeyboard(container, opts = {}) {
  const state = {
    tuning: opts.tuning,
    mode: opts.mode || 'push',     // 'push' | 'pull' | 'both'
    lang: opts.lang || 'es',
    showBass: opts.showBass !== false,
    marks: new Map(),              // key `${btnId}:${dir}` -> { label, active }
    onPress: opts.onPress || (() => {}),
  };
  const width = state.showBass ? 340 : 200;
  const svg = el('svg', { viewBox: `0 0 ${width} 610`, class: 'kb', role: 'img', 'aria-label': 'Teclado del acordeón' });
  container.innerHTML = '';
  container.appendChild(svg);

  function render() {
    svg.innerHTML = '';
    const t = state.tuning;
    // Caja del teclado
    el('rect', { x: 14, y: 8, width: 172, height: 594, rx: 18, class: 'kb-body' }, svg);
    ROWS.forEach((r) => {
      const tx = el('text', { x: COL_X[r.id], y: 600, class: 'kb-rowlabel', 'text-anchor': 'middle' }, svg);
      tx.textContent = r.id === 'afuera' ? 'Afuera' : r.id === 'medio' ? 'Medio' : 'Adentro';
    });
    for (const b of buttons(t)) {
      const cx = COL_X[b.row], cy = START_Y[b.row] + (b.index - 1) * STEP_Y;
      const g = el('g', { class: 'kb-btn' + (b.aux ? ' aux' : ''), 'data-id': b.id, tabindex: 0, role: 'button' }, svg);
      const markPush = state.marks.get(`${b.id}:push`), markPull = state.marks.get(`${b.id}:pull`);
      const mode = state.mode;
      if (mode === 'both') {
        el('circle', { cx, cy, r: R, class: 'kb-circle' }, g);
        el('path', { d: `M${cx - R} ${cy} A${R} ${R} 0 0 1 ${cx + R} ${cy} Z`, class: 'half push' + (markPush ? ' marked' + (markPush.active ? ' active' : '') : '') }, g);
        el('path', { d: `M${cx - R} ${cy} A${R} ${R} 0 0 0 ${cx + R} ${cy} Z`, class: 'half pull' + (markPull ? ' marked' + (markPull.active ? ' active' : '') : '') }, g);
        const a = el('text', { x: cx, y: cy - 5, class: 'kb-lbl small', 'text-anchor': 'middle' }, g);
        a.textContent = markPush?.label ?? buttonLabel(b, 'push', t, state.lang);
        const c = el('text', { x: cx, y: cy + 14, class: 'kb-lbl small', 'text-anchor': 'middle' }, g);
        c.textContent = markPull?.label ?? buttonLabel(b, 'pull', t, state.lang);
      } else {
        const m = state.marks.get(`${b.id}:${mode}`);
        const other = state.marks.get(`${b.id}:${mode === 'push' ? 'pull' : 'push'}`);
        el('circle', { cx, cy, r: R, class: `kb-circle ${mode}` + (m ? ' marked' + (m.active ? ' active' : '') : '') + (other ? ' other-dir' : '') }, g);
        const tx = el('text', { x: cx, y: cy + 5, class: 'kb-lbl', 'text-anchor': 'middle' }, g);
        tx.textContent = m?.label ?? buttonLabel(b, mode, t, state.lang);
        if (m?.label) { // muestra también la nota en pequeño
          const sub = el('text', { x: cx, y: cy + 18, class: 'kb-sub', 'text-anchor': 'middle' }, g);
          sub.textContent = buttonLabel(b, mode, t, state.lang);
          tx.setAttribute('y', cy + 2);
        }
      }
      const press = (ev) => {
        let dir = state.mode;
        if (dir === 'both') dir = ev.offsetY !== undefined && svgPointY(ev) > cy ? 'pull' : 'push';
        state.onPress(b, dir);
      };
      g.addEventListener('pointerdown', press);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press({}); } });
    }
    if (state.showBass) renderBass(t);
  }

  function svgPointY(ev) {
    const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse()).y;
  }

  function renderBass(t) {
    el('rect', { x: 206, y: 90, width: 120, height: 360, rx: 40, class: 'kb-body bass' }, svg);
    const ttl = el('text', { x: 266, y: 80, class: 'kb-rowlabel', 'text-anchor': 'middle' }, svg);
    ttl.textContent = 'Bajos';
    for (const b of bassButtons(t)) {
      const cx = 240 + b.col * 52, cy = 125 + b.row * 56;
      const g = el('g', { class: 'kb-btn bass ' + b.kind }, svg);
      const dir = state.mode === 'pull' ? 'pull' : 'push';
      el('circle', { cx, cy, r: 20, class: `kb-circle ${dir}` }, g);
      const n = spellPc(b[dir], t.pref);
      const tx = el('text', { x: cx, y: cy + 2, class: 'kb-lbl small', 'text-anchor': 'middle' }, g);
      tx.textContent = state.lang === 'es' ? nameEs(n) : nameEn(n);
      const k = el('text', { x: cx, y: cy + 14, class: 'kb-sub', 'text-anchor': 'middle' }, g);
      k.textContent = b.kind === 'bajo' ? 'bajo' : 'acorde';
      g.addEventListener('pointerdown', () => state.onPress({ ...b, bass: true }, dir));
    }
  }

  render();
  return {
    setTuning(t) { state.tuning = t; render(); },
    setMode(m) { state.mode = m; render(); },
    setLang(l) { state.lang = l; render(); },
    get mode() { return state.mode; },
    /** marks: [{ btnId, dir, label, active }] */
    mark(list) {
      state.marks = new Map(list.map((m) => [`${m.btnId}:${m.dir}`, m]));
      render();
    },
    clear() { state.marks.clear(); render(); },
    flash(btnId, dir) {
      const g = svg.querySelector(`[data-id="${btnId}"]`);
      if (!g) return;
      g.classList.add('flash', dir);
      setTimeout(() => g.classList.remove('flash', dir), 250);
    },
  };
}

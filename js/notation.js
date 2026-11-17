// Partitura + tablatura de acordeón en SVG (sin librerías).
// Por sistema: pentagrama (clave de sol), 3 líneas de tablatura (afuera/medio/adentro)
// con el número de botón, carril de fuelle y carril de bajos.
import * as T from './theory.js';
import { getTuning, bassNumber } from './instrument.js';
import { METERS, ticksPerMeasure } from './rhythm.js';
import { layoutVoice, estimateKey } from './song.js';

const NS = 'http://www.w3.org/2000/svg';
const G = 8; // espacio entre líneas del pentagrama
const LAY = { staffTop: 34, tabTop: 104, tabGap: 15, bellows: 152, bass: 174, height: 192 };
const ROW_Y = { afuera: 0, medio: 1, adentro: 2 };
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6], FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];
const SHARP_POS = [38, 35, 39, 36, 33, 37, 34], FLAT_POS = [34, 37, 33, 36, 32, 35, 31];

function el(tag, attrs, parent, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

const stepOf = (n, midi) => {
  const base = [0, 2, 4, 5, 7, 9, 11][n.letter] + n.acc;
  return n.letter + 7 * (Math.floor((midi - base) / 12) - 1); // Do4 = 28, Mi4 = 30 (línea inferior)
};

export function renderScore(container, song, { onSelect, showStaff = true, lang = 'es' } = {}) {
  const tuning = getTuning(song.tuningId);
  const key = estimateKey(song.notes);
  const tpm = ticksPerMeasure(song.meter), tpb = METERS[song.meter].ticksPerBeat;
  const ppt = song.meter === '6/8' ? 24 : 15; // píxeles por tick
  const mW = tpm * ppt + 18;
  const W = Math.max(320, container.clientWidth || 800);
  const keyW = Math.abs(key.fifths) * 8;
  const headW = (first) => 40 + keyW + (first ? 22 : 0);
  // Sistemas
  const systems = [];
  let m = 0;
  while (m < song.measures) {
    const sys = { first: m, x0: headW(systems.length === 0), measures: [] };
    let x = sys.x0;
    while (m < song.measures && (sys.measures.length === 0 || x + mW <= W - 4)) { sys.measures.push({ m, x }); x += mW; m++; }
    sys.x1 = x;
    systems.push(sys);
  }
  const H = systems.length * LAY.height + 10;
  container.innerHTML = '';
  const svg = el('svg', { class: 'score', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `Partitura y tablatura: ${song.title}` }, container);
  const mel = layoutVoice(song.notes, song.measures, song.meter);
  const measureSys = {};
  systems.forEach((s, si) => s.measures.forEach((mm) => { measureSys[mm.m] = { si, x: mm.x }; }));
  const xOf = (tick) => {
    const mi = Math.min(song.measures - 1, Math.floor(tick / tpm));
    const ms = measureSys[mi];
    return { x: ms.x + 12 + (tick - mi * tpm) * ppt, si: ms.si };
  };
  const noteEls = new Map();

  systems.forEach((sys, si) => {
    const g = el('g', { transform: `translate(0 ${si * LAY.height})` }, svg);
    const top = LAY.staffTop, bottom = top + 4 * G;
    const yOfStep = (s) => bottom - (s - 30) * (G / 2);
    if (showStaff) {
      for (let i = 0; i < 5; i++) el('line', { x1: 4, x2: sys.x1, y1: top + i * G, y2: top + i * G, class: 'st-line' }, g);
      el('text', { x: 4, y: bottom + 7, class: 'clef' }, g, '𝄞');
      const order = key.fifths > 0 ? SHARP_POS : FLAT_POS;
      for (let i = 0; i < Math.abs(key.fifths); i++) el('text', { x: 34 + i * 8, y: yOfStep(order[i]) + 4, class: 'acc' }, g, key.fifths > 0 ? '♯' : '♭');
      if (si === 0) {
        const [num, den] = song.meter === '6/8' ? [6, 8] : [METERS[song.meter].beats, METERS[song.meter].beatType];
        el('text', { x: 38 + keyW, y: top + 15, class: 'timesig' }, g, num);
        el('text', { x: 38 + keyW, y: top + 31, class: 'timesig' }, g, den);
      }
    }
    // Tablatura
    const tabY = (row) => LAY.tabTop + ROW_Y[row] * LAY.tabGap;
    ['afuera', 'medio', 'adentro'].forEach((r) => {
      el('line', { x1: 24, x2: sys.x1, y1: tabY(r), y2: tabY(r), class: 'tab-line' }, g);
      el('text', { x: 4, y: tabY(r) + 4, class: 'tab-lbl' }, g, r === 'afuera' ? 'af' : r === 'medio' ? 'me' : 'ad');
    });
    el('text', { x: 4, y: LAY.bellows + 6, class: 'tab-lbl' }, g, 'fu');
    el('text', { x: 4, y: LAY.bass + 4, class: 'tab-lbl' }, g, 'bj');
    // Compases
    sys.measures.forEach(({ m: mi, x }) => {
      el('line', { x1: x + mW, x2: x + mW, y1: showStaff ? top : LAY.tabTop, y2: LAY.tabTop + 2 * LAY.tabGap, class: mi === song.measures - 1 ? 'bar end' : 'bar' }, g);
      el('text', { x: x + 2, y: top - 12, class: 'mnum' }, g, mi + 1);
      for (let b = 0; b < tpm; b += tpb) el('line', { x1: x + 12 + b * ppt - 3, x2: x + 12 + b * ppt - 3, y1: LAY.tabTop - 6, y2: LAY.bass + 6, class: 'beat' }, g);
    });
    if (si === 0) el('line', { x1: 4, x2: 4, y1: showStaff ? top : LAY.tabTop, y2: LAY.tabTop + 2 * LAY.tabGap, class: 'bar' }, g);
  });

  // Pentagrama: notas y silencios
  if (showStaff) {
    let pendingTie = null;
    mel.forEach((segs, mi) => {
      const { si } = measureSys[mi];
      const g = svg.children[si];
      const bottom = LAY.staffTop + 4 * G;
      const yOfStep = (s) => bottom - (s - 30) * (G / 2);
      const keyAcc = {};
      (key.fifths > 0 ? SHARP_ORDER : FLAT_ORDER).slice(0, Math.abs(key.fifths)).forEach((l) => { keyAcc[l] = key.fifths > 0 ? 1 : -1; });
      const state = {};
      for (const seg of segs) {
        const { x } = xOf(seg.tick);
        if (seg.kind === 'rest') { drawRest(g, x, seg, LAY.staffTop); continue; }
        const n = seg.ref, sp = T.spellPc(T.midiToPc(n.midi), key.pref), s = stepOf(sp, n.midi);
        const y = yOfStep(s);
        const idx = song.notes.indexOf(n);
        const ng = el('g', { class: 'nt', 'data-i': idx }, g);
        // líneas adicionales
        for (let ls = 28; ls >= s; ls -= 2) el('line', { x1: x - 8, x2: x + 8, y1: yOfStep(ls), y2: yOfStep(ls), class: 'st-line' }, ng);
        for (let ls = 40; ls <= s; ls += 2) el('line', { x1: x - 8, x2: x + 8, y1: yOfStep(ls), y2: yOfStep(ls), class: 'st-line' }, ng);
        // alteración
        const k = `${sp.letter}:${s}`;
        const cur = state[k] ?? keyAcc[sp.letter] ?? 0;
        if (cur !== sp.acc && !seg.tieStop) el('text', { x: x - 15, y: y + 4, class: 'acc' }, ng, sp.acc === 1 ? '♯' : sp.acc === -1 ? '♭' : sp.acc === 0 ? '♮' : sp.acc > 0 ? '𝄪' : '𝄫');
        state[k] = sp.acc;
        const hollow = seg.type === 'half' || seg.type === 'whole';
        el('ellipse', { cx: x, cy: y, rx: 5.2, ry: 3.8, transform: `rotate(-20 ${x} ${y})`, class: hollow ? 'head hollow' : 'head' }, ng);
        if (seg.type !== 'whole') {
          const up = s < 34;
          const sx = up ? x + 4.6 : x - 4.6, sy2 = up ? y - 27 : y + 27;
          el('line', { x1: sx, x2: sx, y1: y, y2: sy2, class: 'stem' }, ng);
          const flags = seg.type === 'eighth' ? 1 : seg.type === '16th' ? 2 : 0;
          for (let f = 0; f < flags; f++) {
            const fy = sy2 + (up ? f * 6 : -f * 6);
            el('path', { d: up ? `M${sx} ${fy} q 2 6 8 9 q -3 -2 -8 -4` : `M${sx} ${fy} q 2 -6 8 -9 q -3 2 -8 4`, class: 'flag' }, ng);
          }
        }
        if (seg.dot) el('circle', { cx: x + 9, cy: y - (s % 2 === 0 ? 2 : 0), r: 1.6, class: 'head' }, ng);
        if (seg.tieStop && pendingTie && pendingTie.si === si) {
          el('path', { d: `M${pendingTie.x + 5} ${pendingTie.y + 5} Q ${(pendingTie.x + x) / 2} ${y + 13} ${x - 5} ${y + 5}`, class: 'tie' }, g);
        }
        pendingTie = seg.tieStart ? { x, y, si } : null;
        if (seg.first) noteEls.set(idx, [ng]);
      }
    });
  }

  // Tablatura, fuelle y bajos
  song.notes.forEach((n, i) => {
    const { x, si } = xOf(n.tick);
    const g = svg.children[si];
    const tg = el('g', { class: 'tabnote ' + (n.pos ? n.pos.dir : 'none'), 'data-i': i }, g);
    if (n.pos) {
      const y = LAY.tabTop + ROW_Y[n.pos.btn.row] * LAY.tabGap;
      el('rect', { x: x - 8, y: y - 7, width: 16, height: 14, rx: 3, class: 'tbox' }, tg);
      el('text', { x, y: y + 4, class: 'tnum' }, tg, n.pos.btn.index);
      // fuelle
      const end = xOf(Math.min(n.tick + n.dur, song.measures * tpm) - 0.001);
      const x2 = end.si === si ? end.x + ppt * 0.6 : svg.viewBox.baseVal.width - 4;
      el('rect', { x: x - 6, y: LAY.bellows, width: Math.max(4, x2 - x), height: 6, rx: 2, class: 'fuelle ' + n.pos.dir }, g);
      const prev = song.notes[i - 1];
      if (!prev || !prev.pos || prev.pos.dir !== n.pos.dir) el('text', { x: x - 6, y: LAY.bellows - 3, class: 'flbl ' + n.pos.dir }, g, n.pos.dir === 'push' ? 'C' : 'A');
    } else {
      el('text', { x, y: LAY.tabTop + LAY.tabGap + 4, class: 'tnum missing' }, tg, '?');
    }
    noteEls.set(i, [...(noteEls.get(i) || []), tg]);
  });
  song.bass.forEach((b) => {
    const { x, si } = xOf(b.tick);
    const g = svg.children[si];
    const name = T.nameEs(T.spellPc(b.pc, key.pref));
    const label = b.kind === 'bajo' ? name : name.toLowerCase() + (b.quality === 'menor' ? 'm' : '');
    el('text', { x, y: LAY.bass + 4, class: `bj ${b.kind} ${b.pos ? b.pos.dir : ''}` }, g, label);
    if (b.pos) el('text', { x, y: LAY.bass + 14, class: 'bjnum' }, g, bassNumber(b.pos.btn));
  });

  // Cursor
  const cursor = el('line', { class: 'cursor', x1: -10, x2: -10, y1: 0, y2: LAY.height - 8 }, svg);
  svg.addEventListener('click', (e) => {
    const t = e.target.closest('[data-i]');
    if (t && onSelect) onSelect(+t.dataset.i);
  });

  let lastSi = -1, selected = -1;
  return {
    svg,
    setCursor(tick, { scroll = true } = {}) {
      if (tick == null || tick < 0) { cursor.setAttribute('x1', -10); cursor.setAttribute('x2', -10); return; }
      const { x, si } = xOf(Math.min(tick, song.measures * tpm - 0.01));
      cursor.setAttribute('x1', x - 6); cursor.setAttribute('x2', x - 6);
      cursor.setAttribute('transform', `translate(0 ${si * LAY.height + 10})`);
      if (scroll && si !== lastSi) {
        lastSi = si;
        const r = svg.getBoundingClientRect(), y = r.top + window.scrollY + si * LAY.height * (r.height / H);
        const view = container.closest('.score-scroll');
        if (view) view.scrollTo({ top: si * LAY.height * (r.height / H) - 10, behavior: 'smooth' });
        else if (y < window.scrollY + 80 || y > window.scrollY + window.innerHeight - 200) window.scrollTo({ top: y - 120, behavior: 'smooth' });
      }
    },
    select(i) {
      (noteEls.get(selected) || []).forEach((e) => e.classList.remove('sel'));
      selected = i;
      (noteEls.get(i) || []).forEach((e) => e.classList.add('sel'));
    },
    mark(i, cls) { (noteEls.get(i) || []).forEach((e) => e.classList.add(cls)); },
    clearMarks(cls) { svg.querySelectorAll('.' + cls).forEach((e) => e.classList.remove(cls)); },
    tickToSystem: (tick) => xOf(tick).si,
  };
}

function drawRest(g, x, seg, top) {
  const mid = top + 2 * G;
  if (seg.whole || seg.type === 'whole') { el('rect', { x: x - 5, y: top + G, width: 11, height: 4, class: 'rest' }, g); return; }
  if (seg.type === 'half') { el('rect', { x: x - 5, y: mid - 4, width: 11, height: 4, class: 'rest' }, g); }
  else if (seg.type === 'quarter') el('path', { d: `M${x - 2} ${mid - 11} l 5 6 l -4 4 l 5 6 q -6 -2 -4 5`, class: 'rest-q' }, g);
  else {
    const flags = seg.type === 'eighth' ? 1 : 2;
    el('line', { x1: x + 3, y1: mid - 6, x2: x - 1, y2: mid + 8 + (flags - 1) * 6, class: 'stem' }, g);
    for (let f = 0; f < flags; f++) el('circle', { cx: x - 2, cy: mid - 5 + f * 6, r: 2.2, class: 'head' }, g);
  }
  if (seg.dot) el('circle', { cx: x + 8, cy: mid - 2, r: 1.5, class: 'head' }, g);
}

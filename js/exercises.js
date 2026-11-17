// Generadores de ejercicios: devuelven { title, names[], midis[], positions[], note }
import * as T from './theory.js';
import { planAscending, fingerSequence, rowKeys, ROWS } from './instrument.js';

const rowName = (id) => ROWS.find((r) => r.id === id)?.label.toLowerCase() ?? '';

/** Tónica deletreada de una hilera. */
export function rowTonic(tuning, rowId) {
  const pc = rowKeys(tuning)[ROWS.findIndex((r) => r.id === rowId)];
  return T.spellPc(pc, tuning.pref);
}

function fromPlan(title, spelled, plan, note = '') {
  return {
    title,
    names: spelled.map(T.nameEs),
    namesEn: spelled.map(T.nameEn),
    midis: plan.midis,
    positions: plan.positions,
    missing: plan.missing,
    note,
  };
}

export function scaleExercise(tuning, tonic, type = 'mayor', { onlyRow = null, descend = false } = {}) {
  let spelled = type === 'cromatica' ? T.chromaticScale(tonic, tuning.pref === 'flat' ? 'sharp' : 'sharp') : T.diatonicScale(tonic, type);
  const plan = planAscending(tuning, spelled.map(T.pcOf), { onlyRow });
  const label = type === 'cromatica' ? 'Escala cromática' : T.SCALES[type].label;
  const ex = fromPlan(`${label} de ${T.nameEs(tonic)}${onlyRow ? ' — ' + rowName(onlyRow) : ''}`, spelled, plan,
    type === 'cromatica' ? '' : `Fórmula: ${T.SCALES[type].formula}`);
  if (descend) return withDescent(tuning, ex, onlyRow);
  return ex;
}

function withDescent(tuning, ex, onlyRow) {
  const midis = [...ex.midis, ...ex.midis.slice(0, -1).reverse()];
  const names = [...ex.names, ...ex.names.slice(0, -1).reverse()];
  const namesEn = [...ex.namesEn, ...ex.namesEn.slice(0, -1).reverse()];
  const r = fingerSequence(tuning, midis, { onlyRow });
  return { ...ex, midis, names, namesEn, positions: r.positions, title: ex.title + ' (sube y baja)' };
}

export function chordExercise(tuning, root, quality = 'mayor', { onlyRow = null } = {}) {
  const spelled = [...T.triad(root, quality), root];
  const plan = planAscending(tuning, spelled.map(T.pcOf), { onlyRow });
  return fromPlan(`Acorde ${T.CHORDS[quality].label.toLowerCase()} de ${T.nameEs(root)} (arpegio)`, spelled, plan,
    `Fórmula: ${quality === 'mayor' ? '3ª mayor + 3ª menor' : quality === 'menor' ? '3ª menor + 3ª mayor' : quality === 'disminuido' ? '3ª menor + 3ª menor' : '3ª mayor + 3ª mayor'}`);
}

/** Intervalos por grados dentro de la escala de una hilera (terceras, sextas, octavas, décimas). */
export function intervalExercise(tuning, rowId, interval = 3) {
  const tonic = rowTonic(tuning, rowId);
  const two = [...T.diatonicScale(tonic, 'mayor')];
  // Escala de dos octavas y media (por letras), suficiente para décimas
  let semis = 12;
  const steps = T.SCALES.mayor.steps;
  for (let i = 0; two.length < 8 + interval + 1; i++) {
    semis += steps[i % 7];
    two.push(T.transpose(tonic, 8 + i, semis));
  }
  const pcsAll = two.map(T.pcOf);
  const plan = planAscending(tuning, pcsAll, { onlyRow: rowId });
  const names = [], namesEn = [], midis = [];
  for (let d = 0; d < 8; d++) {
    const k = interval - 1;
    if (!plan.midis[d + k]) break;
    names.push(T.nameEs(two[d]), T.nameEs(two[d + k]));
    namesEn.push(T.nameEn(two[d]), T.nameEn(two[d + k]));
    midis.push(plan.midis[d], plan.midis[d + k]);
  }
  const r = fingerSequence(tuning, midis, { onlyRow: rowId });
  const label = { 3: 'Terceras', 6: 'Sextas', 8: 'Octavas', 10: 'Décimas' }[interval] || `Intervalos de ${interval}`;
  return {
    title: `${label} en la ${rowName(rowId)} (${T.nameEs(tonic)} mayor)`,
    names, namesEn, midis, positions: r.positions, missing: r.missing,
    note: 'Cada par: grado de la escala + el grado que está a esa distancia.',
  };
}

/** Marcas para el teclado a partir de un ejercicio. activeIndex resalta un paso. */
export function marksFor(ex, activeIndex = -1) {
  const marks = new Map();
  ex.positions.forEach((p, i) => {
    if (!p) return;
    const key = `${p.btn.id}:${p.dir}`;
    const prev = marks.get(key);
    const label = prev ? prev.label + ',' + (i + 1) : String(i + 1);
    marks.set(key, { btnId: p.btn.id, dir: p.dir, label: label.length > 5 ? label.split(',')[0] + '…' : label, active: i === activeIndex || prev?.active });
  });
  return [...marks.values()];
}

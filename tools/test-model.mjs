// Pruebas del modelo musical. Uso: node tools/test-model.mjs
import assert from 'node:assert/strict';
import * as T from '../js/theory.js';
import * as I from '../js/instrument.js';

const t = I.getTuning('cinco-letras');
const sharp = { ...t, pref: 'sharp' };
const row = (r, dir) => I.buttons(t).filter((b) => b.row === r).map((b) => I.buttonLabel(b, dir, sharp)).join(' ');

// Mapa de referencia (Cinco Letras, Corona III)
assert.equal(row('afuera', 'push'), 'Mi La♯ Re Fa La♯ Re Fa La♯ Re Fa');
assert.equal(row('afuera', 'pull'), 'Fa♯ Do Re♯ Sol La Do Re♯ Sol La Do');
assert.equal(row('medio', 'push'), 'La La♯ Re♯ Sol La♯ Re♯ Sol La♯ Re♯ Sol La♯');
assert.equal(row('medio', 'pull'), 'Si Re Fa Sol♯ Do Re Fa Sol♯ Do Re Fa');
assert.equal(row('adentro', 'push'), 'Fa♯ Re♯ Sol♯ Do Re♯ Sol♯ Do Re♯ Sol♯ Do');
assert.equal(row('adentro', 'pull'), 'Mi Sol La♯ Do♯ Fa Sol La♯ Do♯ Fa Sol');
assert.equal(I.buttons(t).length, 31);
assert.equal(I.bassButtons(t).length, 12);

// Afinaciones por transposición
const keys = (id) => { const u = I.getTuning(id); return I.rowKeys(u).map((pc) => T.nameEn(T.spellPc(pc, u.pref))).join('-'); };
assert.equal(keys('gcf'), 'G-C-F');
assert.equal(keys('adg'), 'A-D-G');
assert.equal(keys('lluvia'), 'C♯-F♯-B');
assert.equal(keys('cuatro-letras'), 'F-B♭-E♭');

// Teoría: deletreo correcto
assert.equal(T.diatonicScale(T.parseNote('F#')).map(T.nameEs).join(' '), 'Fa♯ Sol♯ La♯ Si Do♯ Re♯ Mi♯ Fa♯');
assert.equal(T.diatonicScale(T.parseNote('A'), 'menor').map(T.nameEs).join(' '), 'La Si Do Re Mi Fa Sol La');
assert.equal(T.triad(T.parseNote('B'), 'disminuido').map(T.nameEs).join(' '), 'Si Re Fa');

// Do mayor en Cinco Letras: como en el método de referencia, Si sale del botón auxiliar del medio, abriendo
const c = I.planAscending(t, T.diatonicScale(T.parseNote('C')).map(T.pcOf));
assert.equal(c.missing, 0);
assert.equal(c.positions[6].btn.id, 'medio-1');
assert.equal(c.positions[6].dir, 'pull');

// Las 12 escalas mayores y menores son tocables en todas las afinaciones
for (const tun of I.TUNINGS) {
  for (const ton of T.TONICS) assert.equal(I.planAscending(tun, T.diatonicScale(ton).map(T.pcOf)).missing, 0, `${tun.id} ${T.nameEn(ton)} mayor`);
  for (const ton of T.MINOR_TONICS) assert.equal(I.planAscending(tun, T.diatonicScale(ton, 'menor').map(T.pcOf)).missing, 0, `${tun.id} ${T.nameEn(ton)} menor`);
}
console.log('OK: todas las pruebas pasaron');

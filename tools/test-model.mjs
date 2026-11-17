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

// ---------- Ritmo, canción y exportadores ----------
const R = await import('../js/rhythm.js');
const S = await import('../js/song.js');
{
  // Tempo con ataques regulares (bajo en el pulso, acorde a contratiempo)
  for (const bpm of [92, 110, 128, 150]) {
    const per = 60 / bpm, on = [];
    for (let k = 0; k < 32; k++) { on.push({ t: 0.4 + k * per, w: 2 }); on.push({ t: 0.4 + k * per + per / 2, w: 1.2 }); }
    const r = R.estimateTempo(on);
    assert.ok(Math.abs(r.bpm - bpm) / bpm < 0.03, `tempo ${bpm} → ${r.bpm}`);
  }
  const demoBajos = S.demoSong('cinco-letras');
  assert.equal(demoBajos.measures, 8);
  assert.equal(demoBajos.notes.length, 0, 'el ejemplo es solo marcación de bajos');
  assert.ok(demoBajos.bass.every((b) => b.pos), 'cada bajo del ejemplo tiene botón');
  // Canción de prueba con melodía (escala de Si♭ con bajos), como si viniera de un análisis
  const spt = 60 / 100 / 4;
  const melody = [58, 60, 62, 63, 65, 67, 69, 70].map((m, i) => ({ midi: m, start: i * 4 * spt, end: (i + 1) * 4 * spt }));
  const bassEv = [];
  for (let k = 0; k < 8; k++) bassEv.push({ kind: k % 2 ? 'acorde' : 'bajo', pc: 10, quality: k % 2 ? 'mayor' : null, start: k * 4 * spt, end: (k + 1) * 4 * spt });
  const demo = S.songFromAnalysis({ title: 'prueba', tuningId: 'cinco-letras', melody, bass: bassEv });
  assert.ok(demo.notes.every((n) => n.pos), 'todas las notas tienen botón');
  // El fuelle de la melodía coincide con el de los bajos que suenan a la vez (fuelle único)
  for (const b of demo.bass) {
    const n = demo.notes.find((x) => x.tick <= b.tick && b.tick < x.tick + x.dur);
    if (n && b.pos) {
      const both = I.bassPositions(I.getTuning('cinco-letras'), b.kind, b.pc).map((p) => p.dir);
      if (both.includes(n.dir)) assert.equal(b.dir, n.dir, 'bajo y melodía con el mismo fuelle');
    }
  }
  // MusicXML: cada compás suma lo que debe en ambos pentagramas
  for (const meter of ['2/4', '4/4', '6/8']) {
    const s = structuredClone(S.serialize(demo)); S.hydrate(s); s.meter = meter; S.requantize(s);
    const xml = S.toMusicXML(s);
    const full = R.ticksPerMeasure(meter);
    for (const m of xml.split('<measure ').slice(1)) {
      const staffSum = { 1: 0, 2: 0 };
      for (const n of m.split('<note>').slice(1)) {
        if (n.startsWith('<chord/>')) continue;
        staffSum[+n.match(/<staff>(\d)<\/staff>/)[1]] += +n.match(/<duration>(\d+)<\/duration>/)[1];
      }
      assert.deepEqual(staffSum, { 1: full, 2: full }, `compás ${meter}`);
    }
    const mid = S.toMIDI(s);
    assert.equal(String.fromCharCode(...mid.slice(0, 4)), 'MThd');
  }
  // Octava en MusicXML: Si♭3 = B, alter -1, octava 3
  assert.ok(S.toMusicXML(demo).includes('<step>B</step><alter>-1</alter><octave>3</octave>'));
}
console.log('OK: ritmo, canción y exportadores');

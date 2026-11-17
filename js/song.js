// Modelo de canción (melodía + mano izquierda, en tiempo y en rejilla) y exportadores.
// Sin DOM: se puede probar en Node.
import * as T from './theory.js';
import { getTuning, buttons, bassButtons, bassNumber, bassPositions, fingerSequence, assignBass, bellowsHintsFromBass, ROWS } from './instrument.js';
import { METERS, ticksPerMeasure, quantize, estimateTempo, tickToSec } from './rhythm.js';

export const ROW_CODE = { afuera: 'af', medio: 'me', adentro: 'ad' };
export const DIR_CODE = { push: 'C', pull: 'A' };
export const tabCode = (pos) => (pos ? `${ROW_CODE[pos.btn.row]}${pos.btn.index}` : '?');

const byId = (tuning) => Object.fromEntries(buttons(tuning).map((b) => [b.id, b]));
const bassById = (tuning) => Object.fromEntries(bassButtons(tuning).map((b) => [b.id, b]));

/** Reconstruye objetos de posición { btn, dir } a partir de ids guardados. */
export function hydrate(song) {
  const tuning = getTuning(song.tuningId);
  const ids = byId(tuning), bids = bassById(tuning);
  song.notes.forEach((n) => { n.pos = n.btnId ? { btn: ids[n.btnId], dir: n.dir } : null; });
  song.bass.forEach((b) => { b.pos = b.btnId ? { btn: bids[b.btnId], dir: b.dir } : null; });
  return song;
}

/** Versión serializable (sin referencias a objetos de botón). */
export function serialize(song) {
  const strip = ({ pos, ...rest }) => rest;
  return JSON.parse(JSON.stringify({ ...song, notes: song.notes.map(strip), bass: song.bass.map(strip) }));
}

/**
 * Construye una canción a partir del análisis.
 * melody: [{ midi (ya en el teclado), start, end }]; bass: [{ start, end, kind, pc, quality }]
 */
export function songFromAnalysis({ title, tuningId, melody, bass, meter = '2/4', duration = 0 }) {
  const tuning = getTuning(tuningId);
  const hints = bellowsHintsFromBass(tuning, melody, bass);
  const fing = fingerSequence(tuning, melody.map((n) => n.midi), { dirHints: hints });
  const mel = melody.map((n, i) => ({ ...n, pos: fing.positions[i] }));
  const bas = assignBass(tuning, bass, mel);
  const onsets = [
    ...mel.map((n) => ({ t: n.start, w: 1 })),
    ...bas.map((b) => ({ t: b.start, w: b.kind === 'bajo' ? 2 : 1.2 })),
  ];
  const { bpm, offset } = estimateTempo(onsets);
  const song = {
    v: 1,
    id: 'c' + Date.now().toString(36),
    title: title || 'Canción sin título',
    tuningId, meter, bpm, offset, duration,
    created: new Date().toISOString(),
    notes: mel.map((n) => ({ t0: n.start, t1: n.end, midi: n.midi, btnId: n.pos?.btn.id ?? null, dir: n.pos?.dir ?? null, pos: n.pos })),
    bass: bas.map((b) => ({ t0: b.start, t1: b.end, kind: b.kind, pc: b.pc, quality: b.quality, btnId: b.pos?.btn.id ?? null, dir: b.pos?.dir ?? null, pos: b.pos })),
  };
  return requantize(song);
}

/** Recalcula ticks con el bpm/offset/compás actuales (al cambiar el tempo, por ejemplo). */
export function requantize(song) {
  const grid = { bpm: song.bpm, offset: song.offset, meter: song.meter };
  song.notes = quantize(song.notes, grid);
  // La mano izquierda suena corta: máx. un pulso
  const tpb = METERS[song.meter].ticksPerBeat;
  song.bass = quantize(song.bass, grid).map((b) => ({ ...b, dur: Math.min(b.dur, tpb) }));
  const last = Math.max(0, ...song.notes.map((n) => n.tick + n.dur), ...song.bass.map((b) => b.tick + b.dur));
  const tpm = ticksPerMeasure(song.meter);
  song.measures = Math.max(1, Math.ceil(last / tpm));
  return song;
}

/** Reasigna botones de toda la melodía (tras editar notas). */
export function refinger(song) {
  const tuning = getTuning(song.tuningId);
  const mel = song.notes.map((n) => ({ ...n, start: n.t0, end: n.t1 }));
  const hints = bellowsHintsFromBass(tuning, mel, song.bass.map((b) => ({ ...b, start: b.t0, end: b.t1 })));
  const r = fingerSequence(tuning, song.notes.map((n) => n.midi), { dirHints: hints });
  song.notes.forEach((n, i) => { n.pos = r.positions[i]; n.btnId = n.pos?.btn.id ?? null; n.dir = n.pos?.dir ?? null; });
  return song;
}

// ---------- Tonalidad ----------
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const FIFTHS = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: -6, 1: -5, 8: -4, 3: -3, 10: -2, 5: -1 };

/** Tonalidad de una canción: por la melodía o, si no tiene, por los bajos. */
export function songKey(song) {
  if (song.notes.length) return estimateKey(song.notes);
  return estimateKey(song.bass.map((b) => ({ midi: 48 + b.pc, dur: b.kind === 'bajo' ? 2 : 1 })));
}

/** Tonalidad mayor más probable (perfil de Krumhansl–Kessler). */
export function estimateKey(notes) {
  const h = new Array(12).fill(0);
  notes.forEach((n) => { h[T.midiToPc(n.midi)] += n.dur ?? 1; });
  let best = { r: -Infinity, tonic: 0 };
  for (let k = 0; k < 12; k++) {
    const prof = KK_MAJOR.map((_, i) => KK_MAJOR[(i - k + 12) % 12]);
    const mh = h.reduce((a, b) => a + b, 0) / 12, mp = prof.reduce((a, b) => a + b, 0) / 12;
    let num = 0, dh = 0, dp = 0;
    for (let i = 0; i < 12; i++) { num += (h[i] - mh) * (prof[i] - mp); dh += (h[i] - mh) ** 2; dp += (prof[i] - mp) ** 2; }
    const r = num / Math.sqrt(dh * dp || 1);
    if (r > best.r) best = { r, tonic: k };
  }
  const fifths = FIFTHS[best.tonic];
  return { tonic: best.tonic, fifths, pref: fifths < 0 ? 'flat' : 'sharp' };
}

// ---------- Duraciones ----------
function durationTable(meter) {
  // ticks → [tipo, puntillo]
  return meter === '6/8'
    ? { 1: ['eighth', 0], 2: ['quarter', 0], 3: ['quarter', 1], 4: ['half', 0], 6: ['half', 1] }
    : { 1: ['16th', 0], 2: ['eighth', 0], 3: ['eighth', 1], 4: ['quarter', 0], 6: ['quarter', 1], 8: ['half', 0], 12: ['half', 1], 16: ['whole', 0] };
}
/** Descompone una duración en figuras representables (de mayor a menor). */
export function splitDuration(d, meter) {
  const tbl = durationTable(meter);
  const sizes = Object.keys(tbl).map(Number).sort((a, b) => b - a);
  const out = [];
  while (d > 0) { const s = sizes.find((x) => x <= d); out.push({ ticks: s, type: tbl[s][0], dot: tbl[s][1] }); d -= s; }
  return out;
}

/**
 * Organiza una voz en compases: cada compás es una lista de segmentos
 * { kind: 'note'|'rest', ticks, type, dot, ref, tieStart, tieStop, first }.
 */
export function layoutVoice(events, measures, meter) {
  const tpm = ticksPerMeasure(meter);
  const res = Array.from({ length: measures }, () => []);
  const sorted = [...events].sort((a, b) => a.tick - b.tick);
  for (let m = 0; m < measures; m++) {
    let cur = m * tpm;
    const end = cur + tpm;
    const push = (kind, from, to, ref, isFirstPiece, continues) => {
      const pieces = splitDuration(to - from, meter);
      pieces.forEach((p, k) => res[m].push({
        kind, ticks: p.ticks, type: p.type, dot: p.dot, ref, tick: from + pieces.slice(0, k).reduce((a, x) => a + x.ticks, 0),
        first: kind === 'note' && isFirstPiece && k === 0,
        tieStop: kind === 'note' && !(isFirstPiece && k === 0),
        tieStart: kind === 'note' && (k < pieces.length - 1 || continues),
      }));
    };
    for (const e of sorted) {
      const s = e.tick, f = e.tick + e.dur;
      if (f <= m * tpm || s >= end) continue;
      const a = Math.max(s, cur), b = Math.min(f, end);
      if (a > cur) push('rest', cur, a, null, false, false);
      if (b > a) push('note', a, b, e, a === s, f > end);
      cur = Math.max(cur, b);
    }
    if (cur < end) {
      if (cur === m * tpm) res[m].push({ kind: 'rest', ticks: tpm, whole: true, type: 'whole', dot: 0, tick: cur });
      else push('rest', cur, end, null, false, false);
    }
  }
  return res;
}

function spell(midi, pref) {
  const n = T.spellPc(T.midiToPc(midi), pref);
  const base = [0, 2, 4, 5, 7, 9, 11][n.letter] + n.acc; // puede ser -1 (Do♭) o 12 (Si♯)
  return { step: T.LETTERS[n.letter], alter: n.acc, octave: Math.floor((midi - base) / 12) - 1 };
}

export function bassMidis(b) {
  if (b.kind === 'bajo') return [36 + b.pc];
  const r = 48 + b.pc;
  return [r, r + (b.quality === 'menor' ? 3 : 4), r + 7];
}

const xmlEsc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

/** MusicXML 4.0 (partitura + tablatura del acordeón como texto bajo las notas). */
export function toMusicXML(song) {
  const tuning = getTuning(song.tuningId);
  const meter = METERS[song.meter];
  const key = songKey(song);
  const tpm = ticksPerMeasure(song.meter);
  const mel = layoutVoice(song.notes, song.measures, song.meter);
  const bas = layoutVoice(song.bass, song.measures, song.meter);
  const beatUnit = song.meter === '6/8' ? ['quarter', true] : ['quarter', false];

  const noteXml = (seg, staff, voice, pitchMidis, lyrics) => {
    if (seg.kind === 'rest') {
      return `<note><rest${seg.whole ? ' measure="yes"' : ''}/><duration>${seg.ticks}</duration><voice>${voice}</voice>${seg.whole ? '' : `<type>${seg.type}</type>${seg.dot ? '<dot/>' : ''}`}<staff>${staff}</staff></note>`;
    }
    return pitchMidis.map((m, k) => {
      const p = spell(m, key.pref);
      const ties = `${seg.tieStop ? '<tie type="stop"/>' : ''}${seg.tieStart ? '<tie type="start"/>' : ''}`;
      const tied = `${seg.tieStop ? '<tied type="stop"/>' : ''}${seg.tieStart ? '<tied type="start"/>' : ''}`;
      const lyr = k === 0 && seg.first ? lyrics.map((t, i) => `<lyric number="${i + 1}"><syllabic>single</syllabic><text>${xmlEsc(t)}</text></lyric>`).join('') : '';
      return `<note>${k > 0 ? '<chord/>' : ''}<pitch><step>${p.step}</step>${p.alter ? `<alter>${p.alter}</alter>` : ''}<octave>${p.octave}</octave></pitch><duration>${seg.ticks}</duration>${ties}<voice>${voice}</voice><type>${seg.type}</type>${seg.dot ? '<dot/>' : ''}<staff>${staff}</staff>${tied ? `<notations>${tied}</notations>` : ''}${lyr}</note>`;
    }).join('');
  };

  let measures = '';
  for (let m = 0; m < song.measures; m++) {
    let x = `<measure number="${m + 1}">`;
    if (m === 0) {
      x += `<attributes><divisions>${meter.divisions}</divisions><key><fifths>${key.fifths}</fifths></key><time><beats>${song.meter === '6/8' ? 6 : meter.beats}</beats><beat-type>${meter.beatType}</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>`;
      x += `<direction placement="above"><direction-type><metronome><beat-unit>${beatUnit[0]}</beat-unit>${beatUnit[1] ? '<beat-unit-dot/>' : ''}<per-minute>${Math.round(song.bpm)}</per-minute></metronome></direction-type><staff>1</staff><sound tempo="${(song.meter === '6/8' ? song.bpm * 1.5 : song.bpm).toFixed(1)}"/></direction>`;
    }
    for (const seg of mel[m]) x += noteXml(seg, 1, 1, seg.ref ? [seg.ref.midi] : [], seg.ref ? [tabCode(seg.ref.pos), seg.ref.pos ? DIR_CODE[seg.ref.pos.dir] : ''] : []);
    x += `<backup><duration>${tpm}</duration></backup>`;
    for (const seg of bas[m]) {
      const b = seg.ref;
      x += noteXml(seg, 2, 5, b ? bassMidis(b) : [], b ? [`b${b.pos ? bassNumber(b.pos.btn) : '?'}`, b.pos ? DIR_CODE[b.pos.dir] : ''] : []);
    }
    if (m === song.measures - 1) x += '<barline location="right"><bar-style>light-heavy</bar-style></barline>';
    measures += x + '</measure>';
  }
  const legend = `Acordeón ${tuning.name} (${tuning.rows}). Tablatura: af/me/ad = hilera de afuera/medio/adentro + número de botón (1 = arriba); b = bajo; C = cerrando, A = abriendo.`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0"><work><work-title>${xmlEsc(song.title)}</work-title></work><identification><encoding><software>AcordTrainer (Walmer De la Rosa Guerrero)</software><encoding-date>${new Date().toISOString().slice(0, 10)}</encoding-date></encoding></identification><credit page="1"><credit-words default-y="80" font-size="8">${xmlEsc(legend)}</credit-words></credit><part-list><score-part id="P1"><part-name>Acordeón</part-name><score-instrument id="P1-I1"><instrument-name>Accordion</instrument-name></score-instrument><midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>22</midi-program></midi-instrument></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
}

// ---------- MIDI (formato 1) ----------
function vlq(n) { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; }
function track(events) {
  events.sort((a, b) => a.t - b.t || a.o - b.o);
  const bytes = []; let last = 0;
  for (const e of events) { bytes.push(...vlq(e.t - last), ...e.d); last = e.t; }
  bytes.push(0, 0xff, 0x2f, 0);
  return [0x4d, 0x54, 0x72, 0x6b, (bytes.length >>> 24) & 255, (bytes.length >>> 16) & 255, (bytes.length >>> 8) & 255, bytes.length & 255, ...bytes];
}
const text = (type, s) => { const b = [...new TextEncoder().encode(s)]; return [0xff, type, ...vlq(b.length), ...b]; };

export function toMIDI(song) {
  const PPQ = 480;
  const tickUnit = song.meter === '6/8' ? PPQ / 2 : PPQ / 4;
  const qpm = song.meter === '6/8' ? song.bpm * 1.5 : song.bpm;
  const us = Math.round(60000000 / qpm);
  const m = METERS[song.meter];
  const t0 = [
    { t: 0, o: 0, d: text(0x03, song.title) },
    { t: 0, o: 0, d: [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255] },
    { t: 0, o: 0, d: [0xff, 0x58, 4, song.meter === '6/8' ? 6 : m.beats, Math.log2(m.beatType), 24, 8] },
  ];
  const mel = [{ t: 0, o: 0, d: text(0x03, 'Melodía (mano derecha)') }, { t: 0, o: 0, d: [0xc0, 21] }];
  song.notes.forEach((n) => {
    const s = n.tick * tickUnit, e = (n.tick + n.dur) * tickUnit - 10;
    mel.push({ t: s, o: 1, d: text(0x05, `${tabCode(n.pos)}${n.pos ? DIR_CODE[n.pos.dir] : ''}`) });
    mel.push({ t: s, o: 2, d: [0x90, n.midi, 92] }, { t: e, o: 0, d: [0x80, n.midi, 0] });
  });
  const bas = [{ t: 0, o: 0, d: text(0x03, 'Bajos (mano izquierda)') }, { t: 0, o: 0, d: [0xc1, 21] }];
  song.bass.forEach((b) => {
    const s = b.tick * tickUnit, e = (b.tick + b.dur) * tickUnit - 10;
    bassMidis(b).forEach((mm) => bas.push({ t: s, o: 2, d: [0x91, mm, 70] }, { t: e, o: 0, d: [0x81, mm, 0] }));
  });
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 3, (PPQ >> 8) & 255, PPQ & 255];
  return new Uint8Array([...header, ...track(t0), ...track(mel), ...track(bas)]);
}

export function toCSV(song) {
  const tuning = getTuning(song.tuningId);
  const tpm = ticksPerMeasure(song.meter), tpb = METERS[song.meter].ticksPerBeat;
  const rows = [['mano', 'compas', 'pulso', 'tick', 'duracion_ticks', 'inicio_s', 'nota', 'cifrado', 'tipo', 'hilera_o_columna', 'boton', 'fuelle']];
  const pos = (tick) => [Math.floor(tick / tpm) + 1, (Math.floor((tick % tpm) / tpb) + 1) + ((tick % tpb) ? `+${tick % tpb}/${tpb}` : '')];
  song.notes.forEach((n) => {
    const sp = T.spellPc(T.midiToPc(n.midi), tuning.pref);
    rows.push(['derecha', ...pos(n.tick), n.tick, n.dur, tickToSec(n.tick, song).toFixed(3), T.nameEs(sp) + T.midiOctave(n.midi), T.nameEn(sp) + T.midiOctave(n.midi), 'nota', n.pos?.btn.row ?? '', n.pos?.btn.index ?? '', n.pos ? (n.pos.dir === 'push' ? 'cerrando' : 'abriendo') : '']);
  });
  song.bass.forEach((b) => {
    const sp = T.spellPc(b.pc, tuning.pref);
    rows.push(['izquierda', ...pos(b.tick), b.tick, b.dur, tickToSec(b.tick, song).toFixed(3), T.nameEs(sp), T.nameEn(sp) + (b.quality === 'menor' ? 'm' : ''), b.kind, b.pos ? (b.pos.btn.col === 0 ? 'afuera' : 'adentro') : '', b.pos ? bassNumber(b.pos.btn) : '', b.pos ? (b.pos.dir === 'push' ? 'cerrando' : 'abriendo') : '']);
  });
  rows.splice(1, 0, [`# ${song.title} | ${tuning.name} | ${song.meter} | ${Math.round(song.bpm)} pulsos/min`]);
  return rows.map((r) => r.join(',')).join('\n');
}

/**
 * Ejemplo para probar sin cargar video: marcación de la mano izquierda (bajo en el tiempo,
 * acorde en el contratiempo) sobre I–IV–V–I en la tonalidad de la hilera del medio.
 * No lleva melodía. Patrón básico de referencia, por validar con un acordeonero.
 */
export function demoSong(tuningId = 'cinco-letras') {
  const tun = getTuning(tuningId);
  const k = tun.offset;
  const bpm = 100, meter = '2/4', secPerTick = 60 / bpm / 4;
  // En Cinco Letras: medio = Mi♭ (I), adentro = La♭ (IV), afuera = Si♭ (V)
  const I = (3 + k + 12) % 12, IV = (8 + k + 12) % 12, V = (10 + k + 12) % 12;
  const prog = [I, I, IV, IV, V, V, I, I];
  const bass = [];
  prog.forEach((r, m) => {
    for (let b = 0; b < 2; b++) {
      const t = (m * 8 + b * 4) * secPerTick;
      bass.push({ kind: 'bajo', pc: r, quality: null, start: t, end: t + 2 * secPerTick });
      bass.push({ kind: 'acorde', pc: r, quality: 'mayor', start: t + 2 * secPerTick, end: t + 4 * secPerTick });
    }
  });
  // Botón de bajo: mantener el fuelle mientras se pueda (cambiarlo solo cuando el bajo lo exija)
  let dir = 'push';
  const bas = bass.map((e) => {
    const cands = bassPositions(tun, e.kind, e.pc);
    const pick = cands.find((c) => c.dir === dir) || cands[0] || null;
    if (pick) dir = pick.dir;
    return { ...e, pos: pick };
  });
  const song = {
    v: 1, id: 'demo-' + tuningId, title: 'Marcación de paseo (ejemplo, solo bajos)', tuningId, meter, bpm, offset: 0,
    duration: prog.length * 8 * secPerTick, demo: true, created: new Date().toISOString(),
    notes: [],
    bass: bas.map((b) => ({ t0: b.start, t1: b.end, kind: b.kind, pc: b.pc, quality: b.quality, btnId: b.pos?.btn.id ?? null, dir: b.pos?.dir ?? null, pos: b.pos })),
  };
  return requantize(song);
}

export { ROWS };

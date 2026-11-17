// Motor de teoría musical: nombres de notas, deletreo correcto de escalas y acordes.
// Puro (sin DOM) para poder probarlo en Node.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const SOLFEGE = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

const ACC_SYMBOL = { '-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪' };
const ACC_ASCII = { '-2': 'bb', '-1': 'b', '0': '', '1': '#', '2': '##' };

/** Nota deletreada: { letter: 0..6, acc: -2..2 } */
export const note = (letter, acc = 0) => ({ letter, acc });

export const pcOf = (n) => (((LETTER_PC[n.letter] + n.acc) % 12) + 12) % 12;

export function nameEs(n) {
  return SOLFEGE[n.letter] + ACC_SYMBOL[n.acc];
}
export function nameEn(n) {
  return LETTERS[n.letter] + ACC_SYMBOL[n.acc];
}
export function nameAscii(n) {
  return LETTERS[n.letter] + ACC_ASCII[n.acc];
}

/** Parsea "Bb", "C#", "Sib", "Do#", "Fa♯" */
export function parseNote(str) {
  const s = str.trim().replace('♯', '#').replace('♭', 'b');
  const es = SOLFEGE.findIndex((x) => s.toLowerCase().startsWith(x.toLowerCase()));
  let letter, rest;
  if (es >= 0) {
    letter = es;
    rest = s.slice(SOLFEGE[es].length);
  } else {
    letter = LETTERS.indexOf(s[0].toUpperCase());
    rest = s.slice(1);
    if (letter < 0) throw new Error('Nota no reconocida: ' + str);
  }
  let acc = 0;
  for (const ch of rest) acc += ch === '#' ? 1 : ch === 'b' ? -1 : 0;
  return note(letter, acc);
}

// Deletreo por defecto de cada clase de altura (pc), con sostenidos o bemoles.
const SHARP_SPELL = [[0,0],[0,1],[1,0],[1,1],[2,0],[3,0],[3,1],[4,0],[4,1],[5,0],[5,1],[6,0]];
const FLAT_SPELL  = [[0,0],[1,-1],[1,0],[2,-1],[2,0],[3,0],[4,-1],[4,0],[5,-1],[5,0],[6,-1],[6,0]];

export function spellPc(pc, pref = 'flat') {
  const [l, a] = (pref === 'sharp' ? SHARP_SPELL : FLAT_SPELL)[((pc % 12) + 12) % 12];
  return note(l, a);
}

export const midiToPc = (m) => ((m % 12) + 12) % 12;
export const midiOctave = (m) => Math.floor(m / 12) - 1;
export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);

export function midiName(m, pref = 'flat', lang = 'es') {
  const n = spellPc(midiToPc(m), pref);
  return (lang === 'es' ? nameEs(n) : nameEn(n)) + midiOctave(m);
}

/** Transpone una nota deletreada por un intervalo dado en (pasos de letra, semitonos). */
export function transpose(n, letterSteps, semis) {
  const letter = (n.letter + letterSteps) % 7;
  const target = pcOf(n) + semis;
  let acc = ((target - LETTER_PC[letter]) % 12 + 12) % 12;
  if (acc > 6) acc -= 12;
  return note(letter, acc);
}

// Fórmulas de escalas: semitonos acumulados desde la tónica.
export const SCALES = {
  mayor: { label: 'Escala mayor', steps: [2, 2, 1, 2, 2, 2, 1], formula: 'T – T – S – T – T – T – S' },
  menor: { label: 'Escala menor natural', steps: [2, 1, 2, 2, 1, 2, 2], formula: 'T – S – T – T – S – T – T' },
};

/** Escala diatónica deletreada (8 notas, con la octava). */
export function diatonicScale(tonic, type = 'mayor') {
  const out = [tonic];
  let semis = 0;
  SCALES[type].steps.forEach((st, i) => {
    semis += st;
    out.push(transpose(tonic, i + 1, semis));
  });
  return out;
}

/** Escala cromática ascendente desde una tónica (13 notas). */
export function chromaticScale(tonic, pref = 'sharp') {
  const base = pcOf(tonic);
  const out = [tonic];
  for (let i = 1; i <= 12; i++) out.push(i === 12 ? tonic : spellPc(base + i, pref));
  return out;
}

export const CHORDS = {
  mayor: { label: 'Mayor', semis: [0, 4, 7], symbol: '' },
  menor: { label: 'Menor', semis: [0, 3, 7], symbol: 'm' },
  disminuido: { label: 'Disminuido', semis: [0, 3, 6], symbol: 'dim' },
  aumentado: { label: 'Aumentado', semis: [0, 4, 8], symbol: 'aug' },
};

export function triad(root, quality = 'mayor') {
  const s = CHORDS[quality].semis;
  return [root, transpose(root, 2, s[1]), transpose(root, 4, s[2])];
}

export const DEGREES = [
  { roman: 'I', name: 'Tónica' },
  { roman: 'II', name: 'Supertónica' },
  { roman: 'III', name: 'Mediante' },
  { roman: 'IV', name: 'Subdominante' },
  { roman: 'V', name: 'Dominante' },
  { roman: 'VI', name: 'Superdominante (submediante)' },
  { roman: 'VII', name: 'Sensible (en mayor) / subtónica (en menor)' },
];

export const INTERVALS = [
  { semis: 0, name: 'Unísono' },
  { semis: 1, name: 'Segunda menor (semitono)' },
  { semis: 2, name: 'Segunda mayor (tono)' },
  { semis: 3, name: 'Tercera menor' },
  { semis: 4, name: 'Tercera mayor' },
  { semis: 5, name: 'Cuarta justa' },
  { semis: 6, name: 'Tritono' },
  { semis: 7, name: 'Quinta justa' },
  { semis: 8, name: 'Sexta menor' },
  { semis: 9, name: 'Sexta mayor' },
  { semis: 10, name: 'Séptima menor' },
  { semis: 11, name: 'Séptima mayor' },
  { semis: 12, name: 'Octava' },
];

/** Las 12 tónicas habituales con su deletreo convencional. */
export const TONICS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].map(parseNote);
export const MINOR_TONICS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'].map(parseNote);

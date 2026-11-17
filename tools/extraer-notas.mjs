// Extrae notas sostenidas de una grabación (WAV mono 16 bits, 22050 Hz) para calibrar el sonido.
// Uso: ffmpeg -i grabacion.webm -ac 1 -ar 22050 g22.wav && node tools/extraer-notas.mjs g22.wav > notas.json
import fs from 'fs';
import { analyzeBuffer } from '../js/pitch/tracker.js';
const b = fs.readFileSync(process.argv[2]);
const off = b.indexOf('data') + 8, N = (b.length - off) >> 1;
const x = new Float32Array(N);
for (let i = 0; i < N; i++) x[i] = b.readInt16LE(off + 2 * i) / 32768;
let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
for (let i = 0; i < N; i++) x[i] /= pk || 1;
const { notes } = await analyzeBuffer(x, 22050, { frameSize: 2048, hop: 256, algorithm: 'salience', detector: { minRms: 0.02 } });
process.stdout.write(JSON.stringify(notes));

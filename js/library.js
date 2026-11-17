// Mis canciones: guardado local (localStorage) de canciones analizadas o editadas.
import { serialize, hydrate, demoSong } from './song.js';

const KEY = 'acordeon:songs';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const write = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; } };

export function listSongs() {
  return read().sort((a, b) => (b.updated || b.created).localeCompare(a.updated || a.created));
}
export function getSong(id, tuningId) {
  if (id && id.startsWith('demo')) return demoSong(tuningId || id.slice(5) || 'cinco-letras');
  const s = read().find((x) => x.id === id);
  return s ? hydrate(structuredClone(s)) : null;
}
export function saveSong(song) {
  const list = read().filter((x) => x.id !== song.id);
  const data = serialize({ ...song, updated: new Date().toISOString() });
  delete data.demo;
  if (song.demo) data.id = 'c' + Date.now().toString(36);
  list.push(data);
  return write(list) ? data.id : null;
}
export function deleteSong(id) { write(read().filter((x) => x.id !== id)); }

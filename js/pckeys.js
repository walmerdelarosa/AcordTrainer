// Teclado de computador como acordeón.
// Se usa la posición física de la tecla (event.code), así funciona igual en teclados
// latinoamericano, español o estadounidense; solo cambia la etiqueta que se muestra.
//
//   Fila Q…  → hilera de afuera (10 botones)
//   Fila A…  → hilera del medio (11 botones)
//   Fila Z…  → hilera de adentro (10 botones)
//   Fila 1…= → 12 bajos (1–6 columna de afuera, 7–= columna de adentro)
//   Espacio  → fuelle (mantener = abrir; soltar = cerrar), con la mano izquierda

const CODES = {
  afuera: ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'],
  medio: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'],
  adentro: ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
  bajos: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'],
};

export const LAYOUTS = {
  latam: { label: 'Latinoamericano', Semicolon: 'Ñ', Quote: '{', Slash: '-', Minus: "'", Equal: '¿', Comma: ',', Period: '.' },
  es: { label: 'Español (España)', Semicolon: 'Ñ', Quote: '´', Slash: '-', Minus: "'", Equal: '¡', Comma: ',', Period: '.' },
  us: { label: 'Inglés (EE. UU.)', Semicolon: ';', Quote: "'", Slash: '/', Minus: '-', Equal: '=', Comma: ',', Period: '.' },
};

export function keyLabel(code, layout = 'latam') {
  const L = LAYOUTS[layout] || LAYOUTS.latam;
  if (L[code]) return L[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

/** Mapa código → botón. mirror invierte el orden (botón 1 a la derecha). */
export function buildMap({ mirror = false } = {}) {
  const map = new Map();
  for (const row of ['afuera', 'medio', 'adentro']) {
    const codes = mirror ? [...CODES[row]].reverse() : CODES[row];
    codes.forEach((c, i) => map.set(c, { type: 'treble', id: `${row}-${i + 1}` }));
  }
  CODES.bajos.forEach((c, i) => map.set(c, { type: 'bass', id: `bajo-${Math.floor(i / 6)}-${i % 6}` }));
  return map;
}

/** Etiquetas de tecla por id de botón, para pintarlas en el diagrama. */
export function hintsFor({ mirror = false, layout = 'latam' } = {}) {
  const out = {};
  for (const [code, ref] of buildMap({ mirror })) out[ref.id] = keyLabel(code, layout);
  return out;
}

const isTyping = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;

/**
 * Escucha el teclado. handlers: { down(ref), up(ref), bellows(dir) }.
 * bellowsMode: 'hold' (mantener espacio = abrir) | 'toggle' (cada toque cambia).
 * Devuelve una función para dejar de escuchar.
 */
export function attachKeys(handlers, { mirror = false, bellowsMode = 'hold' } = {}) {
  const map = buildMap({ mirror });
  let dir = 'push';
  const down = new Set();
  const setDir = (d) => { if (d !== dir) { dir = d; handlers.bellows && handlers.bellows(dir); } };
  const kd = (e) => {
    if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (e.repeat) return;
      setDir(bellowsMode === 'toggle' ? (dir === 'push' ? 'pull' : 'push') : 'pull');
      return;
    }
    const ref = map.get(e.code);
    if (!ref) return;
    e.preventDefault();
    if (e.repeat || down.has(e.code)) return;
    down.add(e.code);
    handlers.down && handlers.down(ref, dir);
  };
  const ku = (e) => {
    if (e.code === 'Space') {
      if (!isTyping(e)) e.preventDefault();
      if (bellowsMode === 'hold') setDir('push');
      return;
    }
    const ref = map.get(e.code);
    if (!ref || !down.has(e.code)) return;
    down.delete(e.code);
    handlers.up && handlers.up(ref);
  };
  const blur = () => { down.forEach((c) => handlers.up && handlers.up(map.get(c))); down.clear(); if (bellowsMode === 'hold') setDir('push'); };
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  window.addEventListener('blur', blur);
  return {
    get dir() { return dir; },
    held: () => [...down].map((c) => map.get(c)),
    detach() { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', blur); },
  };
}

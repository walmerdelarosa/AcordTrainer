// Superficie para tocar: teclado en pantalla + teclado del PC + sonido sostenido + fuelle.
import { createKeyboard } from './keyboard.js';
import { attachKeys, hintsFor, LAYOUTS } from './pckeys.js';
import { noteOn, noteOff, allNotesOff } from './audio.js';
import { buttons, bassButtons, bassNumber } from './instrument.js';

const store = {
  get(k, d) { try { const v = localStorage.getItem('acordeon:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('acordeon:' + k, JSON.stringify(v)); } catch { /* */ } },
};
const finePointer = () => window.matchMedia?.('(pointer: fine)').matches;

/**
 * onNote({ btn, dir, midi, bass, source }) se llama en cada ataque (también al cambiar el fuelle
 * con botones sostenidos, porque la nota cambia). sound=false para no sonar (p. ej. con micrófono).
 */
export function createSurface(root, { tuning, onNote, onRelease, sound = true, compact = false } = {}) {
  const prefs = {
    orientation: store.get('kb.orientation', finePointer() ? 'horizontal' : 'vertical'),
    layout: store.get('kb.layout', 'latam'),
    mirror: store.get('kb.mirror', false),
    bellowsMode: store.get('kb.bellows', 'hold'),
    hints: store.get('kb.hints', finePointer()),
  };
  root.innerHTML = `
    <div class="surface">
      <div class="surface-ctrls">
        <div class="seg" role="group" aria-label="Orientación">
          <button data-o="horizontal" class="btn ghost sm">Como teclado de PC</button>
          <button data-o="vertical" class="btn ghost sm">Como el acordeón</button>
        </div>
        <details class="kb-opts"><summary>Opciones del teclado</summary>
          <label>Distribución <select name="layout">${Object.entries(LAYOUTS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
          <label class="check"><input type="checkbox" name="hints"> Mostrar teclas</label>
          <label class="check"><input type="checkbox" name="mirror"> Invertir (botón 1 a la derecha)</label>
          <label>Fuelle con espacio <select name="bellows"><option value="hold">Mantener = abrir</option><option value="toggle">Cada toque cambia</option></select></label>
        </details>
      </div>
      <div class="kb-wrap"></div>
      <button class="bellows-bar push" type="button" aria-live="polite">
        <span class="bb-key">ESPACIO</span><span class="bb-state">Cerrando</span><span class="bb-help">mantén para abrir</span>
      </button>
      <p class="muted small kb-help"></p>
    </div>`;
  const q = (s) => root.querySelector(s);
  let dir = 'push';
  const heldBtns = new Map(); // id → { btn, bass }
  const byId = () => Object.fromEntries([...buttons(tuning).map((b) => [b.id, b]), ...bassButtons(tuning).map((b) => [b.id, { ...b, bass: true }])]);
  let ids = byId();

  const kb = createKeyboard(q('.kb-wrap'), {
    tuning, mode: dir, orientation: prefs.orientation, mirror: prefs.mirror,
    hints: prefs.hints ? hintsFor(prefs) : null,
    onPress: (b, d) => { if (kb.mode === 'both') setDir(d); start(b.id, 'pantalla'); },
    onRelease: (b) => stop(b.id),
  });

  const midiOf = (b, d) => (b.bass ? (b.kind === 'bajo' ? 36 + b[d] : 48 + b[d]) : b[d]);
  function start(id, source) {
    const b = ids[id]; if (!b) return;
    heldBtns.set(id, b);
    const midi = midiOf(b, dir);
    if (sound) {
      if (b.bass && b.kind === 'acorde') { noteOn(id, midi, { bass: true, gain: 0.25 }); noteOn(id + 'c3', midi + 4, { bass: true, gain: 0.2 }); noteOn(id + 'c5', midi + 7, { bass: true, gain: 0.2 }); }
      else noteOn(id, midi, { bass: !!b.bass });
    }
    kb.press(id, true);
    onNote && onNote({ btn: b, dir, midi, bass: !!b.bass, source });
  }
  function stop(id) {
    const b = heldBtns.get(id); if (!b) return;
    heldBtns.delete(id);
    if (sound) { noteOff(id); noteOff(id + 'c3'); noteOff(id + 'c5'); }
    kb.press(id, false);
    onRelease && onRelease({ btn: b });
  }
  function setDir(d) {
    if (d === dir) return;
    dir = d;
    const bar = q('.bellows-bar');
    bar.classList.toggle('pull', d === 'pull'); bar.classList.toggle('push', d === 'push');
    q('.bb-state').textContent = d === 'push' ? 'Cerrando' : 'Abriendo';
    if (kb.mode !== 'both') kb.setMode(d);
    // Botones sostenidos: al invertir el fuelle cambia la nota (instrumento bisonoro)
    for (const id of [...heldBtns.keys()]) { const b = heldBtns.get(id); heldBtns.delete(id); start(id, 'fuelle'); if (!heldBtns.has(id)) heldBtns.set(id, b); }
  }

  // Barra de fuelle: también sirve en pantallas táctiles (mantener = abrir)
  const bar = q('.bellows-bar');
  bar.addEventListener('pointerdown', (e) => { e.preventDefault(); bar.setPointerCapture?.(e.pointerId); setDir(prefs.bellowsMode === 'toggle' ? (dir === 'push' ? 'pull' : 'push') : 'pull'); });
  bar.addEventListener('pointerup', () => { if (prefs.bellowsMode === 'hold') setDir('push'); });
  bar.addEventListener('pointercancel', () => { if (prefs.bellowsMode === 'hold') setDir('push'); });

  let keys = null;
  function attach() {
    keys?.detach();
    keys = attachKeys({
      down: (ref) => start(ref.id, 'teclado'),
      up: (ref) => stop(ref.id),
      bellows: (d) => setDir(d),
    }, { mirror: prefs.mirror, bellowsMode: prefs.bellowsMode });
  }
  attach();

  function syncUi() {
    root.querySelectorAll('[data-o]').forEach((b) => b.classList.toggle('on', b.dataset.o === prefs.orientation));
    q('[name=layout]').value = prefs.layout;
    q('[name=hints]').checked = prefs.hints;
    q('[name=mirror]').checked = prefs.mirror;
    q('[name=bellows]').value = prefs.bellowsMode;
    q('.bb-help').textContent = prefs.bellowsMode === 'hold' ? 'mantén para abrir' : 'toca para cambiar';
    q('.kb-help').innerHTML = finePointer()
      ? `Teclado del PC: fila <b>Q</b> = afuera, fila <b>A</b> = medio, fila <b>Z</b> = adentro, números = bajos. La mano izquierda maneja el fuelle con la <b>barra espaciadora</b>, como en el acordeón.`
      : 'Toca los botones; mantén presionada la barra de fuelle para abrir.';
  }
  function applyPrefs() {
    Object.entries({ orientation: 'kb.orientation', layout: 'kb.layout', mirror: 'kb.mirror', bellowsMode: 'kb.bellows', hints: 'kb.hints' }).forEach(([k, s]) => store.set(s, prefs[k]));
    kb.setOptions({ orientation: prefs.orientation, mirror: prefs.mirror, hints: prefs.hints ? hintsFor(prefs) : null });
    attach(); syncUi();
  }
  root.querySelectorAll('[data-o]').forEach((b) => b.onclick = () => { prefs.orientation = b.dataset.o; applyPrefs(); });
  q('[name=layout]').onchange = (e) => { prefs.layout = e.target.value; applyPrefs(); };
  q('[name=hints]').onchange = (e) => { prefs.hints = e.target.checked; applyPrefs(); };
  q('[name=mirror]').onchange = (e) => { prefs.mirror = e.target.checked; applyPrefs(); };
  q('[name=bellows]').onchange = (e) => { prefs.bellowsMode = e.target.value; applyPrefs(); };
  if (compact) q('.surface-ctrls').classList.add('compact');
  syncUi();

  return {
    kb,
    get dir() { return dir; },
    setDir,
    setTuning(t) { tuning = t; ids = byId(); kb.setTuning(t); },
    destroy() { keys?.detach(); allNotesOff(); },
  };
}

export { bassNumber };

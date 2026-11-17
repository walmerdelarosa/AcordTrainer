// Botonera grande de página (Botonera y Practicar). El sonido, el fuelle y el teclado del PC
// los maneja el instrumento global (controller.js); esto es la vista y sus opciones.
import { createKeyboard } from './keyboard.js';
import { LAYOUTS } from './pckeys.js';
import { ctrl, prefs } from './controller.js';

export function createSurface(root, { tuning, onNote, compact = false } = {}) {
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
        <span class="bb-key">ESPACIO</span><span class="bb-state">Cerrando</span><span class="bb-help"></span>
      </button>
      <p class="muted small kb-help"></p>
    </div>`;
  const q = (s) => root.querySelector(s);
  const kb = createKeyboard(q('.kb-wrap'), {
    tuning, mode: ctrl.dir, orientation: prefs.orientation, mirror: prefs.mirror, hints: ctrl.hints(),
    onPress: (b, d) => { if (kb.mode === 'both') ctrl.setDir(d); ctrl.press(b.id, 'pantalla'); },
    onRelease: (b) => ctrl.release(b.id),
  });
  const unreg = ctrl.register(kb);

  const bar = q('.bellows-bar');
  const showDir = (d) => {
    bar.classList.toggle('pull', d === 'pull'); bar.classList.toggle('push', d === 'push');
    q('.bb-state').textContent = d === 'push' ? 'Cerrando' : 'Abriendo';
  };
  showDir(ctrl.dir);
  const offDir = ctrl.onDir(showDir);
  bar.addEventListener('pointerdown', (e) => { e.preventDefault(); bar.setPointerCapture?.(e.pointerId); ctrl.bellowsDown(); });
  bar.addEventListener('pointerup', () => ctrl.bellowsUp());
  bar.addEventListener('pointercancel', () => ctrl.bellowsUp());

  const offNote = onNote ? ctrl.onNote(onNote) : () => {};

  function syncUi() {
    root.querySelectorAll('[data-o]').forEach((b) => b.classList.toggle('on', b.dataset.o === prefs.orientation));
    q('[name=layout]').value = prefs.layout;
    q('[name=hints]').checked = prefs.hints;
    q('[name=mirror]').checked = prefs.mirror;
    q('[name=bellows]').value = prefs.bellowsMode;
    q('.bb-help').textContent = prefs.bellowsMode === 'hold' ? 'mantén para abrir' : 'toca para cambiar';
    q('.kb-help').innerHTML = `Teclado del PC: fila <b>Q</b> = afuera, fila <b>A</b> = medio, fila <b>Z</b> = adentro, números = bajos. La mano izquierda maneja el fuelle con la <b>barra espaciadora</b>, como en el acordeón. Funciona en cualquier página.`;
    kb.setOptions({ orientation: prefs.orientation, mirror: prefs.mirror, hints: ctrl.hints() });
  }
  const offPrefs = ctrl.onPrefs(syncUi);
  root.querySelectorAll('[data-o]').forEach((b) => b.onclick = () => ctrl.setPrefs({ orientation: b.dataset.o }));
  q('[name=layout]').onchange = (e) => ctrl.setPrefs({ layout: e.target.value });
  q('[name=hints]').onchange = (e) => ctrl.setPrefs({ hints: e.target.checked });
  q('[name=mirror]').onchange = (e) => ctrl.setPrefs({ mirror: e.target.checked });
  q('[name=bellows]').onchange = (e) => ctrl.setPrefs({ bellowsMode: e.target.value });
  if (compact) q('.surface-ctrls').classList.add('compact');
  syncUi();

  return {
    kb,
    get dir() { return ctrl.dir; },
    destroy() { unreg(); offDir(); offNote(); offPrefs(); },
  };
}

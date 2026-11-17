// Botoneras fijas a los costados de la página: pitos (mano derecha) a la izquierda y
// bajos (mano izquierda, con el fuelle) a la derecha. Se pueden mostrar u ocultar.
// En pantallas angostas se abren desde un botón flotante, eligiendo pitos o bajos.
import { createKeyboard } from './keyboard.js';
import { ctrl, prefs } from './controller.js';

const store = {
  get(k, d) { try { const v = localStorage.getItem('acordeon:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('acordeon:' + k, JSON.stringify(v)); } catch { /* */ } },
};

function bellowsButton(el) {
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); ctrl.bellowsDown(); });
  el.addEventListener('pointerup', () => ctrl.bellowsUp());
  el.addEventListener('pointercancel', () => ctrl.bellowsUp());
  const show = (d) => {
    el.classList.toggle('pull', d === 'pull'); el.classList.toggle('push', d === 'push');
    el.querySelector('.st').textContent = d === 'push' ? 'Cerrando' : 'Abriendo';
  };
  show(ctrl.dir);
  ctrl.onDir(show);
}

function makeKb(container, part) {
  const kb = createKeyboard(container, {
    tuning: ctrl.tuning, part, orientation: 'vertical', mode: ctrl.dir, hints: ctrl.hints(),
    onPress: (b) => ctrl.press(b.id, 'pantalla'),
    onRelease: (b) => ctrl.release(b.id),
  });
  ctrl.register(kb);
  ctrl.onPrefs(() => kb.setOptions({ hints: ctrl.hints() }));
  return kb;
}

export function mountRails() {
  const left = document.getElementById('rail-left'), right = document.getElementById('rail-right');
  left.innerHTML = `<header><b>Pitos</b><span class="muted">mano derecha</span></header><div class="rail-kb"></div>`;
  right.innerHTML = `<header><b>Bajos</b><span class="muted">mano izquierda</span></header><div class="rail-kb"></div>
    <button class="rail-bellows push" type="button" title="Fuelle: mantén para abrir (o la barra espaciadora)"><span class="k">Fuelle</span><span class="st">Cerrando</span></button>`;
  makeKb(left.querySelector('.rail-kb'), 'treble');
  makeKb(right.querySelector('.rail-kb'), 'bass');
  bellowsButton(right.querySelector('.rail-bellows'));

  // Mostrar u ocultar cada costado (escritorio)
  const vis = { left: store.get('rails.left', true), right: store.get('rails.right', true) };
  const apply = () => {
    document.body.classList.toggle('rail-left-on', vis.left);
    document.body.classList.toggle('rail-right-on', vis.right);
    document.querySelectorAll('[data-rail]').forEach((b) => { b.classList.toggle('on', vis[b.dataset.rail]); b.setAttribute('aria-pressed', vis[b.dataset.rail]); });
  };
  document.querySelectorAll('[data-rail]').forEach((b) => b.onclick = () => {
    vis[b.dataset.rail] = !vis[b.dataset.rail];
    store.set('rails.' + b.dataset.rail, vis[b.dataset.rail]);
    apply();
  });
  apply();

  // Altura del encabezado para ubicar las botoneras debajo
  const top = document.querySelector('.top'), band = document.querySelector('.vueltiao');
  const setTop = () => document.documentElement.style.setProperty('--top-h', `${top.offsetHeight + band.offsetHeight}px`);
  new ResizeObserver(setTop).observe(top);
  setTop();

  // Celular / ventana angosta: hoja inferior con selector pitos | bajos
  const sheet = document.getElementById('rail-sheet');
  sheet.innerHTML = `
    <div class="sheet-head">
      <div class="seg" role="tablist"><button class="btn ghost sm on" data-part="treble">Pitos</button><button class="btn ghost sm" data-part="bass">Bajos</button></div>
      <button class="btn ghost xs close" aria-label="Cerrar">✕</button>
    </div>
    <div class="sheet-kb treble"></div><div class="sheet-kb bass" hidden></div>
    <button class="rail-bellows push" type="button"><span class="k">Fuelle</span><span class="st">Cerrando</span><span class="muted"> · mantén para abrir</span></button>`;
  makeKb(sheet.querySelector('.sheet-kb.treble'), 'treble');
  makeKb(sheet.querySelector('.sheet-kb.bass'), 'bass');
  bellowsButton(sheet.querySelector('.rail-bellows'));
  sheet.querySelectorAll('[data-part]').forEach((b) => b.onclick = () => {
    sheet.querySelectorAll('[data-part]').forEach((x) => x.classList.toggle('on', x === b));
    sheet.querySelector('.sheet-kb.treble').hidden = b.dataset.part !== 'treble';
    sheet.querySelector('.sheet-kb.bass').hidden = b.dataset.part !== 'bass';
  });
  const fab = document.getElementById('rail-fab');
  fab.onclick = () => { sheet.hidden = !sheet.hidden; fab.classList.toggle('on', !sheet.hidden); };
  sheet.querySelector('.close').onclick = () => { sheet.hidden = true; fab.classList.remove('on'); };
}

# AcorTrainer

Aplicación web para aprender **acordeón diatónico colombiano** (vallenato) desde cero. Funciona en el navegador, sin instalación y sin servidor: se publica tal cual en GitHub Pages.

## Qué hace

| Sección | Descripción |
|---|---|
| **Aprender** | 14 lecciones en 6 unidades para principiantes absolutos: partes del instrumento, hileras y afinaciones, cifrado, tonos y semitonos, escalas cromática, mayor y menor, grados, tríadas, I–IV–V, rutina de técnica. Con ejemplos sonoros y preguntas. |
| **Explorar** | Cualquier escala, acorde o ejercicio de intervalos (terceras, sextas, octavas, décimas) en cualquier tónica, con la digitación sugerida en el teclado. |
| **Teclado** | Botonera de 31 botones + 12 bajos con sonido. Cerrando/abriendo (barra espaciadora = abrir). |
| **Practicar** | La app escucha por el micrófono y avanza cuando tocas la nota correcta. Afinador en cents. |
| **Video** | Cargas un video o audio y la app extrae la melodía, la convierte en botón + fuelle para tu afinación y la sincroniza con el video (velocidad 0.5×/0.75×, bucle A–B, exportar CSV). |

Afinaciones incluidas: Cinco Letras (B♭–E♭–A♭), ADG, GCF, Cuatro Letras (F–B♭–E♭), EAD y las de taller Simila, Lluvia, Colibrí, GCF Alzao (= A♭–D♭–G♭), C–F–B♭ y D–G–C.

## Cómo analizar videos

No hace falta subir nada a un servidor. En la pestaña **Video**, el botón *Elegir archivo* abre el selector del teléfono o del computador; el archivo se procesa **localmente en el navegador** y nunca sale del dispositivo.

- Sirven `.mp4`, `.mov`, `.webm`, `.m4a`, `.mp3`, `.wav` (lo que el navegador pueda reproducir).
- Desde el celular puedes grabar directamente con la cámara o elegir un video de la galería.
- Los enlaces de YouTube no se pueden analizar desde el navegador (la plataforma no da acceso al audio). Usa videos propios o descargados.
- Mejores resultados: acordeón al frente, poco eco y fragmentos cortos (30 s – 2 min).

## Ejecutar en local

Los módulos ES necesitan servirse por HTTP (no abrir `index.html` con doble clic):

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

## Publicar en GitHub Pages

*Settings → Pages → Deploy from a branch → `main` / root*. No hay paso de compilación.

## Estructura

```
index.html, css/styles.css
js/
  theory.js        notas, deletreo, escalas, acordes, grados (sin DOM)
  instrument.js    mapa de botones, afinaciones, digitación (Viterbi)
  exercises.js     generadores de ejercicios
  lessons.js       currículo
  keyboard.js      teclado SVG
  audio.js         sintetizador con trémolo
  practice.js      práctica con micrófono
  video.js         análisis de videos
  pitch/           motor de detección de altura
    yin.js         YIN (una voz, muy preciso)
    salience.js    saliencia armónica espectral (tolera bajos, caja y guacharaca)
    tracker.js     seguimiento de notas y análisis fuera de línea
tools/
  test-model.mjs   pruebas del modelo musical
  eval-pitch.mjs   banco de pruebas del detector
docs/PLAN.md       plan, decisiones y pendientes
```

## Pruebas

```bash
node tools/test-model.mjs                    # mapa de botones, afinaciones, teoría, escalas
node tools/eval-pitch.mjs --algo salience    # precisión del detector con señales sintéticas
node tools/eval-pitch.mjs --algo yin
```

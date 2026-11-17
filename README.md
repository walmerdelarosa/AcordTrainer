# AcordTrainer

Creado por **Walmer De la Rosa Guerrero**.

Aplicación web para aprender **acordeón diatónico colombiano** (vallenato) desde cero. Funciona en el navegador, sin instalación y sin servidor: se publica tal cual en GitHub Pages.

## Qué hace

| Sección | Descripción |
|---|---|
| **Aprender** | 14 lecciones en 6 unidades para principiantes absolutos: partes del instrumento, hileras y afinaciones, cifrado, tonos y semitonos, escalas, grados, tríadas, I–IV–V y técnica. Con ejemplos sonoros y preguntas. |
| **Escalas y acordes** | Cualquier escala, acorde o ejercicio de intervalos en cualquier tónica, con la digitación sugerida. |
| **Botonera** | Los 31 botones y los 12 bajos con sonido. Se toca con el mouse, con el dedo o con el **teclado del PC**: fila Q = afuera, fila A = medio, fila Z = adentro, números = bajos y **barra espaciadora = fuelle** (mano izquierda). Si mantienes un botón y cambias el fuelle, cambia la nota, igual que en el instrumento. |
| **Sacar de un video** | Detecta la melodía **y la mano izquierda** (bajo y acorde), estima el tempo y arma una canción con **partitura + tablatura** sincronizada con el video. |
| **Canciones** | Partitura y tablatura con reproducción (velocidad, bucle por compases, guacharaca de metrónomo, bajos), edición nota por nota y descarga en **MusicXML**, **MIDI** o CSV. Se guardan en el navegador. Incluye de ejemplo la **marcación de paseo** (solo bajos, I–IV–V–I) para practicar la mano izquierda. |
| **Practicar** | Ejercicios o canciones, con el teclado del PC/pantalla o con el **acordeón real por micrófono**. Modo paso a paso o **con ritmo** (dice si llegas a tiempo, adelantado o atrasado). |

### Tablatura

Debajo del pentagrama hay tres líneas, una por hilera (**af** afuera, **me** medio, **ad** adentro), con el número de botón (1 = arriba). El carril **fu** muestra el fuelle (rojo = cerrando, verde = abriendo) y el carril **bj** los bajos (**Sib** = bajo, *sib* = acorde, con el número de botón de bajo).

En MusicXML la tablatura va como letra bajo cada nota (`af2`, `me5`… y `C`/`A` para el fuelle), así se ve en MuseScore, Finale, Sibelius, Dorico o Guitar Pro.

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
  surface.js       botonera + teclado del PC + fuelle
  pckeys.js        mapa QWERTY (latinoamericano, España, EE. UU.)
  rhythm.js        tempo, compás y cuantización
  song.js          modelo de canción y exportadores (MusicXML, MIDI, CSV)
  notation.js      partitura + tablatura en SVG
  player.js        reproductor con metrónomo de guacharaca y caja
  songview.js      panel de canción (reproducir, editar, exportar)
  library.js       Mis canciones (guardado local)
  pitch/           motor de detección de altura
    yin.js         YIN (una voz, muy preciso)
    salience.js    saliencia armónica espectral (tolera bajos, caja y guacharaca)
    bass.js        mano izquierda: bajo y acorde
    tracker.js     seguimiento de notas y análisis fuera de línea
sw.js, manifest    funciona sin conexión e instalable
tools/
  test-model.mjs   pruebas del modelo musical
  eval-pitch.mjs   banco de pruebas del detector
docs/PLAN.md       plan, decisiones y pendientes
```

## Pruebas

```bash
node tools/test-model.mjs                    # botones, afinaciones, teoría, tempo, exportadores
node tools/eval-pitch.mjs --algo salience    # precisión del detector con señales sintéticas
node tools/eval-pitch.mjs --algo yin
```

## Autor

Creado por **Walmer De la Rosa Guerrero**.

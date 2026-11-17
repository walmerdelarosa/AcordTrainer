# Plan del proyecto — AcordTrainer

Creado por Walmer De la Rosa Guerrero.

## Alcance

| Fase | Estado | Contenido |
|---|---|---|
| 0. Modelo del instrumento | ✅ | Mapa de 31 botones (cerrando/abriendo) transcrito del método de referencia; 11 afinaciones por transposición; 12 bajos; digitación automática. |
| 1. Teoría | ✅ base | 14 lecciones, explorador de escalas/acordes/intervalos, teclado con sonido, progreso local. |
| 2. Micrófono | ✅ base | Práctica guiada con detección de notas y afinador. |
| 3. Video | ✅ base | Extracción de melodía, botón + fuelle, sincronía, velocidad, bucle A–B, CSV. |
| Cámara | ❌ descartada | — |
| 4. Mano izquierda | ✅ base | Detección de bajo/acorde; el fuelle compartido corrige la digitación de la melodía. |
| 5. Canción | ✅ base | Tempo, cuantización, partitura + tablatura con reproducción, edición, MusicXML/MIDI/CSV, biblioteca local. |
| 6. Teclado de PC | ✅ | QWERTY como botonera, espacio = fuelle, bajos en la fila de números. |
| 7. Práctica con ritmo | ✅ base | Metrónomo de guacharaca, bajos de acompañamiento, medición adelantado/atrasado. |

## Decisiones de diseño

1. **Una sola botonera, muchas afinaciones.** Todas las afinaciones tienen la misma forma (hileras a una cuarta) y solo cambia la altura. Se guarda Cinco Letras y el resto se calcula con un desplazamiento en semitonos.
2. **Botones auxiliares por clase de nota.** El método de referencia usa el primer botón de cada hilera en cualquier octava (p. ej. el Si de Do mayor y el de la cromática de Do, una octava más arriba). La digitación los acepta así.
3. **Digitación = camino de menor costo (Viterbi).** Se penaliza cambiar el fuelle (más que cambiar de hilera, como hace el método de referencia), saltar botones y usar auxiliares. Coincide con el método de referencia en Do mayor y en las escalas por hilera, pero en la cromática de Do solo en 7 de 13 notas (elige menos cambios de fuelle). Es una sugerencia, no una regla.
4. **Comparación por clase de nota.** Muchos acordeones tienen una lengüeta una octava abajo; el detector "oye" esa octava, y eso es físicamente correcto. La app compara la clase de nota (Do, Re…) y la lleva a la octava disponible en el teclado.
5. **Fuelle único.** Los bajos también son bisonoros: si el bajo que suena solo existe abriendo (o cerrando), la melodía tiene que ir en la misma dirección. El análisis usa esa pista al digitar.
6. **Tablatura propia.** Tres líneas (una por hilera) con el número de botón, carril de fuelle y carril de bajos. En MusicXML va como letra bajo las notas, para que la lean los programas de partituras.
7. **Teclado del PC.** Se usa la posición física de la tecla (funciona con distribución latinoamericana, de España o de EE. UU.). Las filas QWERTY son las hileras; la mano izquierda maneja el fuelle con el espacio.
8. **Todo en el dispositivo.** Sin servidor: privacidad (importante si hay menores usando el micrófono) y hosting gratis en GitHub Pages.

## Motor de pitch: estado y cómo afinarlo

Dos detectores con la misma interfaz (`detect(frame) → { freq, clarity, rms }`):

- **YIN**: excelente con el acordeón solo. Falla con acompañamiento.
- **Saliencia armónica**: busca la fundamental que explica más armónicos, prefiere la voz aguda (melodía) y corrige la octava cuando el **trémolo** anula la fundamental por batido (se revisan los armónicos impares de la octava de abajo).

Resultados con señales sintéticas (`node tools/eval-pitch.mjs`), % de cuadros con la nota exacta:

| Escenario | YIN | Saliencia |
|---|---|---|
| Acordeón solo, trémolo | 99.7 | 99.1 |
| + bajos de la mano izquierda | 72.7 | 99.1 |
| + caja y guacharaca | 96.9 | 99.2 |
| Conjunto + ruido 15 dB | 57.7 | 99.2 |
| Conjunto + ruido 5 dB | 7.1 | 99.2 |

Mano izquierda (eventos con tipo y nota correctos, progresión I–IV–V–I): **85 %** con bajos solos o con conjunto a 15 dB; **79 %** a 5 dB. La caja agrega ataques de más en la banda grave.

Tempo: acierta entre 80 y 165 pulsos/min en pruebas sintéticas; puede confundir 3:2 a tempos extremos (≈180). El panel de canción tiene botones ×2, ÷2, ×1,5 y ÷1,5 para corregirlo.

**Limitación importante:** las señales sintéticas no reemplazan grabaciones reales. Pasos para afinarlo de verdad:

1. **Corpus etiquetado.** 20–30 fragmentos reales (videos de referencia, grabaciones propias) con las notas anotadas a mano (CSV: inicio, fin, nota). La app ya exporta CSV: se corrige el CSV y queda como referencia.
2. **Evaluación con audio real.** Extender `eval-pitch.mjs` para leer WAV + CSV y reportar F1 por nota y errores de octava.
3. **Ajuste de parámetros** (`oddRatio`, `melodyBias`, `harmonicDecay`, `minClarity`, `minNoteSec`) con barrido automático sobre ese corpus.
4. **Voz cantada.** En vallenato la voz suele ir más alta que el acordeón. Cuando haya canto, el sesgo hacia la voz aguda la puede confundir con la melodía. Opciones: separación de fuentes con un modelo (Demucs/Spleeter, procesado fuera del navegador) o un modelo neuronal de pitch (CREPE/SPICE con TensorFlow.js).
5. **Notas simultáneas.** Hoy se extrae una sola línea melódica. Las terceras y sextas paralelas (muy típicas) requieren un detector polifónico.

## Sonido

El sonido se sintetiza (no hay muestras grabadas), calibrado con una grabación de acordeón vallenato:
perfil de armónicos por registro, trémolo casi seco (~4 cents; la medición dio mediana de 3 cents) y poco ruido de aire.
Error medio frente a la grabación: 1,7 dB (grave), 4,5 dB (medio), 1,9 dB (agudo).
Para recalibrar con otro instrumento: `tools/extraer-notas.mjs` + `tools/calibrar-sonido.py` y pegar el resultado en `PROFILE` de `js/reed.js`.
Siguiente nivel: muestreo del acordeón propio (grabar cada botón cerrando y abriendo).

## Pendiente de validar con un acordeonero

- [ ] Octava real de los botones auxiliares y registro absoluto de cada afinación.
- [ ] Calidad de los acordes de los bajos (mayor/menor) y cuáles son bajo y cuáles acorde.
- [ ] Datos de las afinaciones de taller (nombres, transposiciones). La tabla dice que "Cinco Letras" viene de cinco caracteres en el cifrado, pero "Bb Eb Ab" tiene seis: verificar el origen del nombre.
- [ ] Digitaciones sugeridas frente a las del método de referencia, sobre todo la cromática.
- [ ] Unidad 6 (paseo, merengue, son, puya): compás, patrones de bajo, caja y guacharaca.

## Próximos pasos sugeridos

0. Validar el análisis de bajos con grabaciones reales (en especial la calidad mayor/menor de los acordes).

1. Probar con 3–5 videos reales de acordeoneros y revisar las notas detectadas.
2. Agregar los 10 ejercicios técnicos del método como ejercicios interactivos (traslados, posiciones principales, agilidad).
3. Numeración de dedos (el método indica dedo 1–4 por nota).
4. Modo "canción": importar el CSV corregido y practicarlo con el micrófono.
5. Hacer la web instalable (PWA) para usarla sin conexión.

## Consideraciones

- **Repertorio:** no incluir canciones comerciales completas sin licencia.
- **Menores:** si la app se usa en escuelas, pedir el consentimiento de padres o acudientes para el uso del micrófono, aunque el audio no salga del dispositivo.
- **Licencia:** falta elegirla (p. ej. MIT para el código; el contenido pedagógico podría ir con otra licencia).

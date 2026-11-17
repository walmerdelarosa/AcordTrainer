// Currículo para principiantes absolutos, con progresión. Textos propios.
// Cada lección: { id, unit, title, minutes, body(tuning) => HTML, widgets(tuning) => [] }
import * as T from './theory.js';
import { TUNINGS, rowKeys } from './instrument.js';
import { scaleExercise, chordExercise, intervalExercise, rowTonic } from './exercises.js';
import { VIDEOS, EXERCISE_NAMES } from './resources.js';

const rk = (t) => rowKeys(t).map((pc) => T.nameEs(T.spellPc(pc, t.pref)));
const quiz = (q, options, answer, explain) => ({ type: 'quiz', q, options, answer, explain });
const links = (items) => ({ type: 'links', items });

export const UNITS = [
  { id: 1, title: 'Conoce tu acordeón' },
  { id: 2, title: 'El lenguaje de la música' },
  { id: 3, title: 'Escalas' },
  { id: 4, title: 'Acordes' },
  { id: 5, title: 'Técnica' },
  { id: 6, title: 'Aires del vallenato' },
];

export const LESSONS = [
  {
    id: 'partes', unit: 1, title: 'Las partes del acordeón', minutes: 5,
    body: (t) => `
      <p>El acordeón vallenato es un <b>acordeón diatónico de botones</b> (en inglés, <i>diatonic button accordion</i>). Tiene tres partes que vas a usar desde el primer día:</p>
      <ul>
        <li><b>Teclado (mano derecha):</b> 31 botones repartidos en 3 hileras. Aquí va la melodía.</li>
        <li><b>Bajos (mano izquierda):</b> 12 botones que dan notas graves y acordes para acompañar.</li>
        <li><b>Fuelle:</b> el que mueve el aire. Lo puedes <span class="push-t">cerrar</span> o <span class="pull-t">abrir</span>.</li>
      </ul>
      <p>La idea clave: <b>cada botón da dos notas distintas</b>, una al cerrar y otra al abrir. Por eso se le llama instrumento <i>bisonoro</i>. En el teclado de abajo, la mitad roja de cada botón es la nota al cerrar y la verde, al abrir.</p>
      <p class="tip">Toca la mitad de arriba o de abajo de un botón para escucharlo.</p>`,
    widgets: () => [{ type: 'keyboard', mode: 'both' },
      quiz('¿Cuántas notas distintas puede dar un mismo botón del teclado?', ['Una', 'Dos', 'Tres'], 1,
        'Dos: una cerrando el fuelle y otra abriéndolo.')],
  },
  {
    id: 'hileras', unit: 1, title: 'Las hileras y las afinaciones', minutes: 6,
    body: (t) => `
      <p>Las tres hileras se llaman <b>afuera</b>, <b>medio</b> y <b>adentro</b>. Cada una está construida sobre una tonalidad mayor, y el nombre de la afinación dice esas tres tonalidades en orden.</p>
      <p>Tu afinación seleccionada es <b>${t.name}</b>: afuera <b>${rk(t)[0]}</b>, medio <b>${rk(t)[1]}</b>, adentro <b>${rk(t)[2]}</b>.</p>
      <p>Fíjate en un patrón: de una hilera a la siguiente siempre hay una <b>cuarta justa</b> (5 semitonos). Por eso todas las afinaciones tienen la misma forma y solo cambian de altura: lo que aprendas en una sirve en las demás.</p>`,
    widgets: () => [{ type: 'tunings' },
      quiz('En un acordeón GCF, ¿cuál es la tonalidad de la hilera del medio?', ['Sol', 'Do', 'Fa'], 1,
        'G–C–F: afuera Sol, medio Do, adentro Fa.')],
  },
  {
    id: 'cerrar-abrir', unit: 1, title: 'Cerrar y abrir: el acorde de cada hilera', minutes: 7,
    body: (t) => `
      <p>Mira la hilera de afuera. Si <span class="push-t">cierras</span> en sus botones, las notas se repiten en tres: <b>${T.triad(rowTonic(t, 'afuera')).map(T.nameEs).join(', ')}</b>. Ese es el <b>acorde mayor</b> de la hilera.</p>
      <p>Al <span class="pull-t">abrir</span> aparecen las notas que faltan para completar la escala. Cerrando y abriendo en orden, botón por botón, sale la escala mayor de la hilera.</p>
      <p>El primer botón de cada hilera (arriba) es especial: es un <b>botón auxiliar</b> con notas fuera de la escala. Más adelante te servirá para tocar en otras tonalidades.</p>`,
    widgets: (t) => [{ type: 'exercise', ex: scaleExercise(t, rowTonic(t, 'afuera'), 'mayor', { onlyRow: 'afuera' }) },
      quiz('Si cierras el fuelle en los botones de una hilera, ¿qué escuchas?', ['La escala cromática', 'El acorde mayor de la hilera', 'Notas al azar'], 1,
        'Cerrando suenan la tónica, la tercera y la quinta: el acorde mayor de esa hilera.')],
  },
  {
    id: 'nombres', unit: 2, title: 'Nombres de las notas y cifrado', minutes: 5,
    body: () => `
      <p>Hay dos formas de nombrar las 7 notas naturales. En Colombia se usa el <b>solfeo</b> (Do, Re, Mi…) y en partituras y videos aparece mucho el <b>cifrado americano</b> (en inglés, <i>letter notation</i>), que usa letras:</p>
      <table class="tbl"><tr>${T.SOLFEGE.map((s) => `<th>${s}</th>`).join('')}</tr><tr>${T.LETTERS.map((l) => `<td>${l}</td>`).join('')}</tr></table>
      <p>El cifrado empieza en <b>La = A</b> y sigue el abecedario. Por eso Do es C. En el cifrado alemán, Si se escribe H y la B es Si bemol: ojo si ves partituras europeas.</p>`,
    widgets: () => [quiz('¿Cómo se escribe Sol en cifrado americano?', ['S', 'G', 'F'], 1, 'Sol = G.'),
      quiz('¿Qué nota es la A?', ['Do', 'La', 'Re'], 1, 'A = La. El abecedario arranca en La.'),
      links([['Método cifrado', VIDEOS.metodoCifrado]])],
  },
  {
    id: 'alteraciones', unit: 2, title: 'Sostenidos, bemoles y enarmonía', minutes: 5,
    body: () => `
      <p>Un <b>sostenido (♯)</b> sube la nota un semitono y un <b>bemol (♭)</b> la baja un semitono.</p>
      <p>A veces dos nombres suenan igual: Do♯ y Re♭, o La♯ y Si♭. A esto se le llama <b>enarmonía</b>. En los gráficos de botones verás "La♯", mientras que el nombre de la afinación dice "Si♭". Es la misma tecla.</p>
      <p>Regla práctica: en una escala, cada letra aparece una sola vez. Por eso en Fa mayor se escribe Si♭ (y no La♯), y en Fa♯ mayor aparece Mi♯.</p>`,
    widgets: () => [quiz('¿Cuál es el enarmónico de Re♯?', ['Mi♭', 'Mi', 'Re♭'], 0, 'Re♯ y Mi♭ suenan igual.'),
      { type: 'toggle-accidentals' }],
  },
  {
    id: 'tonos', unit: 2, title: 'Tonos y semitonos', minutes: 6,
    body: () => `
      <p>El <b>semitono</b> es la distancia más pequeña entre dos notas en nuestra música; el <b>tono</b> son dos semitonos.</p>
      <p>Entre las notas naturales casi todo es tono, menos <b>Mi–Fa</b> y <b>Si–Do</b>, que son semitonos. Escucha la diferencia:</p>`,
    widgets: () => [{ type: 'interval-demo', pairs: [['Do → Re (tono)', 60, 62], ['Mi → Fa (semitono)', 64, 65], ['Si → Do (semitono)', 71, 72], ['Fa → Sol (tono)', 65, 67]] },
      quiz('¿Qué distancia hay entre Mi y Fa?', ['Un tono', 'Un semitono', 'Dos tonos'], 1, 'Mi–Fa es uno de los dos semitonos naturales.')],
  },
  {
    id: 'cromatica', unit: 3, title: 'La escala cromática', minutes: 8,
    body: () => `
      <p>La <b>escala cromática</b> recorre los 12 sonidos distintos de una octava, todos a un semitono de distancia.</p>
      <p>En un instrumento diatónico es un buen reto: para completarla hay que combinar las tres hileras, abrir y cerrar, y usar los botones auxiliares. La digitación de abajo la calcula la app buscando el menor número de cambios de fuelle.</p>`,
    widgets: (t) => [{ type: 'exercise', ex: scaleExercise(t, T.parseNote('C'), 'cromatica') },
      links([['Escala cromática', VIDEOS.escalaCromatica]])],
  },
  {
    id: 'mayor', unit: 3, title: 'La escala mayor', minutes: 8,
    body: () => `
      <p>Todas las escalas mayores siguen la misma fórmula de distancias:</p>
      <p class="formula">${T.SCALES.mayor.formula}</p>
      <p>(T = tono, S = semitono). Tu acordeón trae tres escalas mayores "de fábrica", una por hilera. Empieza por la de afuera: alterna cerrar y abrir botón por botón.</p>`,
    widgets: (t) => ['afuera', 'medio', 'adentro'].map((r) => ({ type: 'exercise', ex: scaleExercise(t, rowTonic(t, r), 'mayor', { onlyRow: r, descend: true }) }))
      .concat([quiz('¿Dónde están los semitonos de la escala mayor?', ['Entre los grados 3–4 y 7–8', 'Entre 2–3 y 6–7', 'No tiene semitonos'], 0, 'T–T–S–T–T–T–S: entre III–IV y VII–VIII.'),
        links([['Escala diatónica', VIDEOS.escalaDiatonica], ['Escalas mayores 1', VIDEOS.escalasMayores1], ['Escalas mayores 2', VIDEOS.escalasMayores2]])]),
  },
  {
    id: 'grados', unit: 3, title: 'Los grados de la escala', minutes: 6,
    body: () => `
      <p>Cada nota de la escala tiene un número (en romanos) y un nombre según su función:</p>
      <table class="tbl"><tr><th>Grado</th><th>Nombre</th></tr>${T.DEGREES.map((d) => `<tr><td>${d.roman}</td><td>${d.name}</td></tr>`).join('')}</table>
      <p>Los más importantes para acompañar vallenato son el <b>I</b> (tónica), el <b>IV</b> (subdominante) y el <b>V</b> (dominante).</p>`,
    widgets: () => [quiz('¿Cómo se llama el grado V?', ['Subdominante', 'Dominante', 'Mediante'], 1, 'V = Dominante.'),
      quiz('En Do mayor, ¿cuál es el grado IV?', ['Fa', 'Sol', 'Mi'], 0, 'Do (I), Re (II), Mi (III), Fa (IV).'),
      links([['Grados musicales', VIDEOS.gradosMusicales]])],
  },
  {
    id: 'menor', unit: 3, title: 'La escala menor natural', minutes: 8,
    body: (t) => {
      const rel = T.transpose(rowTonic(t, 'afuera'), 5, 9);
      return `
      <p>La escala menor natural tiene otra fórmula, con un sonido más melancólico:</p>
      <p class="formula">${T.SCALES.menor.formula}</p>
      <p>Cada escala mayor tiene una <b>relativa menor</b> que usa las mismas notas, empezando en su VI grado. La relativa menor de tu hilera de afuera (${T.nameEs(rowTonic(t, 'afuera'))} mayor) es <b>${T.nameEs(rel)} menor</b>.</p>`;
    },
    widgets: (t) => [{ type: 'exercise', ex: scaleExercise(t, T.transpose(rowTonic(t, 'afuera'), 5, 9), 'menor') },
      links([['Escalas menores', VIDEOS.escalasMenores], ['Escalas menores con sus acordes', VIDEOS.escalasMenoresAcordes]])],
  },
  {
    id: 'triadas', unit: 4, title: 'Acordes de tres notas (tríadas)', minutes: 8,
    body: () => `
      <p>Una <b>tríada</b> son tres notas apiladas por terceras. Según el tipo de terceras hay cuatro clases:</p>
      <table class="tbl"><tr><th>Tipo</th><th>Construcción</th><th>Ejemplo en Do</th></tr>
      ${Object.entries(T.CHORDS).map(([k, c]) => `<tr><td>${c.label}</td><td>${{ mayor: '3ª M + 3ª m', menor: '3ª m + 3ª M', disminuido: '3ª m + 3ª m', aumentado: '3ª M + 3ª M' }[k]}</td><td>${T.triad(T.parseNote('C'), k).map(T.nameEs).join(' – ')}</td></tr>`).join('')}</table>`,
    widgets: (t) => [
      { type: 'exercise', ex: chordExercise(t, rowTonic(t, 'medio'), 'mayor') },
      { type: 'exercise', ex: chordExercise(t, T.transpose(rowTonic(t, 'medio'), 5, 9), 'menor') },
      links([['Acordes mayores', VIDEOS.acordesMayores], ['Acordes menores', VIDEOS.acordesMenores], ['Acordes disminuidos', VIDEOS.acordesDisminuidos], ['Acordes aumentados', VIDEOS.acordesAumentados]])],
  },
  {
    id: 'i-iv-v', unit: 4, title: 'I – IV – V: las hileras trabajan juntas', minutes: 7,
    body: (t) => `
      <p>Como las hileras están a una cuarta, en la tonalidad de la hilera del medio (<b>${rk(t)[1]}</b>) pasa algo muy útil:</p>
      <ul><li>I = ${rk(t)[1]} (medio)</li><li>IV = ${rk(t)[2]} (adentro)</li><li>V = ${rk(t)[0]} (afuera)</li></ul>
      <p>Es decir, los tres acordes más usados de la canción están, cada uno, en una hilera. Escucha la progresión I – IV – V – I:</p>`,
    widgets: (t) => [{ type: 'progression', chords: [1, 2, 0, 1].map((i) => rowTonic(t, ['afuera', 'medio', 'adentro'][i])) },
      quiz(`En ${t.name}, si la canción está en ${rk(t)[1]}, ¿en qué hilera está el acorde de dominante (V)?`, ['Afuera', 'Medio', 'Adentro'], 0, `El V de ${rk(t)[1]} es ${rk(t)[0]}, la hilera de afuera.`)],
  },
  {
    id: 'tecnica', unit: 5, title: 'Rutina de técnica (10 ejercicios)', minutes: 15,
    body: () => `
      <p>La técnica se organiza en 10 ejercicios. Úsalos como calentamiento diario, despacio y con el metrónomo:</p>
      <ol>${EXERCISE_NAMES.map((n, i) => `<li><a href="${VIDEOS.ejercicios[i]}" target="_blank" rel="noopener">${n}</a></li>`).join('')}</ol>
      <p class="muted">Cada ejercicio enlaza a un video de referencia. Abajo tienes los ejercicios de intervalos generados para tu afinación.</p>`,
    widgets: (t) => [3, 6, 8, 10].map((iv) => ({ type: 'exercise', ex: intervalExercise(t, 'afuera', iv) })),
  },
  {
    id: 'aires', unit: 6, title: 'Paseo, merengue, son y puya', minutes: 3, draft: true,
    body: () => `
      <p class="warn"><b>En construcción.</b> Los cuatro aires tradicionales del vallenato son el <b>paseo</b>, el <b>merengue</b>, el <b>son</b> y la <b>puya</b>. Esta unidad (patrones de bajo, compás y figuras de caja y guacharaca) se publicará cuando la valide un acordeonero.</p>`,
    widgets: () => [],
  },
];

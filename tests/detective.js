// Contrato del Detective sin depender de la implementación de las tareas 2 y 3.
// Ejecutar: node --test tests/detective.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Detective = require('../web/src/detective.js');
function mapa({ ilustrativo = false, resumen = {}, activar = true } = {}) {
  const llamadas = [];
  return {
    llamadas,
    capas: () => [{ id: 'suelo', ilustrativo }, { id: 'temp' }, { id: 'lluvia' }],
    elegirCapa: id => { llamadas.push(['capa', id]); return activar; },
    irA: async (...args) => { llamadas.push(['ir', ...args]); return {}; },
    resumen: async (...args) => {
      llamadas.push(['resumen', ...args]);
      return { antes: 0.3, hoy: 0.2, pendiente_decada: -0.04, unidad: 'm³/m³', p: 0.01, ic95: [-0.05, -0.03], ...resumen };
    },
  };
}
test('pregunta objetivo elige suelo, mueve el mapa y consulta el contrato', async () => {
  const terra = mapa();
  const respuesta = await Detective.investigar('¿Se está secando el norte de México?', { terra });
  assert.deepEqual(terra.llamadas, [['capa', 'suelo'], ['ir', -108, 28.5], ['resumen', -108, 28.5, 'suelo']]);
  assert.match(respuesta, /el suelo se está secando/);
  assert.match(respuesta, /30\.0 % de agua en el suelo/);
  assert.match(respuesta, /10\.0 puntos menos/);
  assert.match(respuesta, /6 caras seguidas/);
});
test('comparación consulta ambos lugares sin presuponer tendencias opuestas', async () => {
  const terra = mapa();
  const r = await Detective.investigar(Detective.SUGERENCIAS[2], { terra });
  assert.equal(terra.llamadas.filter(c => c[0] === 'resumen').length, 2);
  assert.match(r, /Sahel/);
  assert.match(r, /Norte de México/);
  assert.doesNotMatch(r, /se humedece/);
});
test('plan de IA inválido o error recupera el modo guiado', async () => {
  for (const json of [async () => { throw Error('sin conexión'); }, async () => ({ capa: 'inventada', lugares: ['atlantis'] })]) {
    const terra = mapa();
    await Detective.investigar(Detective.SUGERENCIAS[0], { terra, ia: { json } });
    assert.equal(terra.llamadas[0][1], 'suelo');
  }
});
test('IA selecciona evidencia y su texto libre no se usa como respuesta', async () => {
  const terra = mapa();
  const r = await Detective.investigar('investiga mi pregunta', { terra, ia: { json: async prompt => {
    assert.match(prompt, /nunca inventes cifras/);
    return { capa: 'suelo', lugares: ['sahel'], respuesta: 'Se calentó 999 grados' };
  } } });
  assert.match(r, /Sahel/);
  assert.doesNotMatch(r, /999/);
});
test('datos ilustrativos, faltantes y cambios no concluyentes son explícitos', async () => {
  const preguntar = terra => Detective.investigar(Detective.SUGERENCIAS[0], { terra });
  assert.match(await preguntar(mapa({ ilustrativo: true })), /estos datos son de ejemplo/);
  assert.match(await preguntar(mapa({ resumen: { pendiente_decada: null } })), /no tengo datos suficientes/);
  assert.match(await preguntar(mapa({ resumen: { p: 0.4 } })), /No podemos asegurar/);
});
test('no inventa ubicaciones ni mueve el mapa cuando no reconoce la pregunta', async () => {
  const terra = mapa();
  await Detective.investigar('¿Llueve en París?', { terra });
  assert.deepEqual(terra.llamadas, []);
});
test('reporta contrato ausente y no continúa si la capa falla', async () => {
  await assert.rejects(Detective.investigar('pregunta', { terra: {} }), /window.Terra/);
  const terra = mapa({ activar: false });
  await assert.rejects(Detective.investigar(Detective.SUGERENCIAS[0], { terra }), /activar/);
  assert.deepEqual(terra.llamadas, [['capa', 'suelo']]);
});
test('responde en lenguaje sencillo: sin p-valores, m³/m³ ni notación científica', async () => {
  const r = await Detective.investigar(Detective.SUGERENCIAS[0], { terra: mapa({ resumen: { p: 1.9e-9 } }) });
  assert.doesNotMatch(r, /p =|m³\/m³|\de-\d|significativ|intervalo de confianza/i);
  assert.match(r, /más de 10 caras seguidas/);
  assert.match(r, /Ver la prueba completa/);
});

// ---------- Línea de tiempo (años en la pregunta) ----------
function mapaConAnios({ anioInicial = null, pasado = {}, futuro = {} } = {}) {
  const terra = mapa(); let anio = anioInicial;
  terra.anio = () => anio;
  terra.elegirAnio = async y => { terra.llamadas.push(['anio', y]); anio = y; return y; };
  terra.resumenAnio = async (lon, lat, capa, y) => {
    terra.llamadas.push(['resumenAnio', lon, lat, capa, y]);
    const comun = { anio: y, unidad: '°C', base: [2000, 2025], normal: 18.7, lugar: 'Morelos' };
    return y <= 2025 ? { ...comun, tipo: 'pasado', valor: 20.0, ...pasado }
      : { ...comun, tipo: 'proyeccion', valor: 19.6, rango: [19.3, 19.9], seguro: true, veredicto: 'muy', ...futuro };
  };
  return terra;
}
test('reconoce años: «en 2040», «2024», «dentro de N años» y rechaza años fuera de 2000–2050', () => {
  assert.equal(Detective.extraerAnio('¿Cómo será Morelos en 2040?'), 2040);
  assert.equal(Detective.extraerAnio('¿Cómo fue 2024?'), 2024);
  assert.equal(Detective.extraerAnio('lluvia en el Sahel dentro de 15 años', 2026), 2041);
  assert.equal(Detective.extraerAnio('¿Se calienta Morelos?'), undefined);
  assert.ok(Number.isNaN(Detective.extraerAnio('calor en Morelos en 1990')));
  assert.ok(Number.isNaN(Detective.extraerAnio('Morelos en 2080')));
});
test('un año pasado mueve la línea de tiempo y compara con lo normal', async () => {
  const terra = mapaConAnios();
  const r = await Detective.investigar(Detective.SUGERENCIAS[4], { terra });
  assert.deepEqual(terra.llamadas, [['capa', 'temp'], ['anio', 2024], ['ir', -99.07, 18.74], ['resumenAnio', -99.07, 18.74, 'temp', 2024]]);
  assert.match(r, /Morelos, México en 2024/);
  assert.match(r, /20\.0 °C, 1\.3 °C más que lo normal/);
  assert.match(r, /promedio 2000–2025/);
  assert.match(r, /más caliente/);
  assert.match(r, /línea de tiempo/);
  assert.doesNotMatch(r, /pronóstico/);
});
test('un año futuro da la proyección con su rango y aclara que no es un pronóstico', async () => {
  const terra = mapaConAnios();
  const r = await Detective.investigar(Detective.SUGERENCIAS[5], { terra });
  assert.deepEqual(terra.llamadas.find(c => c[0] === 'anio'), ['anio', 2040]);
  assert.match(r, /si la tendencia de 2000–2025 sigue igual/);
  assert.match(r, /unos 19\.6 °C \(entre 19\.3 y 19\.9 °C\)/);
  assert.match(r, /No es un pronóstico/);
  const dudosa = await Detective.investigar(Detective.SUGERENCIAS[5], { terra: mapaConAnios({ futuro: { seguro: false, veredicto: 'no' } }) });
  assert.match(dudosa, /muy dudosa/);
});
test('sin año vuelve a la tendencia; año fuera de rango no mueve el mapa', async () => {
  const terra = mapaConAnios({ anioInicial: 2030 });
  await Detective.investigar('¿Se está calentando Morelos?', { terra });
  assert.deepEqual(terra.llamadas.slice(0, 2), [['capa', 'temp'], ['anio', null]]);
  assert.ok(terra.llamadas.some(c => c[0] === 'resumen'));
  const fuera = mapaConAnios();
  assert.match(await Detective.investigar('¿Cómo será Morelos en 2080?', { terra: fuera }), /2000 a 2050/);
  assert.deepEqual(fuera.llamadas, []);
});
test('año sin datos completos lo dice; la IA puede pedir un año válido', async () => {
  const r = await Detective.investigar('¿Cómo fue 2024 en Morelos?', { terra: mapaConAnios({ pasado: { valor: null } }) });
  assert.match(r, /no hay datos completos/);
  const terra = mapaConAnios();
  await Detective.investigar('dime de Morelos', { terra, ia: { json: async () => ({ capa: 'temp', lugares: ['morelos'], anio: 2035 }) } });
  assert.deepEqual(terra.llamadas.find(c => c[0] === 'resumenAnio'), ['resumenAnio', -99.07, 18.74, 'temp', 2035]);
});

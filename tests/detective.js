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
  assert.match(respuesta, /disminuye/);
  assert.match(respuesta, /-0.04 m³\/m³/);
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
  assert.match(await preguntar(mapa({ ilustrativo: true })), /AVISO: datos ilustrativos/);
  assert.match(await preguntar(mapa({ resumen: { pendiente_decada: null } })), /no hay datos suficientes/);
  assert.match(await preguntar(mapa({ resumen: { p: 0.4 } })), /no permite afirmar/);
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

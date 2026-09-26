/* Pruebas del núcleo de negocio. Ejecutar: node pruebas/nucleo.test.js */
const assert = require('assert');
const Nucleo = require('../backend/Nucleo.js');

function crearDB(hoy) {
  const datos = {};
  Object.keys(Nucleo.ESQUEMA).forEach(t => { datos[t] = []; });
  Object.keys(Nucleo.DATOS_INICIALES).forEach(t => {
    datos[t] = Nucleo.DATOS_INICIALES[t].map(r => Object.assign({}, r));
  });
  return {
    fecha: hoy,
    all: t => datos[t],
    insert(t, o) { const f = {}; Nucleo.ESQUEMA[t].forEach(c => { f[c] = o[c] === undefined ? '' : o[c]; }); datos[t].push(f); return f; },
    update(t, campo, id, cambios) { const r = datos[t].find(x => String(x[campo]) === String(id)); if (!r) throw new Error('no existe'); Object.assign(r, cambios); return r; },
    hoy() { return this.fecha; },
    hora: () => '10:00'
  };
}

const PIN = '1234';
let pruebas = 0;
function api(db, accion, datos, pin = PIN) {
  const r = Nucleo.procesar(db, accion, datos, pin);
  if (!r.ok) throw new Error(accion + ': ' + r.error);
  return r.datos;
}
function prueba(nombre, fn) {
  try { fn(); pruebas++; console.log('✔', nombre); }
  catch (e) { console.error('✘', nombre, '\n ', e.stack); process.exitCode = 1; }
}

prueba('rechaza PIN incorrecto y permite acciones públicas', () => {
  const db = crearDB('2026-01-10');
  const r = Nucleo.procesar(db, 'dashboard', {}, '0000');
  assert.strictEqual(r.ok, false); assert.strictEqual(r.codigo, 'PIN');
  assert.strictEqual(Nucleo.procesar(db, 'ping', {}, '').ok, true);
});

prueba('registra cliente con membresía, código de 4 dígitos y premio de bienvenida', () => {
  const db = crearDB('2026-01-10');
  const r = api(db, 'registrarCliente', { nombre: 'Juan Pérez', telefono: '+57 300 123 4567', plan_id: 'PL-PERSONAL' });
  assert.strictEqual(r.cliente.telefono, '3001234567');
  assert.match(r.membresia.membresia.codigo, /^\d{4}$/);
  assert.strictEqual(r.membresia.membresia.fecha_vencimiento, '2026-02-08');
  assert.strictEqual(r.membresia.premios[0].recompensa_id, 'RW-BIENVENIDA');
  assert.throws(() => api(db, 'registrarCliente', { nombre: 'Otro', telefono: '3001234567' }), /Ya existe/);
});

prueba('visita de miembro: descuento, puntos y premio a la 5ª visita', () => {
  const db = crearDB('2026-01-10');
  const { cliente } = api(db, 'registrarCliente', { nombre: 'Ana', telefono: '3011111111', plan_id: 'PL-PERSONAL' });
  const cot = api(db, 'cotizarVisita', { cliente_id: cliente.cliente_id, servicio_id: 'SV-CORTE' });
  assert.strictEqual(cot.descuento_pct, 15);
  assert.strictEqual(cot.valor_pagado, 12750);
  assert.strictEqual(cot.puntos, 10 + 12);
  let ultima;
  for (let i = 0; i < 5; i++) ultima = api(db, 'registrarVisita', { cliente_id: cliente.cliente_id, servicio_id: 'SV-CORTE' });
  assert.strictEqual(ultima.cliente.total_visitas, 5);
  assert.deepStrictEqual(ultima.premios_nuevos.map(p => p.recompensa_id), ['RW-5VISITAS']);
});

prueba('sube a nivel Plata en la 6ª visita y aplica multiplicador', () => {
  const db = crearDB('2026-01-10');
  const { cliente } = api(db, 'registrarCliente', { nombre: 'Luis', telefono: '3022222222', plan_id: 'PL-PERSONAL' });
  let r;
  for (let i = 0; i < 6; i++) r = api(db, 'registrarVisita', { cliente_id: cliente.cliente_id, servicio_id: 'SV-CORTE' });
  assert.strictEqual(r.sube_nivel, true);
  assert.strictEqual(r.nivel.clave, 'plata');
  assert.ok(r.premios_nuevos.some(p => p.recompensa_id === 'RW-PLATA'));
  assert.strictEqual(r.puntos_ganados, Math.round(22 * 1.25));
});

prueba('no miembro: sin descuento ni puntos, pero se registra la visita', () => {
  const db = crearDB('2026-01-10');
  const { cliente } = api(db, 'registrarCliente', { nombre: 'Pedro', telefono: '3033333333' });
  const r = api(db, 'registrarVisita', { cliente_id: cliente.cliente_id, servicio_id: 'SV-CORTE' });
  assert.strictEqual(r.valor_pagado, 15000);
  assert.strictEqual(r.puntos_ganados, 0);
  assert.strictEqual(r.cliente.ultima_visita, '2026-01-10');
});

prueba('beneficio compartido: cupos, descuento y límite de usos al mes', () => {
  const db = crearDB('2026-01-10');
  const { cliente } = api(db, 'registrarCliente', { nombre: 'María', telefono: '3044444444', plan_id: 'PL-PERSONAL' });
  const b = api(db, 'agregarBeneficiario', { cliente_id: cliente.cliente_id, nombre: 'Hijo de María', parentesco: 'Hijo' });
  assert.throws(() => api(db, 'agregarBeneficiario', { cliente_id: cliente.cliente_id, nombre: 'Otro' }), /permite 1/);
  const v = api(db, 'registrarVisita', { cliente_id: cliente.cliente_id, beneficiario_id: b.beneficiario_id, servicio_id: 'SV-NINO' });
  assert.strictEqual(v.descuento, 1200);
  assert.strictEqual(v.cliente.total_visitas, 0, 'la visita del beneficiario no cuenta como visita del titular');
  assert.ok(v.puntos_ganados > 0, 'los puntos van al titular');
  api(db, 'registrarVisita', { cliente_id: cliente.cliente_id, beneficiario_id: b.beneficiario_id, servicio_id: 'SV-NINO' });
  assert.throws(() => api(db, 'registrarVisita', { cliente_id: cliente.cliente_id, beneficiario_id: b.beneficiario_id, servicio_id: 'SV-NINO' }), /ya usó/);
});

prueba('recordatorios por inactividad escalonados, sin duplicados, y resueltos al volver', () => {
  const db = crearDB('2026-01-01');
  const { cliente } = api(db, 'registrarCliente', { nombre: 'Carlos Ruiz', telefono: '3055555555', plan_id: 'PL-FAMILIAR' });
  api(db, 'registrarVisita', { cliente_id: cliente.cliente_id, servicio_id: 'SV-CORTE' });
  db.fecha = '2026-01-22'; // 21 días
  let r = api(db, 'generarRecordatorios', {});
  assert.strictEqual(r.creados.recordar, 1);
  r = api(db, 'generarRecordatorios', {});
  assert.strictEqual(r.creados.recordar, 0, 'no duplica');
  db.fecha = '2026-02-05'; // 35 días -> riesgo (y la membresía ya venció el 30 de enero)
  r = api(db, 'generarRecordatorios', {});
  assert.strictEqual(r.creados.riesgo, 1);
  assert.strictEqual(r.creados.vencida, 1);
  const pend = api(db, 'listarRecordatorios', {});
  assert.ok(pend[0].link_whatsapp.startsWith('https://wa.me/573055555555?text='));
  // Renueva y vuelve: se aplica el premio de regreso automáticamente
  api(db, 'activarMembresia', { cliente_id: cliente.cliente_id });
  const v = api(db, 'registrarVisita', { cliente_id: cliente.cliente_id, servicio_id: 'SV-CORTE' });
  assert.strictEqual(v.regreso_aplicado, true);
  assert.strictEqual(v.descuento, Math.round(15000 * 0.25));
  const quedan = api(db, 'listarRecordatorios', {}).filter(x => /recordar|riesgo|perdido/.test(x.tipo));
  assert.strictEqual(quedan.length, 0);
});

prueba('renovación conserva código, extiende desde el vencimiento y premia cada 3', () => {
  const db = crearDB('2026-01-01');
  const { cliente, membresia } = api(db, 'registrarCliente', { nombre: 'Sofía', telefono: '3066666666', plan_id: 'PL-VIP' });
  const codigo = membresia.membresia.codigo;
  let r;
  for (let i = 0; i < 3; i++) r = api(db, 'activarMembresia', { cliente_id: cliente.cliente_id });
  assert.strictEqual(r.membresia.codigo, codigo);
  assert.strictEqual(r.membresia.renovaciones, 3);
  assert.strictEqual(r.membresia.fecha_vencimiento, '2026-04-30');
  assert.strictEqual(r.premios[0].recompensa_id, 'RW-RENUEVA3');
  const d = api(db, 'dashboard', {});
  assert.strictEqual(d.miembros_activos, 1);
  assert.strictEqual(d.ingresos_membresias_mes, 90000 * 4);
});

prueba('un premio personal (bienvenida) no se puede regalar', () => {
  const db = crearDB('2026-01-10');
  const { cliente } = api(db, 'registrarCliente', { nombre: 'Andrés', telefono: '3077777777', plan_id: 'PL-PERSONAL' });
  const bienvenida = api(db, 'obtenerCliente', { cliente_id: cliente.cliente_id }).recompensas[0];
  assert.throws(() => api(db, 'transferirRecompensa', { rc_id: bienvenida.rc_id, nombre: 'X', telefono: '3000000000' }), /personal/);
});

prueba('flujo de regalo completo', () => {
  const db = crearDB('2026-01-10');
  const { cliente } = api(db, 'registrarCliente', { nombre: 'Andrés', telefono: '3077777777', plan_id: 'PL-PERSONAL' });
  for (let i = 0; i < 5; i++) api(db, 'registrarVisita', { cliente_id: cliente.cliente_id, servicio_id: 'SV-CORTE' });
  const premio = api(db, 'obtenerCliente', { cliente_id: cliente.cliente_id }).recompensas.find(p => p.recompensa_id === 'RW-5VISITAS');
  const t = api(db, 'transferirRecompensa', { rc_id: premio.rc_id, nombre: 'Camilo Amigo', telefono: '3088888888' });
  assert.match(t.mensaje, new RegExp(premio.codigo));
  assert.strictEqual(t.recompensa.estado, 'transferida');
  // El amigo se registra -> el titular gana puntos por referido
  const antes = api(db, 'obtenerCliente', { cliente_id: cliente.cliente_id }).cliente.puntos;
  const nuevo = api(db, 'registrarCliente', { nombre: 'Camilo Amigo', telefono: '3088888888' });
  assert.strictEqual(nuevo.referido.puntos, 50);
  assert.strictEqual(api(db, 'obtenerCliente', { cliente_id: cliente.cliente_id }).cliente.puntos, antes + 50);
  // Usa el código del regalo en su visita
  const v = api(db, 'registrarVisita', { cliente_id: nuevo.cliente.cliente_id, servicio_id: 'SV-CORTE', codigo_premio: premio.codigo.toLowerCase() });
  assert.strictEqual(v.descuento, 7500);
  assert.throws(() => api(db, 'canjearRecompensa', { codigo: premio.codigo }), /ya fue usado/);
});

prueba('canje por puntos descuenta puntos', () => {
  const db = crearDB('2026-01-10');
  const { cliente } = api(db, 'registrarCliente', { nombre: 'Rosa', telefono: '3099999999', plan_id: 'PL-VIP' });
  assert.throws(() => api(db, 'canjearPuntos', { cliente_id: cliente.cliente_id, recompensa_id: 'RW-CANJE150' }), /faltan/);
  db.update('Clientes', 'cliente_id', cliente.cliente_id, { puntos: 200 });
  const rc = api(db, 'canjearPuntos', { cliente_id: cliente.cliente_id, recompensa_id: 'RW-CANJE150' });
  assert.strictEqual(rc.descuento_pct, 50);
  assert.strictEqual(api(db, 'obtenerCliente', { cliente_id: cliente.cliente_id }).cliente.puntos, 50);
});

prueba('consulta pública del miembro con celular + código', () => {
  const db = crearDB('2026-01-10');
  const { membresia } = api(db, 'registrarCliente', { nombre: 'Laura', telefono: '3101234567', plan_id: 'PL-FAMILIAR' });
  const r = Nucleo.procesar(db, 'consultaMiembro', { telefono: '310 123 4567', codigo: membresia.membresia.codigo }, '');
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.datos.membresia.activa, true);
  assert.strictEqual(r.datos.recompensas.length, 1);
  assert.strictEqual(Nucleo.procesar(db, 'consultaMiembro', { telefono: '3101234567', codigo: '0000' }, '').codigo, 'AUTH');
});

prueba('cumpleaños: regalo solo una vez al año', () => {
  const db = crearDB('2026-03-15');
  api(db, 'registrarCliente', { nombre: 'Diana', telefono: '3111111111', fecha_nacimiento: '1990-03-15', plan_id: 'PL-PERSONAL' });
  assert.strictEqual(api(db, 'generarRecordatorios', {}).creados.cumpleanos, 1);
  assert.strictEqual(api(db, 'generarRecordatorios', {}).creados.cumpleanos, 0);
});

console.log(`\n${pruebas} pruebas OK`);

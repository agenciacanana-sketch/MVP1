/* Ejecuta BaseDatos.gs + Codigo.gs contra un Google Sheets simulado. node pruebas/gas-simulado.test.js */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const hojas = {};
function Hoja(nombre) {
  this.v = []; this.max = 1000; this.nombre = nombre;
}
Hoja.prototype = {
  getLastRow() { let n = this.v.length; while (n && this.v[n - 1].every(x => x === '')) n--; return n; },
  getLastColumn() { return this.v.reduce((m, f) => Math.max(m, f.length), 0); },
  getMaxRows() { return this.max; },
  insertRowsAfter(_, n) { this.max += n; },
  getRange(f, c, nf = 1, nc = 1) {
    const h = this;
    return {
      getValues() { return Array.from({ length: nf }, (_, i) => Array.from({ length: nc }, (_, j) => ((h.v[f - 1 + i] || [])[c - 1 + j]) ?? '')); },
      setValues(vals) { vals.forEach((fila, i) => { const r = h.v[f - 1 + i] || (h.v[f - 1 + i] = []); fila.forEach((x, j) => { while (r.length < c - 1 + j) r.push(''); r[c - 1 + j] = x; }); }); return this; },
      setValue(x) { return this.setValues([[x]]); },
      setNumberFormat() { return this; }, setNumberFormats() { return this; }, setFontWeight() { return this; },
      setBackground() { return this; }, setFontColor() { return this; }
    };
  },
  getDataRange() { const h = this; return { getValues() { const nc = h.getLastColumn(); return h.v.slice(0, h.getLastRow()).map(f => Array.from({ length: nc }, (_, j) => f[j] ?? '')); } }; },
  setFrozenRows() {}, autoResizeColumns() {}
};
const libro = {
  getId: () => 'LIBRO', setSpreadsheetTimeZone() {},
  getSheetByName: n => hojas[n] || null, insertSheet: n => (hojas[n] = new Hoja(n)),
  getSheets: () => Object.values(hojas), deleteSheet() {}
};
const props = {};
const ctx = {
  console, JSON, Date, Math, Object, String, Number, Array, Error, RegExp, isFinite, encodeURIComponent,
  SpreadsheetApp: { getActiveSpreadsheet: () => libro, openById: () => libro },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  Utilities: { formatDate: (d, tz, f) => f === 'HH:mm' ? '09:15' : '2026-09-25' },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
  ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ inTimezone: () => ({ create() {} }) }) }) }) }) },
  ContentService: { MimeType: { JSON: 'json', JAVASCRIPT: 'js' }, createTextOutput: t => ({ t, setMimeType() { return this; } }) },
  HtmlService: { createHtmlOutput: h => h }
};
vm.createContext(ctx);
['Nucleo.js', 'BaseDatos.gs', 'Codigo.gs', 'Automatizacion.gs'].forEach(f => vm.runInContext(fs.readFileSync('backend/' + f, 'utf8'), ctx, { filename: f }));

ctx.instalar();
assert.ok(hojas.Clientes && hojas.Planes.getLastRow() === 4, 'hojas y semillas creadas');
ctx.instalar(); // idempotente
assert.strictEqual(hojas.Planes.getLastRow(), 4, 'no duplica semillas');

const post = (accion, datos, pin = '1234') => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ accion, datos, pin }) } }).t);
let r = post('registrarCliente', { nombre: 'Ana Prueba', telefono: '3001112222', plan_id: 'PL-PERSONAL' });
assert.ok(r.ok, r.error);
const id = r.datos.cliente.cliente_id;
r = post('registrarVisita', { cliente_id: id, servicio_id: 'SV-CORTE', profesional: 'Carlos' });
assert.ok(r.ok, r.error);
assert.strictEqual(r.datos.valor_pagado, 12750);
// Simula que Sheets devuelve el teléfono como número y la fecha como Date
const col = hojas.Clientes.v[0].indexOf('telefono');
hojas.Clientes.v[1][col] = 3001112222;
r = post('obtenerCliente', { cliente_id: id });
assert.ok(r.ok, r.error);
assert.strictEqual(r.datos.cliente.telefono, '3001112222');
assert.strictEqual(r.datos.cliente.total_visitas, 1);
assert.strictEqual(post('dashboard', {}, '0000').codigo, 'PIN');
assert.ok(JSON.parse(ctx.doGet({ parameter: { accion: 'ping' } }).t).ok);
assert.strictEqual(typeof ctx.tareaDiaria().total, 'number');
console.log('✔ backend Apps Script simulado OK');

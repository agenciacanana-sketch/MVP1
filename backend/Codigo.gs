/**
 * ============================================================================
 *  API WEB (doGet / doPost) — Club de Membresías
 *
 *  Publicar: Implementar > Nueva implementación > Aplicación web
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquier usuario
 *
 *  Petición (desde GitHub Pages):
 *    POST <URL>/exec   Content-Type: text/plain
 *    { "accion": "registrarVisita", "pin": "1234", "datos": { ... } }
 *
 *  Respuesta:
 *    { "ok": true, "datos": ... }   ó   { "ok": false, "error": "...", "codigo": "PIN" }
 * ============================================================================
 */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.accion) {
    return HtmlService.createHtmlOutput(
      '<meta name="viewport" content="width=device-width">' +
      '<h2 style="font-family:sans-serif">✅ API del Club de Membresías funcionando</h2>' +
      '<p style="font-family:sans-serif">Copia la URL de esta página (termina en <b>/exec</b>) y pégala en ' +
      'la app, en <b>Ajustes → URL del servidor</b>.</p>');
  }
  var datos = {};
  try { datos = p.datos ? JSON.parse(p.datos) : {}; } catch (err) { datos = {}; }
  return responder_(atender_(p.accion, datos, p.pin), p.callback);
}

function doPost(e) {
  var cuerpo = {};
  try { cuerpo = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return responder_({ ok: false, error: 'JSON inválido', codigo: 'JSON' }); }
  return responder_(atender_(cuerpo.accion, cuerpo.datos || {}, cuerpo.pin));
}

/** Seguridad básica + bloqueo de escritura + ejecución de la acción. */
function atender_(accion, datos, pin) {
  var cache = CacheService.getScriptCache();
  var intentos = Number(cache.get('fallos') || 0);
  if (intentos >= 15) {
    return { ok: false, error: 'Demasiados intentos fallidos. Espera 10 minutos.', codigo: 'BLOQUEO' };
  }

  var lock = null;
  if (Nucleo.esEscritura(accion)) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return { ok: false, error: 'El sistema está ocupado, intenta de nuevo.', codigo: 'OCUPADO' };
  }
  try {
    var r = Nucleo.procesar(crearAdaptadorSheets(), accion, datos, pin);
    if (!r.ok && (r.codigo === 'PIN' || r.codigo === 'AUTH')) cache.put('fallos', String(intentos + 1), 600);
    return r;
  } catch (err) {
    return { ok: false, error: String(err && err.message || err), codigo: 'SERVIDOR' };
  } finally {
    if (lock) lock.releaseLock();
  }
}

function responder_(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback && /^[\w.]+$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/** Menú en la hoja de cálculo para dueños que prefieren no abrir el editor. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('💈 Membresías')
    .addItem('1. Instalar / reparar hojas', 'menuInstalar_')
    .addItem('Generar recordatorios ahora', 'menuRecordatorios_')
    .addItem('Enviarme el resumen por correo', 'enviarResumenDiario')
    .addToUi();
}
function menuInstalar_() { SpreadsheetApp.getUi().alert(instalar()); }
function menuRecordatorios_() {
  var r = tareaDiaria();
  SpreadsheetApp.getUi().alert('Recordatorios nuevos: ' + r.total + '\nRevisa la hoja "Recordatorios" o la app.');
}

/**
 * ============================================================================
 *  AUTOMATIZACIÓN: recordatorios por inactividad (disparador diario)
 * ============================================================================
 */

/** Crea (una sola vez) el disparador que corre todos los días a las 7 a.m. */
function instalarDisparadores() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'tareaDiaria') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('tareaDiaria').timeBased().everyDays(1).atHour(7).inTimezone(ZONA_HORARIA).create();
}

/**
 * Se ejecuta cada mañana:
 *  - Recalcula segmentos (al día / recordar / en riesgo / perdido).
 *  - Crea recordatorios con su enlace de WhatsApp listo para enviar.
 *  - Marca membresías y premios vencidos, y felicita cumpleaños.
 *  - Si hay EMAIL_DUENO en Config, envía un resumen por correo.
 */
function tareaDiaria() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var resultado;
  try {
    var ctx = Nucleo.crearContexto(crearAdaptadorSheets());
    resultado = Nucleo.generarRecordatorios(ctx);
  } finally {
    lock.releaseLock();
  }
  try { enviarResumenDiario(); } catch (e) { console.warn('No se pudo enviar el correo: ' + e); }
  return resultado;
}

/** Correo corto para el dueño con los clientes a contactar hoy. */
function enviarResumenDiario() {
  var ctx = Nucleo.crearContexto(crearAdaptadorSheets());
  var email = ctx.cfg.EMAIL_DUENO;
  if (!email) return 'Sin EMAIL_DUENO configurado.';
  var d = Nucleo.dashboard(ctx);
  var pendientes = ctx.db.all('Recordatorios').filter(function (r) { return r.estado === 'pendiente'; });
  if (!pendientes.length) return 'Nada pendiente.';

  var filas = pendientes.slice(0, 40).map(function (r) {
    return '<tr><td>' + r.nombre + '</td><td>' + (Nucleo.TIPOS_RECORDATORIO[r.tipo] || {}).etiqueta +
      '</td><td>' + (r.dias_sin_visita || '') + '</td><td><a href="' + r.link_whatsapp + '">Enviar WhatsApp</a></td></tr>';
  }).join('');
  var html = '<div style="font-family:sans-serif">' +
    '<h2>💈 ' + d.negocio + ' — resumen del ' + d.hoy + '</h2>' +
    '<p><b>' + d.miembros_activos + ' / ' + d.meta + '</b> miembros activos (' + d.progreso_meta + '% de la meta). ' +
    'En riesgo: <b>' + (d.segmentos.riesgo + d.segmentos.perdido) + '</b>.</p>' +
    '<p>Tienes <b>' + pendientes.length + '</b> clientes para contactar hoy:</p>' +
    '<table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Cliente</th><th>Motivo</th><th>Días</th><th></th></tr>' +
    filas + '</table></div>';
  MailApp.sendEmail({ to: email, subject: '💈 ' + pendientes.length + ' clientes para contactar hoy', htmlBody: html });
  return 'Correo enviado a ' + email;
}

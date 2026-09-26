/**
 * ============================================================================
 *  BASE DE DATOS EN GOOGLE SHEETS
 *  - instalar(): crea las hojas, encabezados, formatos y datos iniciales.
 *  - crearAdaptadorSheets(): implementa la interfaz `db` que usa Nucleo.
 * ============================================================================
 */
var ZONA_HORARIA = 'America/Bogota';

function libro_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function esNumerica_(col) { return Nucleo.COLUMNAS_NUMERICAS.indexOf(col) >= 0; }

/**
 * PASO 1 DE LA INSTALACIÓN. Ejecutar una vez desde el editor de Apps Script
 * (o desde el menú "💈 Membresías" de la hoja). Es seguro repetirlo:
 * no borra datos, solo crea lo que falte.
 */
function instalar() {
  var ss = libro_();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  ss.setSpreadsheetTimeZone(ZONA_HORARIA);

  Object.keys(Nucleo.ESQUEMA).forEach(function (tabla) {
    var columnas = Nucleo.ESQUEMA[tabla];
    var hoja = ss.getSheetByName(tabla) || ss.insertSheet(tabla);
    var ultimaCol = hoja.getLastColumn();
    var actuales = ultimaCol ? hoja.getRange(1, 1, 1, ultimaCol).getValues()[0].map(String) : [];

    if (!actuales.filter(String).length) {
      hoja.getRange(1, 1, 1, columnas.length).setValues([columnas]);
    } else {
      // Migración suave: agrega al final las columnas nuevas que falten.
      columnas.forEach(function (c) {
        if (actuales.indexOf(c) < 0) {
          hoja.getRange(1, hoja.getLastColumn() + 1).setValue(c);
          actuales.push(c);
        }
      });
    }
    var encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
    hoja.getRange(1, 1, 1, encabezados.length)
      .setFontWeight('bold').setBackground('#1f3a4d').setFontColor('#ffffff');
    hoja.setFrozenRows(1);
    // Texto plano para evitar que Sheets convierta teléfonos, códigos y fechas.
    encabezados.forEach(function (c, i) {
      var rango = hoja.getRange(2, i + 1, Math.max(hoja.getMaxRows() - 1, 1), 1);
      rango.setNumberFormat(esNumerica_(c) ? '0' : '@');
    });

    var semilla = Nucleo.DATOS_INICIALES[tabla];
    if (semilla && hoja.getLastRow() < 2) {
      var filas = semilla.map(function (o) {
        return encabezados.map(function (c) { return o[c] === undefined ? '' : o[c]; });
      });
      hoja.getRange(2, 1, filas.length, encabezados.length).setValues(filas);
    }
    hoja.autoResizeColumns(1, Math.min(encabezados.length, 6));
  });

  var sobrante = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (sobrante && ss.getSheets().length > 1 && sobrante.getLastRow() === 0) ss.deleteSheet(sobrante);

  instalarDisparadores();
  return 'Listo. Hojas creadas y recordatorio diario programado.';
}

/** Adaptador `db` sobre Google Sheets con caché por petición. */
function crearAdaptadorSheets() {
  var ss = libro_();
  var cache = {};

  function convertir_(valor, col) {
    if (valor instanceof Date) {
      return Utilities.formatDate(valor, ZONA_HORARIA, col === 'hora' ? 'HH:mm' : 'yyyy-MM-dd');
    }
    if (esNumerica_(col)) return valor === '' ? 0 : Number(valor);
    return valor === null || valor === undefined ? '' : String(valor);
  }

  function cargar_(tabla) {
    if (cache[tabla]) return cache[tabla];
    var hoja = ss.getSheetByName(tabla);
    if (!hoja) throw new Error('Falta la hoja "' + tabla + '". Ejecuta instalar().');
    var valores = hoja.getDataRange().getValues();
    var encabezados = (valores.shift() || []).map(String);
    var filas = [];
    valores.forEach(function (fila, i) {
      if (fila.join('') === '') return;
      var o = {};
      encabezados.forEach(function (c, j) { if (c) o[c] = convertir_(fila[j], c); });
      Object.defineProperty(o, '_fila', { value: i + 2, enumerable: false, writable: true });
      filas.push(o);
    });
    cache[tabla] = { hoja: hoja, encabezados: encabezados, filas: filas };
    return cache[tabla];
  }

  function aFila_(t, o) {
    return t.encabezados.map(function (c) { return o[c] === undefined || o[c] === null ? '' : o[c]; });
  }
  function formatos_(t) {
    return [t.encabezados.map(function (c) { return esNumerica_(c) ? '0' : '@'; })];
  }

  return {
    all: function (tabla) { return cargar_(tabla).filas; },

    insert: function (tabla, obj) {
      var t = cargar_(tabla);
      var o = {};
      Nucleo.ESQUEMA[tabla].forEach(function (c) { o[c] = obj[c] === undefined ? '' : obj[c]; });
      var fila = t.hoja.getLastRow() + 1;
      if (fila > t.hoja.getMaxRows()) t.hoja.insertRowsAfter(t.hoja.getMaxRows(), 200);
      var rango = t.hoja.getRange(fila, 1, 1, t.encabezados.length);
      rango.setNumberFormats(formatos_(t));
      rango.setValues([aFila_(t, o)]);
      Object.defineProperty(o, '_fila', { value: fila, enumerable: false, writable: true });
      t.filas.push(o);
      return o;
    },

    update: function (tabla, campoId, id, cambios) {
      var t = cargar_(tabla);
      var o = null;
      for (var i = 0; i < t.filas.length; i++) {
        if (String(t.filas[i][campoId]) === String(id)) { o = t.filas[i]; break; }
      }
      if (!o) throw new Error('No existe ' + tabla + ' ' + id);
      Object.keys(cambios).forEach(function (k) { o[k] = cambios[k]; });
      var rango = t.hoja.getRange(o._fila, 1, 1, t.encabezados.length);
      rango.setNumberFormats(formatos_(t));
      rango.setValues([aFila_(t, o)]);
      return o;
    },

    hoy: function () { return Utilities.formatDate(new Date(), ZONA_HORARIA, 'yyyy-MM-dd'); },
    hora: function () { return Utilities.formatDate(new Date(), ZONA_HORARIA, 'HH:mm'); }
  };
}

/**
 * ============================================================================
 *  NÚCLEO DE NEGOCIO — Club de Membresías para Barberías y Salones
 * ============================================================================
 *  Este archivo es COMPARTIDO:
 *    - En Google Apps Script se pega como "Nucleo.gs" (backend real, Sheets).
 *    - En el navegador lo carga index.html (modo demostración, localStorage).
 *
 *  Toda la lógica (membresías, beneficios compartidos, puntos, niveles,
 *  recompensas escalonadas, recordatorios por inactividad y referidos) vive
 *  aquí una sola vez. Cada entorno solo aporta un "adaptador" de datos `db`:
 *
 *    db.all(tabla)                         -> Array<Object>
 *    db.insert(tabla, objeto)              -> Object insertado
 *    db.update(tabla, campoId, id, cambios)-> Object actualizado
 *    db.hoy()                              -> 'yyyy-mm-dd' (hora Colombia)
 *    db.hora()                             -> 'HH:mm'
 * ============================================================================
 */
var Nucleo = (function () {
  'use strict';

  var VERSION = '1.0.0';

  // --------------------------------------------------------------------------
  // 1. MODELO DE DATOS (una hoja de Google Sheets por tabla)
  // --------------------------------------------------------------------------
  var ESQUEMA = {
    Config: ['clave', 'valor', 'descripcion'],
    Planes: ['plan_id', 'nombre', 'precio_mensual', 'cupos_beneficiarios', 'usos_mes_beneficiario',
      'descuento_titular_pct', 'descuento_beneficiario_pct', 'beneficios', 'activo'],
    Servicios: ['servicio_id', 'nombre', 'categoria', 'precio', 'duracion_min', 'activo'],
    Clientes: ['cliente_id', 'nombre', 'telefono', 'fecha_nacimiento', 'genero', 'barrio',
      'servicio_favorito', 'fecha_registro', 'referido_por', 'puntos', 'nivel', 'total_visitas',
      'total_gastado', 'ultima_visita', 'segmento', 'acepta_whatsapp', 'notas'],
    Membresias: ['membresia_id', 'cliente_id', 'plan_id', 'codigo', 'fecha_inicio', 'fecha_vencimiento',
      'fecha_pago', 'valor_pagado', 'metodo_pago', 'estado', 'renovaciones'],
    Beneficiarios: ['beneficiario_id', 'titular_id', 'nombre', 'telefono', 'parentesco', 'fecha_alta',
      'ultima_visita', 'estado'],
    Visitas: ['visita_id', 'fecha', 'hora', 'cliente_id', 'beneficiario_id', 'atendido_nombre',
      'servicio_id', 'servicio_nombre', 'profesional', 'valor_lista', 'descuento_pct', 'descuento',
      'valor_pagado', 'metodo_pago', 'puntos_ganados', 'recompensa_usada', 'notas'],
    Recompensas: ['recompensa_id', 'nombre', 'descripcion', 'tipo', 'umbral', 'nivel', 'descuento_pct',
      'transferible', 'vigencia_dias', 'activo'],
    RecompensasCliente: ['rc_id', 'cliente_id', 'recompensa_id', 'nombre', 'codigo', 'descuento_pct',
      'fecha_otorgada', 'fecha_vence', 'origen', 'estado', 'transferida_a_nombre', 'transferida_a_tel',
      'canjeada_por', 'fecha_canje'],
    Recordatorios: ['recordatorio_id', 'fecha', 'cliente_id', 'nombre', 'telefono', 'tipo', 'clave',
      'dias_sin_visita', 'mensaje', 'link_whatsapp', 'estado', 'fecha_envio'],
    Referidos: ['referido_id', 'fecha', 'titular_id', 'nombre', 'telefono', 'origen', 'estado',
      'cliente_id', 'bono_otorgado']
  };

  var COLUMNAS_NUMERICAS = ['precio_mensual', 'cupos_beneficiarios', 'usos_mes_beneficiario',
    'descuento_titular_pct', 'descuento_beneficiario_pct', 'precio', 'duracion_min', 'puntos',
    'total_visitas', 'total_gastado', 'valor_pagado', 'renovaciones', 'valor_lista', 'descuento_pct',
    'descuento', 'puntos_ganados', 'umbral', 'vigencia_dias', 'dias_sin_visita', 'bono_otorgado'];

  var CONFIG_POR_DEFECTO = {
    NOMBRE_NEGOCIO: 'Mi Barbería',
    PIN_DUENO: '1234',
    WHATSAPP_NEGOCIO: '',
    EMAIL_DUENO: '',
    PROFESIONALES: 'Carlos, Yuli',
    META_MIEMBROS: 40,
    DURACION_MEMBRESIA_DIAS: 30,
    DIAS_RECORDAR: 21,
    DIAS_RIESGO: 35,
    DIAS_PERDIDO: 60,
    DIAS_AVISO_VENCIMIENTO: 3,
    PUNTOS_POR_VISITA: 10,
    PUNTOS_POR_MIL: 1,
    PUNTOS_REFERIDO: 50
  };

  var DESCRIPCION_CONFIG = {
    NOMBRE_NEGOCIO: 'Nombre que verán tus clientes en los mensajes',
    PIN_DUENO: 'Clave para entrar a la app (cámbiala, mínimo 4 números)',
    WHATSAPP_NEGOCIO: 'WhatsApp del negocio, ej: 3001234567',
    EMAIL_DUENO: 'Correo para recibir el resumen diario (opcional)',
    PROFESIONALES: 'Nombres de quienes atienden, separados por coma',
    META_MIEMBROS: 'Meta de clientes con membresía activa al mes',
    DURACION_MEMBRESIA_DIAS: 'Días que dura cada membresía pagada',
    DIAS_RECORDAR: 'Días sin venir para enviar un recordatorio amable',
    DIAS_RIESGO: 'Días sin venir para considerar al cliente EN RIESGO',
    DIAS_PERDIDO: 'Días sin venir para considerar al cliente PERDIDO',
    DIAS_AVISO_VENCIMIENTO: 'Días antes de vencer la membresía para avisar',
    PUNTOS_POR_VISITA: 'Puntos fijos por cada visita de un miembro',
    PUNTOS_POR_MIL: 'Puntos extra por cada $1.000 pagados',
    PUNTOS_REFERIDO: 'Puntos que gana un miembro cuando un amigo suyo se registra'
  };

  // Niveles escalonados por número de visitas del titular.
  var NIVELES = [
    { clave: 'bronce', nombre: 'Bronce', min: 0, multiplicador: 1, icono: '🥉' },
    { clave: 'plata', nombre: 'Plata', min: 6, multiplicador: 1.25, icono: '🥈' },
    { clave: 'oro', nombre: 'Oro', min: 15, multiplicador: 1.5, icono: '🥇' },
    { clave: 'diamante', nombre: 'Diamante', min: 30, multiplicador: 2, icono: '💎' }
  ];

  var SEGMENTOS = {
    perdido: { etiqueta: 'Perdido', color: 'rojo', orden: 0 },
    riesgo: { etiqueta: 'En riesgo', color: 'naranja', orden: 1 },
    recordar: { etiqueta: 'Recordar', color: 'amarillo', orden: 2 },
    al_dia: { etiqueta: 'Al día', color: 'verde', orden: 3 },
    nuevo: { etiqueta: 'Sin visitas', color: 'gris', orden: 4 }
  };

  var TIPOS_RECORDATORIO = {
    recordar: { etiqueta: 'Recordatorio amable', prioridad: 3 },
    riesgo: { etiqueta: 'Cliente en riesgo', prioridad: 1 },
    perdido: { etiqueta: 'Cliente perdido', prioridad: 2 },
    vence: { etiqueta: 'Membresía por vencer', prioridad: 0 },
    vencida: { etiqueta: 'Membresía vencida', prioridad: 0 },
    cumpleanos: { etiqueta: 'Cumpleaños', prioridad: 0 }
  };

  var PLANTILLAS = {
    recordar: '¡Hola {nombre}! 👋 Te saluda {negocio}. Ya van {dias} días desde tu última visita. ¿Te apartamos un turno esta semana? ✂️',
    riesgo: '¡{nombre}, te extrañamos en {negocio}! 💈 Hace {dias} días no te vemos. Si vienes esta semana tienes {premio}. ¿Qué día te queda bien?',
    perdido: 'Hola {nombre}, en {negocio} te guardamos la silla 🪑. Queremos verte de nuevo: vuelve y recibe {premio}. ¡Te esperamos!',
    vence: 'Hola {nombre} 🙌 Tu {plan} en {negocio} vence el {fecha}. Renuévala y sigue disfrutando tus descuentos y los de tu familia.',
    vencida: 'Hola {nombre}, tu {plan} en {negocio} venció el {fecha}. Renuévala para recuperar tus descuentos, seguir sumando puntos ({puntos} acumulados) y los beneficios de tus familiares.',
    cumpleanos: '🎉 ¡Feliz cumpleaños, {nombre}! Todo el equipo de {negocio} te tiene un regalo: {premio}. ¡Ven a reclamarlo!',
    regalo: '🎁 Hola {nombre}, {titular} te regaló "{premio}" en {negocio}. Presenta el código *{codigo}* antes del {fecha}. ¡Te esperamos!',
    invitacion: 'Hola {nombre} 👋 {titular} te invita a {negocio}. En tu primera visita di que vienes de su parte y ambos reciben beneficios. 💈',
    bienvenida: '¡Bienvenido(a) al club de {negocio}, {nombre}! 🎉 Tu código de miembro es *{codigo}*. Con él puedes consultar tus puntos y premios.'
  };

  var DATOS_INICIALES = {
    Planes: [
      { plan_id: 'PL-PERSONAL', nombre: 'Membresía Personal', precio_mensual: 35000, cupos_beneficiarios: 1,
        usos_mes_beneficiario: 2, descuento_titular_pct: 15, descuento_beneficiario_pct: 10,
        beneficios: '15% en todos tus servicios · 1 familiar o amigo con 10% · Puntos y premios por visita', activo: 'si' },
      { plan_id: 'PL-FAMILIAR', nombre: 'Membresía Familiar', precio_mensual: 60000, cupos_beneficiarios: 3,
        usos_mes_beneficiario: 3, descuento_titular_pct: 20, descuento_beneficiario_pct: 15,
        beneficios: '20% para ti · 3 familiares o amigos con 15% · Puntos por las visitas de todos', activo: 'si' },
      { plan_id: 'PL-VIP', nombre: 'Membresía VIP', precio_mensual: 90000, cupos_beneficiarios: 4,
        usos_mes_beneficiario: 0, descuento_titular_pct: 25, descuento_beneficiario_pct: 20,
        beneficios: '25% para ti · 4 acompañantes con 20% sin límite · Prioridad en agenda · Bebida de cortesía', activo: 'si' }
    ],
    Servicios: [
      { servicio_id: 'SV-CORTE', nombre: 'Corte caballero', categoria: 'Barbería', precio: 15000, duracion_min: 30, activo: 'si' },
      { servicio_id: 'SV-BARBA', nombre: 'Arreglo de barba', categoria: 'Barbería', precio: 8000, duracion_min: 20, activo: 'si' },
      { servicio_id: 'SV-CORTEBARBA', nombre: 'Corte + barba', categoria: 'Barbería', precio: 20000, duracion_min: 45, activo: 'si' },
      { servicio_id: 'SV-NINO', nombre: 'Corte niño', categoria: 'Barbería', precio: 12000, duracion_min: 25, activo: 'si' },
      { servicio_id: 'SV-CEJAS', nombre: 'Cejas', categoria: 'Estética', precio: 8000, duracion_min: 15, activo: 'si' },
      { servicio_id: 'SV-CEPILLADO', nombre: 'Lavado y cepillado', categoria: 'Salón', precio: 20000, duracion_min: 40, activo: 'si' },
      { servicio_id: 'SV-CORTEDAMA', nombre: 'Corte dama', categoria: 'Salón', precio: 25000, duracion_min: 45, activo: 'si' },
      { servicio_id: 'SV-TINTE', nombre: 'Tinte', categoria: 'Salón', precio: 50000, duracion_min: 90, activo: 'si' },
      { servicio_id: 'SV-MANOS', nombre: 'Manicure', categoria: 'Uñas', precio: 15000, duracion_min: 40, activo: 'si' },
      { servicio_id: 'SV-PIES', nombre: 'Pedicure', categoria: 'Uñas', precio: 18000, duracion_min: 45, activo: 'si' }
    ],
    Recompensas: [
      { recompensa_id: 'RW-BIENVENIDA', nombre: 'Bienvenida: 10% extra', descripcion: 'Descuento de bienvenida para tu próxima visita', tipo: 'bienvenida', umbral: 0, nivel: '', descuento_pct: 10, transferible: 'no', vigencia_dias: 30, activo: 'si' },
      { recompensa_id: 'RW-5VISITAS', nombre: 'Servicio a mitad de precio', descripcion: 'Premio cada 5 visitas', tipo: 'visitas', umbral: 5, nivel: '', descuento_pct: 50, transferible: 'si', vigencia_dias: 45, activo: 'si' },
      { recompensa_id: 'RW-10VISITAS', nombre: 'Servicio GRATIS', descripcion: 'Premio cada 10 visitas', tipo: 'visitas', umbral: 10, nivel: '', descuento_pct: 100, transferible: 'si', vigencia_dias: 60, activo: 'si' },
      { recompensa_id: 'RW-PLATA', nombre: 'Subiste a Plata: 30%', descripcion: 'Regalo por llegar a nivel Plata', tipo: 'nivel', umbral: 0, nivel: 'plata', descuento_pct: 30, transferible: 'si', vigencia_dias: 30, activo: 'si' },
      { recompensa_id: 'RW-ORO', nombre: 'Subiste a Oro: servicio gratis', descripcion: 'Regalo por llegar a nivel Oro', tipo: 'nivel', umbral: 0, nivel: 'oro', descuento_pct: 100, transferible: 'si', vigencia_dias: 45, activo: 'si' },
      { recompensa_id: 'RW-DIAMANTE', nombre: 'Diamante: servicio gratis', descripcion: 'Regalo por llegar a nivel Diamante', tipo: 'nivel', umbral: 0, nivel: 'diamante', descuento_pct: 100, transferible: 'si', vigencia_dias: 60, activo: 'si' },
      { recompensa_id: 'RW-CUMPLE', nombre: 'Cumpleaños: servicio gratis', descripcion: 'Regalo de cumpleaños (15 días para usarlo)', tipo: 'cumpleanos', umbral: 0, nivel: '', descuento_pct: 100, transferible: 'no', vigencia_dias: 15, activo: 'si' },
      { recompensa_id: 'RW-REGRESO', nombre: '25% por volver', descripcion: 'Se aplica solo cuando un miembro en riesgo regresa', tipo: 'regreso', umbral: 0, nivel: '', descuento_pct: 25, transferible: 'no', vigencia_dias: 15, activo: 'si' },
      { recompensa_id: 'RW-REFERIDO', nombre: 'Gracias por referir: 20%', descripcion: 'Cuando un amigo tuyo se registra', tipo: 'referido', umbral: 0, nivel: '', descuento_pct: 20, transferible: 'si', vigencia_dias: 45, activo: 'si' },
      { recompensa_id: 'RW-RENUEVA3', nombre: 'Fidelidad: 50% por 3 renovaciones', descripcion: 'Cada 3 renovaciones seguidas', tipo: 'renovacion', umbral: 3, nivel: '', descuento_pct: 50, transferible: 'si', vigencia_dias: 45, activo: 'si' },
      { recompensa_id: 'RW-CANJE150', nombre: 'Canje: 50% en un servicio', descripcion: 'Cámbialo por 150 puntos', tipo: 'puntos', umbral: 150, nivel: '', descuento_pct: 50, transferible: 'si', vigencia_dias: 30, activo: 'si' },
      { recompensa_id: 'RW-CANJE300', nombre: 'Canje: servicio GRATIS', descripcion: 'Cámbialo por 300 puntos', tipo: 'puntos', umbral: 300, nivel: '', descuento_pct: 100, transferible: 'si', vigencia_dias: 30, activo: 'si' }
    ]
  };
  DATOS_INICIALES.Config = Object.keys(CONFIG_POR_DEFECTO).map(function (k) {
    return { clave: k, valor: CONFIG_POR_DEFECTO[k], descripcion: DESCRIPCION_CONFIG[k] || '' };
  });

  // --------------------------------------------------------------------------
  // 2. UTILIDADES
  // --------------------------------------------------------------------------
  function texto(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function esSi(v) { return /^(si|sí|true|1|x|s)$/i.test(texto(v)); }

  function falla(mensaje, codigo) {
    var e = new Error(mensaje);
    e.codigo = codigo || 'NEGOCIO';
    throw e;
  }
  function requerido(valor, mensaje) { if (!valor) falla(mensaje); return valor; }

  function nuevoId(prefijo) {
    return prefijo + '-' + Date.now().toString(36).toUpperCase() +
      Math.random().toString(36).slice(2, 6).toUpperCase();
  }
  function codigoAleatorio(largo, alfabeto) {
    var abc = alfabeto || 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var s = '';
    for (var i = 0; i < largo; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
    return s;
  }

  function normalizarTelefono(t) {
    var d = texto(t).replace(/\D/g, '');
    if (d.length === 12 && d.indexOf('57') === 0) d = d.slice(2);
    return d;
  }
  function linkWhatsApp(telefono, mensaje) {
    var d = normalizarTelefono(telefono);
    if (!d) return '';
    if (d.length === 10) d = '57' + d; // Colombia
    return 'https://wa.me/' + d + '?text=' + encodeURIComponent(mensaje || '');
  }
  function plantilla(nombre, vars) {
    return (PLANTILLAS[nombre] || '').replace(/\{(\w+)\}/g, function (_, k) {
      return vars[k] !== undefined && vars[k] !== null ? vars[k] : '';
    });
  }
  function primerNombre(n) { return texto(n).split(/\s+/)[0] || ''; }

  // Fechas como texto 'yyyy-mm-dd' (independiente de zona horaria).
  function esFecha(f) { return /^\d{4}-\d{2}-\d{2}/.test(texto(f)); }
  function aMs(f) { var p = texto(f).slice(0, 10).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function diasEntre(desde, hasta) { return Math.round((aMs(hasta) - aMs(desde)) / 864e5); }
  function sumarDias(f, n) { return new Date(aMs(f) + n * 864e5).toISOString().slice(0, 10); }
  function fechaLarga(f) {
    if (!esFecha(f)) return '';
    var meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    var p = f.slice(0, 10).split('-');
    return (+p[2]) + ' de ' + meses[+p[1] - 1];
  }

  function buscar(db, tabla, campo, valor) {
    var v = String(valor);
    var filas = db.all(tabla);
    for (var i = 0; i < filas.length; i++) if (String(filas[i][campo]) === v) return filas[i];
    return null;
  }
  function filtrar(db, tabla, fn) { return db.all(tabla).filter(fn); }
  function activos(db, tabla) { return filtrar(db, tabla, function (r) { return texto(r.activo) === '' || esSi(r.activo); }); }

  // --------------------------------------------------------------------------
  // 3. REGLAS DE FIDELIZACIÓN (funciones puras)
  // --------------------------------------------------------------------------
  function leerConfig(db) {
    var cfg = {};
    Object.keys(CONFIG_POR_DEFECTO).forEach(function (k) { cfg[k] = CONFIG_POR_DEFECTO[k]; });
    db.all('Config').forEach(function (r) {
      var k = texto(r.clave);
      if (!k) return;
      cfg[k] = typeof CONFIG_POR_DEFECTO[k] === 'number' ? num(r.valor) : texto(r.valor);
    });
    return cfg;
  }

  function nivelPorVisitas(visitas) {
    var n = NIVELES[0];
    for (var i = 0; i < NIVELES.length; i++) if (visitas >= NIVELES[i].min) n = NIVELES[i];
    return n;
  }
  function nivelPorClave(clave) {
    for (var i = 0; i < NIVELES.length; i++) if (NIVELES[i].clave === clave) return NIVELES[i];
    return NIVELES[0];
  }
  function siguienteNivel(visitas) {
    for (var i = 0; i < NIVELES.length; i++) if (NIVELES[i].min > visitas) return NIVELES[i];
    return null;
  }

  /** Clasifica al cliente según los días desde su última visita. */
  function segmentoPorDias(dias, cfg) {
    if (dias === null || dias === undefined) return 'nuevo';
    if (dias >= cfg.DIAS_PERDIDO) return 'perdido';
    if (dias >= cfg.DIAS_RIESGO) return 'riesgo';
    if (dias >= cfg.DIAS_RECORDAR) return 'recordar';
    return 'al_dia';
  }
  function diasSinVisita(cliente, hoy) {
    return esFecha(cliente.ultima_visita) ? diasEntre(cliente.ultima_visita, hoy) : null;
  }

  /** Puntos = (fijos por visita + puntos por cada $1.000) x multiplicador del nivel. */
  function calcularPuntos(valorPagado, nivel, cfg) {
    var base = cfg.PUNTOS_POR_VISITA + Math.floor(valorPagado / 1000) * cfg.PUNTOS_POR_MIL;
    return Math.round(base * nivel.multiplicador);
  }

  function membresiaVigente(db, clienteId, hoy) {
    var lista = filtrar(db, 'Membresias', function (m) {
      return String(m.cliente_id) === String(clienteId) && m.estado === 'activa' && texto(m.fecha_vencimiento) >= hoy;
    });
    lista.sort(function (a, b) { return a.fecha_vencimiento < b.fecha_vencimiento ? 1 : -1; });
    return lista[0] || null;
  }
  function ultimaMembresia(db, clienteId) {
    var lista = filtrar(db, 'Membresias', function (m) { return String(m.cliente_id) === String(clienteId); });
    lista.sort(function (a, b) { return a.fecha_vencimiento < b.fecha_vencimiento ? 1 : -1; });
    return lista[0] || null;
  }
  function beneficiariosActivos(db, titularId) {
    return filtrar(db, 'Beneficiarios', function (b) {
      return String(b.titular_id) === String(titularId) && b.estado !== 'inactivo';
    });
  }
  function recompensasDisponibles(db, clienteId, hoy) {
    return filtrar(db, 'RecompensasCliente', function (r) {
      return String(r.cliente_id) === String(clienteId) && r.estado === 'disponible' &&
        (!esFecha(r.fecha_vence) || r.fecha_vence >= hoy);
    });
  }
  function recompensasDeTipo(db, tipo) {
    return activos(db, 'Recompensas').filter(function (r) { return r.tipo === tipo; });
  }

  // --------------------------------------------------------------------------
  // 4. CONTEXTO Y OPERACIONES INTERNAS
  // --------------------------------------------------------------------------
  function crearContexto(db) {
    return { db: db, cfg: leerConfig(db), hoy: db.hoy(), hora: db.hora ? db.hora() : '' };
  }

  function obtenerCliente_(ctx, id) {
    return requerido(buscar(ctx.db, 'Clientes', 'cliente_id', id), 'No encontré ese cliente.');
  }

  function otorgarRecompensa(ctx, clienteId, recompensa, origen) {
    var codigo;
    do { codigo = 'R' + codigoAleatorio(5); } while (buscar(ctx.db, 'RecompensasCliente', 'codigo', codigo));
    return ctx.db.insert('RecompensasCliente', {
      rc_id: nuevoId('RC'), cliente_id: clienteId, recompensa_id: recompensa.recompensa_id,
      nombre: recompensa.nombre, codigo: codigo, descuento_pct: num(recompensa.descuento_pct),
      fecha_otorgada: ctx.hoy, fecha_vence: sumarDias(ctx.hoy, num(recompensa.vigencia_dias) || 30),
      origen: origen || recompensa.tipo, estado: 'disponible', transferida_a_nombre: '',
      transferida_a_tel: '', canjeada_por: '', fecha_canje: ''
    });
  }

  function crearRecordatorio(ctx, cliente, tipo, clave, dias, mensaje) {
    if (buscar(ctx.db, 'Recordatorios', 'clave', clave)) return null; // ya existe (no duplicar)
    return ctx.db.insert('Recordatorios', {
      recordatorio_id: nuevoId('RE'), fecha: ctx.hoy, cliente_id: cliente.cliente_id, nombre: cliente.nombre,
      telefono: cliente.telefono, tipo: tipo, clave: clave, dias_sin_visita: dias === null ? '' : dias,
      mensaje: mensaje, link_whatsapp: linkWhatsApp(cliente.telefono, mensaje), estado: 'pendiente', fecha_envio: ''
    });
  }

  function progresoCliente(ctx, cliente, esMiembro) {
    var visitas = num(cliente.total_visitas);
    var premio = null;
    if (esMiembro) {
      recompensasDeTipo(ctx.db, 'visitas').forEach(function (r) {
        var u = num(r.umbral);
        if (u <= 0) return;
        var faltan = u - (visitas % u);
        if (!premio || faltan < premio.faltan) premio = { nombre: r.nombre, faltan: faltan, cada: u };
      });
    }
    var sig = siguienteNivel(visitas);
    var canjes = recompensasDeTipo(ctx.db, 'puntos').map(function (r) {
      return { recompensa_id: r.recompensa_id, nombre: r.nombre, puntos: num(r.umbral),
        alcanza: num(cliente.puntos) >= num(r.umbral) };
    }).sort(function (a, b) { return a.puntos - b.puntos; });
    return {
      proximo_premio: premio,
      proximo_nivel: sig ? { nombre: sig.nombre, icono: sig.icono, faltan: sig.min - visitas } : null,
      canjes: canjes
    };
  }

  function resumenCliente(ctx, c) {
    var dias = diasSinVisita(c, ctx.hoy);
    var m = membresiaVigente(ctx.db, c.cliente_id, ctx.hoy);
    var plan = m ? buscar(ctx.db, 'Planes', 'plan_id', m.plan_id) : null;
    var nivel = nivelPorVisitas(num(c.total_visitas));
    return {
      cliente_id: c.cliente_id, nombre: c.nombre, telefono: c.telefono, puntos: num(c.puntos),
      total_visitas: num(c.total_visitas), ultima_visita: c.ultima_visita, dias_sin_visita: dias,
      segmento: segmentoPorDias(dias, ctx.cfg), nivel: nivel.clave, nivel_nombre: nivel.nombre, nivel_icono: nivel.icono,
      es_miembro: !!m, plan: plan ? plan.nombre : '', vence: m ? m.fecha_vencimiento : '',
      dias_para_vencer: m ? diasEntre(ctx.hoy, m.fecha_vencimiento) : null,
      beneficiarios: beneficiariosActivos(ctx.db, c.cliente_id).map(function (b) {
        return { beneficiario_id: b.beneficiario_id, nombre: b.nombre, parentesco: b.parentesco };
      })
    };
  }

  /** Registra que un teléfono referido se convirtió en cliente y premia al titular. */
  function procesarReferido(ctx, nuevo, titularId) {
    var titular = titularId ? buscar(ctx.db, 'Clientes', 'cliente_id', titularId) : null;
    var ref = filtrar(ctx.db, 'Referidos', function (r) {
      return normalizarTelefono(r.telefono) === nuevo.telefono && r.estado !== 'convertido';
    })[0];
    if (!titular && ref) titular = buscar(ctx.db, 'Clientes', 'cliente_id', ref.titular_id);
    if (!titular || titular.cliente_id === nuevo.cliente_id) return null;

    var bono = ctx.cfg.PUNTOS_REFERIDO;
    ctx.db.update('Clientes', 'cliente_id', titular.cliente_id, { puntos: num(titular.puntos) + bono });
    ctx.db.update('Clientes', 'cliente_id', nuevo.cliente_id, { referido_por: titular.cliente_id });
    if (ref) {
      ctx.db.update('Referidos', 'referido_id', ref.referido_id, { estado: 'convertido', cliente_id: nuevo.cliente_id, bono_otorgado: bono });
    } else {
      ctx.db.insert('Referidos', { referido_id: nuevoId('RF'), fecha: ctx.hoy, titular_id: titular.cliente_id,
        nombre: nuevo.nombre, telefono: nuevo.telefono, origen: 'registro', estado: 'convertido',
        cliente_id: nuevo.cliente_id, bono_otorgado: bono });
    }
    var premios = [];
    if (membresiaVigente(ctx.db, titular.cliente_id, ctx.hoy)) {
      recompensasDeTipo(ctx.db, 'referido').forEach(function (r) {
        premios.push(otorgarRecompensa(ctx, titular.cliente_id, r, 'referido'));
      });
    }
    return { titular: titular.nombre, puntos: bono, premios: premios };
  }

  // --------------------------------------------------------------------------
  // 5. ACCIONES DE LA API
  // --------------------------------------------------------------------------
  function catalogos(ctx) {
    var cfg = {};
    Object.keys(ctx.cfg).forEach(function (k) { if (k !== 'PIN_DUENO') cfg[k] = ctx.cfg[k]; });
    return {
      version: VERSION, hoy: ctx.hoy, config: cfg,
      profesionales: texto(ctx.cfg.PROFESIONALES).split(',').map(texto).filter(Boolean),
      planes: activos(ctx.db, 'Planes'), servicios: activos(ctx.db, 'Servicios'),
      recompensas: activos(ctx.db, 'Recompensas'), niveles: NIVELES, segmentos: SEGMENTOS
    };
  }

  function dashboard(ctx) {
    var db = ctx.db, mes = ctx.hoy.slice(0, 7);
    var clientes = db.all('Clientes');
    var segmentos = { al_dia: 0, recordar: 0, riesgo: 0, perdido: 0, nuevo: 0 };
    var miembros = 0, miembrosRiesgo = 0, vencenPronto = [];
    clientes.forEach(function (c) {
      var r = resumenCliente(ctx, c);
      segmentos[r.segmento]++;
      if (r.es_miembro) {
        miembros++;
        if (r.segmento === 'riesgo' || r.segmento === 'perdido') miembrosRiesgo++;
        if (r.dias_para_vencer <= ctx.cfg.DIAS_AVISO_VENCIMIENTO + 4) {
          vencenPronto.push({ cliente_id: c.cliente_id, nombre: c.nombre, vence: r.vence, dias: r.dias_para_vencer });
        }
      }
    });
    vencenPronto.sort(function (a, b) { return a.dias - b.dias; });
    var visitasMes = filtrar(db, 'Visitas', function (v) { return texto(v.fecha).slice(0, 7) === mes; });
    var ingresosVisitas = visitasMes.reduce(function (s, v) { return s + num(v.valor_pagado); }, 0);
    var ingresosMembresias = filtrar(db, 'Membresias', function (m) { return texto(m.fecha_pago).slice(0, 7) === mes; })
      .reduce(function (s, m) { return s + num(m.valor_pagado); }, 0);
    var top = clientes.slice().sort(function (a, b) { return num(b.puntos) - num(a.puntos); }).slice(0, 5)
      .map(function (c) { return { cliente_id: c.cliente_id, nombre: c.nombre, puntos: num(c.puntos), nivel: nivelPorVisitas(num(c.total_visitas)).icono }; });
    return {
      negocio: ctx.cfg.NOMBRE_NEGOCIO, hoy: ctx.hoy, meta: ctx.cfg.META_MIEMBROS, miembros_activos: miembros,
      progreso_meta: ctx.cfg.META_MIEMBROS ? Math.min(100, Math.round(miembros * 100 / ctx.cfg.META_MIEMBROS)) : 0,
      miembros_en_riesgo: miembrosRiesgo, clientes_total: clientes.length, segmentos: segmentos,
      visitas_hoy: visitasMes.filter(function (v) { return v.fecha === ctx.hoy; }).length,
      visitas_mes: visitasMes.length, ingresos_visitas_mes: ingresosVisitas, ingresos_membresias_mes: ingresosMembresias,
      recordatorios_pendientes: filtrar(db, 'Recordatorios', function (r) { return r.estado === 'pendiente'; }).length,
      vencen_pronto: vencenPronto.slice(0, 8), top_clientes: top
    };
  }

  function listarClientes(ctx, d) {
    var lista = ctx.db.all('Clientes').map(function (c) { return resumenCliente(ctx, c); });
    if (d.segmento) lista = lista.filter(function (c) { return c.segmento === d.segmento; });
    if (d.miembros) lista = lista.filter(function (c) { return c.es_miembro; });
    lista.sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
    return lista;
  }

  function obtenerCliente(ctx, d) {
    var c = obtenerCliente_(ctx, d.cliente_id);
    var r = resumenCliente(ctx, c);
    var m = membresiaVigente(ctx.db, c.cliente_id, ctx.hoy) || ultimaMembresia(ctx.db, c.cliente_id);
    var plan = m ? buscar(ctx.db, 'Planes', 'plan_id', m.plan_id) : null;
    var visitas = filtrar(ctx.db, 'Visitas', function (v) { return String(v.cliente_id) === String(c.cliente_id); })
      .sort(function (a, b) { return (a.fecha + a.hora) < (b.fecha + b.hora) ? 1 : -1; }).slice(0, 30);
    var premios = filtrar(ctx.db, 'RecompensasCliente', function (x) { return String(x.cliente_id) === String(c.cliente_id); })
      .sort(function (a, b) { return a.fecha_otorgada < b.fecha_otorgada ? 1 : -1; });
    premios.forEach(function (p) {
      if (p.estado === 'disponible' && esFecha(p.fecha_vence) && p.fecha_vence < ctx.hoy) p.estado = 'vencida';
    });
    return {
      cliente: c, resumen: r, membresia: m, plan: plan,
      beneficiarios: beneficiariosActivos(ctx.db, c.cliente_id),
      visitas: visitas, recompensas: premios.slice(0, 30),
      referidos: filtrar(ctx.db, 'Referidos', function (x) { return String(x.titular_id) === String(c.cliente_id); }),
      progreso: progresoCliente(ctx, c, r.es_miembro),
      link_whatsapp: linkWhatsApp(c.telefono, '¡Hola ' + primerNombre(c.nombre) + '! Te saluda ' + ctx.cfg.NOMBRE_NEGOCIO + '. ')
    };
  }

  function registrarCliente(ctx, d) {
    var nombre = requerido(texto(d.nombre), 'Escribe el nombre del cliente.');
    var tel = normalizarTelefono(d.telefono);
    if (tel.length < 10) falla('El celular debe tener 10 números.');
    var existe = filtrar(ctx.db, 'Clientes', function (c) { return normalizarTelefono(c.telefono) === tel; })[0];
    if (existe) falla('Ya existe un cliente con ese celular: ' + existe.nombre + '.', 'DUPLICADO');

    var c = ctx.db.insert('Clientes', {
      cliente_id: nuevoId('CL'), nombre: nombre, telefono: tel, fecha_nacimiento: esFecha(d.fecha_nacimiento) ? d.fecha_nacimiento : '',
      genero: texto(d.genero), barrio: texto(d.barrio), servicio_favorito: texto(d.servicio_favorito),
      fecha_registro: ctx.hoy, referido_por: '', puntos: 0, nivel: 'bronce', total_visitas: 0, total_gastado: 0,
      ultima_visita: '', segmento: 'nuevo', acepta_whatsapp: d.acepta_whatsapp === 'no' ? 'no' : 'si', notas: texto(d.notas)
    });
    var resultado = { cliente: c, membresia: null, referido: null };
    if (d.plan_id) resultado.membresia = activarMembresia(ctx, { cliente_id: c.cliente_id, plan_id: d.plan_id,
      metodo_pago: d.metodo_pago, valor_pagado: d.valor_pagado });
    resultado.referido = procesarReferido(ctx, c, d.referido_por);
    return resultado;
  }

  function actualizarCliente(ctx, d) {
    var c = obtenerCliente_(ctx, d.cliente_id);
    var cambios = {};
    ['nombre', 'fecha_nacimiento', 'genero', 'barrio', 'servicio_favorito', 'acepta_whatsapp', 'notas'].forEach(function (k) {
      if (d[k] !== undefined) cambios[k] = texto(d[k]);
    });
    if (d.telefono !== undefined) {
      var tel = normalizarTelefono(d.telefono);
      if (tel.length < 10) falla('El celular debe tener 10 números.');
      var otro = filtrar(ctx.db, 'Clientes', function (x) { return normalizarTelefono(x.telefono) === tel && x.cliente_id !== c.cliente_id; })[0];
      if (otro) falla('Ese celular ya es de ' + otro.nombre + '.');
      cambios.telefono = tel;
    }
    return ctx.db.update('Clientes', 'cliente_id', c.cliente_id, cambios);
  }

  /** Vende una membresía nueva o la renueva (extiende desde el vencimiento si aún está vigente). */
  function activarMembresia(ctx, d) {
    var c = obtenerCliente_(ctx, d.cliente_id);
    var previa = ultimaMembresia(ctx.db, c.cliente_id);
    var plan = requerido(buscar(ctx.db, 'Planes', 'plan_id', d.plan_id || (previa && previa.plan_id)), 'Elige un plan.');
    var vigente = previa && previa.estado === 'activa' && previa.fecha_vencimiento >= ctx.hoy;
    var inicio = vigente ? sumarDias(previa.fecha_vencimiento, 1) : ctx.hoy;
    var codigo = previa ? previa.codigo : null;
    if (!codigo) {
      do { codigo = codigoAleatorio(4, '0123456789'); } while (buscar(ctx.db, 'Membresias', 'codigo', codigo));
    }
    var renovaciones = previa ? num(previa.renovaciones) + 1 : 0;
    if (previa && previa.estado === 'activa' && !vigente) {
      ctx.db.update('Membresias', 'membresia_id', previa.membresia_id, { estado: 'vencida' });
    }
    var m = ctx.db.insert('Membresias', {
      membresia_id: nuevoId('MB'), cliente_id: c.cliente_id, plan_id: plan.plan_id, codigo: codigo,
      fecha_inicio: inicio, fecha_vencimiento: sumarDias(inicio, ctx.cfg.DURACION_MEMBRESIA_DIAS - 1),
      fecha_pago: ctx.hoy, valor_pagado: d.valor_pagado !== undefined && d.valor_pagado !== '' ? num(d.valor_pagado) : num(plan.precio_mensual),
      metodo_pago: texto(d.metodo_pago) || 'Efectivo', estado: 'activa', renovaciones: renovaciones
    });
    if (vigente) ctx.db.update('Membresias', 'membresia_id', previa.membresia_id, { estado: 'renovada' });

    var premios = [];
    if (!previa) {
      recompensasDeTipo(ctx.db, 'bienvenida').forEach(function (r) { premios.push(otorgarRecompensa(ctx, c.cliente_id, r, 'bienvenida')); });
    } else {
      recompensasDeTipo(ctx.db, 'renovacion').forEach(function (r) {
        if (num(r.umbral) > 0 && renovaciones % num(r.umbral) === 0) premios.push(otorgarRecompensa(ctx, c.cliente_id, r, 'renovacion'));
      });
    }
    var msg = plantilla('bienvenida', { nombre: primerNombre(c.nombre), negocio: ctx.cfg.NOMBRE_NEGOCIO, codigo: codigo });
    return { membresia: m, plan: plan, renovacion: !!previa, premios: premios, mensaje: msg, link_whatsapp: linkWhatsApp(c.telefono, msg) };
  }

  function agregarBeneficiario(ctx, d) {
    var c = obtenerCliente_(ctx, d.cliente_id);
    var m = requerido(membresiaVigente(ctx.db, c.cliente_id, ctx.hoy), 'El cliente necesita una membresía activa para compartir beneficios.');
    var plan = buscar(ctx.db, 'Planes', 'plan_id', m.plan_id);
    var actuales = beneficiariosActivos(ctx.db, c.cliente_id);
    if (actuales.length >= num(plan.cupos_beneficiarios)) {
      falla('El plan ' + plan.nombre + ' permite ' + num(plan.cupos_beneficiarios) + ' beneficiario(s). Mejora el plan o quita uno.');
    }
    var nombre = requerido(texto(d.nombre), 'Escribe el nombre del familiar o amigo.');
    return ctx.db.insert('Beneficiarios', {
      beneficiario_id: nuevoId('BF'), titular_id: c.cliente_id, nombre: nombre, telefono: normalizarTelefono(d.telefono),
      parentesco: texto(d.parentesco) || 'Familiar', fecha_alta: ctx.hoy, ultima_visita: '', estado: 'activo'
    });
  }

  function quitarBeneficiario(ctx, d) {
    requerido(buscar(ctx.db, 'Beneficiarios', 'beneficiario_id', d.beneficiario_id), 'No encontré ese beneficiario.');
    return ctx.db.update('Beneficiarios', 'beneficiario_id', d.beneficiario_id, { estado: 'inactivo' });
  }

  /**
   * Calcula (sin guardar) todo lo que pasaría con una visita:
   * descuento de membresía o premio, puntos, nivel y premios nuevos.
   */
  function calcularVisita(ctx, d) {
    var db = ctx.db;
    var c = obtenerCliente_(ctx, d.cliente_id);
    var servicio = d.servicio_id ? buscar(db, 'Servicios', 'servicio_id', d.servicio_id) : null;
    var valorLista = d.valor_lista !== undefined && d.valor_lista !== '' ? num(d.valor_lista) : (servicio ? num(servicio.precio) : 0);
    if (valorLista <= 0) falla('Elige un servicio o escribe el valor.');

    var m = membresiaVigente(db, c.cliente_id, ctx.hoy);
    var plan = m ? buscar(db, 'Planes', 'plan_id', m.plan_id) : null;
    var benef = null, pct = 0, origen = 'Sin membresía';

    if (d.beneficiario_id) {
      benef = requerido(buscar(db, 'Beneficiarios', 'beneficiario_id', d.beneficiario_id), 'No encontré ese beneficiario.');
      if (String(benef.titular_id) !== String(c.cliente_id) || benef.estado === 'inactivo') falla('Ese beneficiario no pertenece a este cliente.');
      if (!m) falla('La membresía de ' + c.nombre + ' no está activa; el beneficio compartido no aplica.');
      var mes = ctx.hoy.slice(0, 7);
      var usos = filtrar(db, 'Visitas', function (v) { return v.beneficiario_id === benef.beneficiario_id && texto(v.fecha).slice(0, 7) === mes; }).length;
      var limite = num(plan.usos_mes_beneficiario);
      if (limite > 0 && usos >= limite) falla(benef.nombre + ' ya usó sus ' + limite + ' visitas con descuento este mes.');
      pct = num(plan.descuento_beneficiario_pct);
      origen = 'Beneficio compartido (' + plan.nombre + ')';
    } else if (m) {
      pct = num(plan.descuento_titular_pct);
      origen = plan.nombre;
    }

    // Premio que se quiere usar (propio o regalado por código).
    var rc = null;
    if (d.rc_id || d.codigo_premio) {
      rc = d.rc_id ? buscar(db, 'RecompensasCliente', 'rc_id', d.rc_id)
        : buscar(db, 'RecompensasCliente', 'codigo', texto(d.codigo_premio).toUpperCase());
      requerido(rc, 'No encontré ese premio.');
      var propio = String(rc.cliente_id) === String(c.cliente_id) && rc.estado === 'disponible';
      var regalado = rc.estado === 'transferida';
      if (!propio && !regalado) falla('Ese premio ya fue usado o no le pertenece a este cliente.');
      if (esFecha(rc.fecha_vence) && rc.fecha_vence < ctx.hoy) falla('Ese premio venció el ' + fechaLarga(rc.fecha_vence) + '.');
      if (num(rc.descuento_pct) > pct) { pct = num(rc.descuento_pct); origen = 'Premio: ' + rc.nombre; }
    }

    // Premio automático de regreso: miembro en riesgo/perdido que vuelve.
    var dias = diasSinVisita(c, ctx.hoy);
    var segmentoPrevio = segmentoPorDias(dias, ctx.cfg);
    var regreso = null, regresoAplicado = false;
    if (!benef && m && (segmentoPrevio === 'riesgo' || segmentoPrevio === 'perdido')) {
      regreso = recompensasDeTipo(db, 'regreso')[0] || null;
      if (regreso && !rc && num(regreso.descuento_pct) > pct) {
        pct = num(regreso.descuento_pct); origen = 'Premio: ' + regreso.nombre; regresoAplicado = true;
      }
    }

    pct = Math.min(100, Math.max(0, pct));
    var descuento = Math.round(valorLista * pct / 100);
    var valorPagado = valorLista - descuento;

    var visitasAntes = num(c.total_visitas);
    var visitasDespues = benef ? visitasAntes : visitasAntes + 1;
    var nivelAntes = nivelPorVisitas(visitasAntes);
    var nivelDespues = nivelPorVisitas(visitasDespues);
    var puntos = m ? calcularPuntos(valorPagado, nivelDespues, ctx.cfg) : 0;

    var premiosNuevos = [];
    if (m && !benef) {
      recompensasDeTipo(db, 'visitas').forEach(function (r) {
        if (num(r.umbral) > 0 && visitasDespues % num(r.umbral) === 0) premiosNuevos.push(r);
      });
      if (nivelDespues.clave !== nivelAntes.clave) {
        recompensasDeTipo(db, 'nivel').forEach(function (r) { if (r.nivel === nivelDespues.clave) premiosNuevos.push(r); });
      }
      if (regreso && !regresoAplicado) premiosNuevos.push(regreso); // se guarda para la próxima visita
    }

    return {
      cliente: c, beneficiario: benef, servicio: servicio, membresia: m, plan: plan,
      atendido: benef ? benef.nombre : c.nombre, valor_lista: valorLista, descuento_pct: pct, descuento: descuento,
      valor_pagado: valorPagado, origen_descuento: origen, puntos: puntos, recompensa_usada: rc,
      regreso_aplicado: regresoAplicado, regreso: regreso,
      segmento_previo: segmentoPrevio, visitas_despues: visitasDespues,
      nivel_antes: nivelAntes, nivel_despues: nivelDespues, sube_nivel: nivelDespues.clave !== nivelAntes.clave,
      premios_nuevos: premiosNuevos.map(function (r) { return { recompensa_id: r.recompensa_id, nombre: r.nombre }; }),
      _premios: premiosNuevos
    };
  }

  function cotizarVisita(ctx, d) {
    var r = calcularVisita(ctx, d);
    delete r._premios;
    r.premios_disponibles = recompensasDisponibles(ctx.db, r.cliente.cliente_id, ctx.hoy);
    return r;
  }

  function registrarVisita(ctx, d) {
    var db = ctx.db;
    var r = calcularVisita(ctx, d);
    var c = r.cliente;

    if (r.recompensa_usada) {
      db.update('RecompensasCliente', 'rc_id', r.recompensa_usada.rc_id, { estado: 'canjeada', canjeada_por: r.atendido, fecha_canje: ctx.hoy });
    }
    var premios = r._premios.map(function (p) { return otorgarRecompensa(ctx, c.cliente_id, p, p.tipo); });
    if (r.regreso_aplicado) {
      var rcRegreso = otorgarRecompensa(ctx, c.cliente_id, r.regreso, 'regreso');
      db.update('RecompensasCliente', 'rc_id', rcRegreso.rc_id, { estado: 'canjeada', canjeada_por: r.atendido, fecha_canje: ctx.hoy });
    }

    var visita = db.insert('Visitas', {
      visita_id: nuevoId('VI'), fecha: ctx.hoy, hora: ctx.hora, cliente_id: c.cliente_id,
      beneficiario_id: r.beneficiario ? r.beneficiario.beneficiario_id : '', atendido_nombre: r.atendido,
      servicio_id: r.servicio ? r.servicio.servicio_id : '', servicio_nombre: r.servicio ? r.servicio.nombre : texto(d.servicio_nombre) || 'Servicio',
      profesional: texto(d.profesional), valor_lista: r.valor_lista, descuento_pct: r.descuento_pct, descuento: r.descuento,
      valor_pagado: r.valor_pagado, metodo_pago: texto(d.metodo_pago) || 'Efectivo', puntos_ganados: r.puntos,
      recompensa_usada: r.recompensa_usada ? r.recompensa_usada.codigo : (r.regreso_aplicado ? 'REGRESO' : ''), notas: texto(d.notas)
    });

    var cambios = { puntos: num(c.puntos) + r.puntos, total_gastado: num(c.total_gastado) + r.valor_pagado };
    if (r.beneficiario) {
      db.update('Beneficiarios', 'beneficiario_id', r.beneficiario.beneficiario_id, { ultima_visita: ctx.hoy });
    } else {
      cambios.total_visitas = r.visitas_despues;
      cambios.ultima_visita = ctx.hoy;
      cambios.nivel = r.nivel_despues.clave;
      cambios.segmento = 'al_dia';
      // El cliente volvió: cerrar sus recordatorios de inactividad pendientes.
      filtrar(db, 'Recordatorios', function (x) {
        return x.cliente_id === c.cliente_id && x.estado === 'pendiente' && /^(recordar|riesgo|perdido)$/.test(x.tipo);
      }).forEach(function (x) { db.update('Recordatorios', 'recordatorio_id', x.recordatorio_id, { estado: 'resuelto' }); });
    }
    var cliente = db.update('Clientes', 'cliente_id', c.cliente_id, cambios);

    return {
      visita: visita, cliente: cliente, puntos_ganados: r.puntos, descuento: r.descuento, valor_pagado: r.valor_pagado,
      origen_descuento: r.origen_descuento, sube_nivel: r.sube_nivel, nivel: r.nivel_despues, premios_nuevos: premios,
      regreso_aplicado: r.regreso_aplicado
    };
  }

  function canjearPuntos(ctx, d) {
    var c = obtenerCliente_(ctx, d.cliente_id);
    var r = requerido(buscar(ctx.db, 'Recompensas', 'recompensa_id', d.recompensa_id), 'No encontré ese premio.');
    if (r.tipo !== 'puntos') falla('Ese premio no se canjea por puntos.');
    if (num(c.puntos) < num(r.umbral)) falla('Le faltan ' + (num(r.umbral) - num(c.puntos)) + ' puntos.');
    ctx.db.update('Clientes', 'cliente_id', c.cliente_id, { puntos: num(c.puntos) - num(r.umbral) });
    return otorgarRecompensa(ctx, c.cliente_id, r, 'canje');
  }

  /** Regala un premio del titular a un familiar o amigo (se envía por WhatsApp). */
  function transferirRecompensa(ctx, d) {
    var rc = requerido(buscar(ctx.db, 'RecompensasCliente', 'rc_id', d.rc_id), 'No encontré ese premio.');
    if (d._titular_id && String(rc.cliente_id) !== String(d._titular_id)) falla('Ese premio no es tuyo.');
    if (rc.estado !== 'disponible') falla('Ese premio ya fue usado o regalado.');
    if (esFecha(rc.fecha_vence) && rc.fecha_vence < ctx.hoy) falla('Ese premio ya venció.');
    var base = buscar(ctx.db, 'Recompensas', 'recompensa_id', rc.recompensa_id);
    if (base && !esSi(base.transferible)) falla('Este premio es personal y no se puede regalar.');
    var nombre = requerido(texto(d.nombre), 'Escribe el nombre de a quién se lo regalas.');
    var tel = normalizarTelefono(d.telefono);
    if (tel.length < 10) falla('El celular debe tener 10 números.');
    var titular = buscar(ctx.db, 'Clientes', 'cliente_id', rc.cliente_id);

    var actualizado = ctx.db.update('RecompensasCliente', 'rc_id', rc.rc_id, {
      estado: 'transferida', transferida_a_nombre: nombre, transferida_a_tel: tel
    });
    var yaCliente = filtrar(ctx.db, 'Clientes', function (x) { return normalizarTelefono(x.telefono) === tel; })[0];
    if (!yaCliente) {
      ctx.db.insert('Referidos', { referido_id: nuevoId('RF'), fecha: ctx.hoy, titular_id: rc.cliente_id, nombre: nombre,
        telefono: tel, origen: 'regalo', estado: 'invitado', cliente_id: '', bono_otorgado: 0 });
    }
    var msg = plantilla('regalo', { nombre: primerNombre(nombre), titular: titular ? primerNombre(titular.nombre) : 'Un amigo',
      premio: rc.nombre, negocio: ctx.cfg.NOMBRE_NEGOCIO, codigo: rc.codigo, fecha: fechaLarga(rc.fecha_vence) });
    return { recompensa: actualizado, mensaje: msg, link_whatsapp: linkWhatsApp(tel, msg) };
  }

  /** Verifica un código de premio en caja (para amigos que aún no son clientes). */
  function canjearRecompensa(ctx, d) {
    var codigo = texto(d.codigo).toUpperCase();
    var rc = requerido(buscar(ctx.db, 'RecompensasCliente', 'codigo', codigo), 'Código no encontrado.');
    if (rc.estado !== 'disponible' && rc.estado !== 'transferida') falla('Ese código ya fue usado (' + rc.estado + ').');
    if (esFecha(rc.fecha_vence) && rc.fecha_vence < ctx.hoy) falla('Ese código venció el ' + fechaLarga(rc.fecha_vence) + '.');
    if (d.solo_consultar) return rc;
    return ctx.db.update('RecompensasCliente', 'rc_id', rc.rc_id, {
      estado: 'canjeada', canjeada_por: texto(d.canjeada_por) || rc.transferida_a_nombre || 'Cliente', fecha_canje: ctx.hoy
    });
  }

  function registrarReferido(ctx, d) {
    var titular = obtenerCliente_(ctx, d.cliente_id);
    var nombre = requerido(texto(d.nombre), 'Escribe el nombre del amigo.');
    var tel = normalizarTelefono(d.telefono);
    if (tel.length < 10) falla('El celular debe tener 10 números.');
    if (filtrar(ctx.db, 'Clientes', function (x) { return normalizarTelefono(x.telefono) === tel; })[0]) falla('Esa persona ya es cliente.');
    var ref = ctx.db.insert('Referidos', { referido_id: nuevoId('RF'), fecha: ctx.hoy, titular_id: titular.cliente_id,
      nombre: nombre, telefono: tel, origen: 'invitacion', estado: 'invitado', cliente_id: '', bono_otorgado: 0 });
    var msg = plantilla('invitacion', { nombre: primerNombre(nombre), titular: primerNombre(titular.nombre), negocio: ctx.cfg.NOMBRE_NEGOCIO });
    return { referido: ref, mensaje: msg, link_whatsapp: linkWhatsApp(tel, msg) };
  }

  /**
   * ALGORITMO DE AUTOMATIZACIÓN (se ejecuta a diario con un disparador):
   *  1. Calcula días desde la última visita de cada cliente y su segmento.
   *  2. Crea UN recordatorio por etapa (recordar → riesgo → perdido) por ciclo.
   *  3. Avisa membresías por vencer y marca las vencidas.
   *  4. Felicita cumpleaños y regala el premio de cumpleaños a los miembros.
   *  5. Vence premios no usados.
   */
  function generarRecordatorios(ctx) {
    var db = ctx.db, cfg = ctx.cfg, hoy = ctx.hoy;
    var creados = { recordar: 0, riesgo: 0, perdido: 0, vence: 0, vencida: 0, cumpleanos: 0 };
    var premioRegreso = recompensasDeTipo(db, 'regreso')[0];
    var premioCumple = recompensasDeTipo(db, 'cumpleanos')[0];

    db.all('Membresias').forEach(function (m) {
      if (m.estado === 'activa' && esFecha(m.fecha_vencimiento) && m.fecha_vencimiento < hoy) {
        db.update('Membresias', 'membresia_id', m.membresia_id, { estado: 'vencida' });
        var c = buscar(db, 'Clientes', 'cliente_id', m.cliente_id);
        if (c && !membresiaVigente(db, c.cliente_id, hoy) && c.acepta_whatsapp !== 'no') {
          var plan = buscar(db, 'Planes', 'plan_id', m.plan_id);
          var msg = plantilla('vencida', { nombre: primerNombre(c.nombre), plan: plan ? plan.nombre : 'membresía',
            negocio: cfg.NOMBRE_NEGOCIO, fecha: fechaLarga(m.fecha_vencimiento), puntos: num(c.puntos) });
          if (crearRecordatorio(ctx, c, 'vencida', c.cliente_id + '|vencida|' + m.fecha_vencimiento, diasSinVisita(c, hoy), msg)) creados.vencida++;
        }
      }
    });

    db.all('Clientes').forEach(function (c) {
      var dias = diasSinVisita(c, hoy);
      var seg = segmentoPorDias(dias, cfg);
      if (c.segmento !== seg) db.update('Clientes', 'cliente_id', c.cliente_id, { segmento: seg });
      if (c.acepta_whatsapp === 'no') return;
      var m = membresiaVigente(db, c.cliente_id, hoy);
      var vars = { nombre: primerNombre(c.nombre), negocio: cfg.NOMBRE_NEGOCIO, dias: dias,
        premio: m && premioRegreso ? premioRegreso.nombre.toLowerCase() : 'una atención especial' };

      if (seg === 'recordar' || seg === 'riesgo' || seg === 'perdido') {
        if (crearRecordatorio(ctx, c, seg, c.cliente_id + '|' + seg + '|' + c.ultima_visita, dias, plantilla(seg, vars))) creados[seg]++;
      }
      if (m) {
        var faltan = diasEntre(hoy, m.fecha_vencimiento);
        if (faltan >= 0 && faltan <= cfg.DIAS_AVISO_VENCIMIENTO) {
          var plan = buscar(db, 'Planes', 'plan_id', m.plan_id);
          var msgV = plantilla('vence', { nombre: vars.nombre, plan: plan ? plan.nombre : 'membresía', negocio: cfg.NOMBRE_NEGOCIO, fecha: fechaLarga(m.fecha_vencimiento) });
          if (crearRecordatorio(ctx, c, 'vence', c.cliente_id + '|vence|' + m.fecha_vencimiento, dias, msgV)) creados.vence++;
        }
      }
      if (esFecha(c.fecha_nacimiento) && c.fecha_nacimiento.slice(5, 10) === hoy.slice(5, 10)) {
        var claveC = c.cliente_id + '|cumple|' + hoy.slice(0, 4);
        if (!buscar(db, 'Recordatorios', 'clave', claveC)) {
          var regalo = m && premioCumple ? otorgarRecompensa(ctx, c.cliente_id, premioCumple, 'cumpleanos') : null;
          var msgC = plantilla('cumpleanos', { nombre: vars.nombre, negocio: cfg.NOMBRE_NEGOCIO,
            premio: regalo ? regalo.nombre.toLowerCase() + ' (código ' + regalo.codigo + ')' : 'un detalle especial' });
          crearRecordatorio(ctx, c, 'cumpleanos', claveC, dias, msgC);
          creados.cumpleanos++;
        }
      }
    });

    var vencidos = 0;
    db.all('RecompensasCliente').forEach(function (r) {
      if ((r.estado === 'disponible' || r.estado === 'transferida') && esFecha(r.fecha_vence) && r.fecha_vence < hoy) {
        db.update('RecompensasCliente', 'rc_id', r.rc_id, { estado: 'vencida' });
        vencidos++;
      }
    });
    var total = Object.keys(creados).reduce(function (s, k) { return s + creados[k]; }, 0);
    return { fecha: hoy, creados: creados, total: total, premios_vencidos: vencidos };
  }

  function listarRecordatorios(ctx, d) {
    var estado = d.estado || 'pendiente';
    return filtrar(ctx.db, 'Recordatorios', function (r) { return estado === 'todos' || r.estado === estado; })
      .map(function (r) {
        var t = TIPOS_RECORDATORIO[r.tipo] || { etiqueta: r.tipo, prioridad: 9 };
        var copia = {};
        Object.keys(r).forEach(function (k) { copia[k] = r[k]; });
        copia.etiqueta = t.etiqueta; copia.prioridad = t.prioridad;
        return copia;
      })
      .sort(function (a, b) { return a.prioridad - b.prioridad || (a.fecha < b.fecha ? 1 : -1); });
  }

  function marcarRecordatorio(ctx, d) {
    requerido(buscar(ctx.db, 'Recordatorios', 'recordatorio_id', d.recordatorio_id), 'No encontré ese recordatorio.');
    var estado = d.estado === 'descartado' ? 'descartado' : 'enviado';
    return ctx.db.update('Recordatorios', 'recordatorio_id', d.recordatorio_id, { estado: estado, fecha_envio: ctx.hoy });
  }

  // ---- Acciones públicas (para la página "Mi membresía" del cliente) ----
  function autenticarMiembro(ctx, d) {
    var tel = normalizarTelefono(d.telefono);
    var codigo = texto(d.codigo);
    var c = filtrar(ctx.db, 'Clientes', function (x) { return normalizarTelefono(x.telefono) === tel; })[0];
    var m = c ? ultimaMembresia(ctx.db, c.cliente_id) : null;
    if (!c || !m || !codigo || texto(m.codigo) !== codigo) falla('Celular o código incorrecto.', 'AUTH');
    return c;
  }

  function consultaMiembro(ctx, d) {
    var c = autenticarMiembro(ctx, d);
    var r = resumenCliente(ctx, c);
    var m = membresiaVigente(ctx.db, c.cliente_id, ctx.hoy) || ultimaMembresia(ctx.db, c.cliente_id);
    var plan = m ? buscar(ctx.db, 'Planes', 'plan_id', m.plan_id) : null;
    return {
      negocio: ctx.cfg.NOMBRE_NEGOCIO, whatsapp_negocio: ctx.cfg.WHATSAPP_NEGOCIO, nombre: c.nombre,
      nivel: r.nivel_nombre, nivel_icono: r.nivel_icono, puntos: r.puntos, total_visitas: r.total_visitas,
      membresia: m ? { plan: plan ? plan.nombre : '', beneficios: plan ? plan.beneficios : '', vence: m.fecha_vencimiento,
        activa: r.es_miembro, codigo: m.codigo } : null,
      beneficiarios: r.beneficiarios.map(function (b) { return { nombre: b.nombre, parentesco: b.parentesco }; }),
      recompensas: recompensasDisponibles(ctx.db, c.cliente_id, ctx.hoy).map(function (x) {
        var base = buscar(ctx.db, 'Recompensas', 'recompensa_id', x.recompensa_id);
        return { rc_id: x.rc_id, nombre: x.nombre, codigo: x.codigo, vence: x.fecha_vence, transferible: base ? esSi(base.transferible) : false };
      }),
      progreso: progresoCliente(ctx, c, r.es_miembro)
    };
  }

  function regalarPremioMiembro(ctx, d) {
    var c = autenticarMiembro(ctx, d);
    return transferirRecompensa(ctx, { rc_id: d.rc_id, nombre: d.nombre, telefono: d.telefono_amigo, _titular_id: c.cliente_id });
  }

  // --------------------------------------------------------------------------
  // 6. ENRUTADOR (lo usan doGet/doPost y el modo demo)
  // --------------------------------------------------------------------------
  var ACCIONES = {
    ping: { fn: function (ctx) { return { ok: true, version: VERSION, hoy: ctx.hoy, negocio: ctx.cfg.NOMBRE_NEGOCIO }; }, publica: true },
    consultaMiembro: { fn: consultaMiembro, publica: true },
    regalarPremioMiembro: { fn: regalarPremioMiembro, publica: true, escritura: true },
    catalogos: { fn: catalogos },
    dashboard: { fn: dashboard },
    listarClientes: { fn: listarClientes },
    obtenerCliente: { fn: obtenerCliente },
    cotizarVisita: { fn: cotizarVisita },
    listarRecordatorios: { fn: listarRecordatorios },
    registrarCliente: { fn: registrarCliente, escritura: true },
    actualizarCliente: { fn: actualizarCliente, escritura: true },
    activarMembresia: { fn: activarMembresia, escritura: true },
    agregarBeneficiario: { fn: agregarBeneficiario, escritura: true },
    quitarBeneficiario: { fn: quitarBeneficiario, escritura: true },
    registrarVisita: { fn: registrarVisita, escritura: true },
    canjearPuntos: { fn: canjearPuntos, escritura: true },
    transferirRecompensa: { fn: function (ctx, d) { delete d._titular_id; return transferirRecompensa(ctx, d); }, escritura: true },
    canjearRecompensa: { fn: canjearRecompensa, escritura: true },
    registrarReferido: { fn: registrarReferido, escritura: true },
    generarRecordatorios: { fn: generarRecordatorios, escritura: true },
    marcarRecordatorio: { fn: marcarRecordatorio, escritura: true }
  };

  function procesar(db, accion, datos, pin) {
    try {
      var def = ACCIONES[accion];
      if (!def) falla('Acción desconocida: ' + accion, 'ACCION');
      var ctx = crearContexto(db);
      if (!def.publica && String(pin || '') !== String(ctx.cfg.PIN_DUENO)) falla('PIN incorrecto.', 'PIN');
      return { ok: true, datos: def.fn(ctx, datos || {}) };
    } catch (e) {
      return { ok: false, error: e.message || String(e), codigo: e.codigo || 'ERROR' };
    }
  }

  function esEscritura(accion) { return !!(ACCIONES[accion] && ACCIONES[accion].escritura); }
  function esPublica(accion) { return !!(ACCIONES[accion] && ACCIONES[accion].publica); }

  return {
    VERSION: VERSION, ESQUEMA: ESQUEMA, COLUMNAS_NUMERICAS: COLUMNAS_NUMERICAS, CONFIG_POR_DEFECTO: CONFIG_POR_DEFECTO,
    DATOS_INICIALES: DATOS_INICIALES, NIVELES: NIVELES, SEGMENTOS: SEGMENTOS, TIPOS_RECORDATORIO: TIPOS_RECORDATORIO,
    procesar: procesar, esEscritura: esEscritura, esPublica: esPublica, crearContexto: crearContexto,
    generarRecordatorios: generarRecordatorios, dashboard: dashboard,
    util: { normalizarTelefono: normalizarTelefono, linkWhatsApp: linkWhatsApp, diasEntre: diasEntre, sumarDias: sumarDias,
      fechaLarga: fechaLarga, nivelPorVisitas: nivelPorVisitas, nivelPorClave: nivelPorClave, segmentoPorDias: segmentoPorDias,
      calcularPuntos: calcularPuntos, esFecha: esFecha, num: num, texto: texto, nuevoId: nuevoId }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Nucleo;

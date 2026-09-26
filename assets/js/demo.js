/**
 * Modo DEMOSTRACIÓN: el mismo Nucleo.js, pero guardando en localStorage.
 * Permite probar la app en GitHub Pages sin configurar Google Sheets.
 */
const DemoBackend = (() => {
  const CLAVE = 'club_membresias_demo_v1';
  const pad = n => String(n).padStart(2, '0');
  const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const horaLocal = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  let datos = null;

  function tablaVacia() {
    const t = {};
    Object.keys(Nucleo.ESQUEMA).forEach(k => { t[k] = []; });
    Object.keys(Nucleo.DATOS_INICIALES).forEach(k => { t[k] = Nucleo.DATOS_INICIALES[k].map(r => ({ ...r })); });
    t.Config.find(c => c.clave === 'NOMBRE_NEGOCIO').valor = 'Barbería El Rodadero (demo)';
    return t;
  }

  const db = {
    all: t => datos[t] || (datos[t] = []),
    insert(t, o) {
      const f = {};
      Nucleo.ESQUEMA[t].forEach(c => { f[c] = o[c] === undefined ? '' : o[c]; });
      db.all(t).push(f);
      return f;
    },
    update(t, campo, id, cambios) {
      const r = db.all(t).find(x => String(x[campo]) === String(id));
      if (!r) throw new Error('No existe ' + t + ' ' + id);
      Object.assign(r, cambios);
      return r;
    },
    hoy: hoyLocal,
    hora: horaLocal
  };

  /** Genera clientes de ejemplo con visitas en distintas fechas. */
  function sembrar() {
    datos = tablaVacia();
    const U = Nucleo.util, hoy = hoyLocal();
    const nombres = ['Andrés Barrios', 'Luis Fernando Pérez', 'Kevin Mendoza', 'José Daza', 'Camilo Orozco', 'Jhon Fredy Castro',
      'Mauricio Ospino', 'Carlos Charris', 'Alejandro Vives', 'Julián De la Hoz', 'Estefany Cantillo', 'Yuliana Pertuz',
      'Marcela Gómez', 'Daniela Rangel', 'Rosa Elena Lara', 'Valentina Suárez', 'Brayan Polo', 'Sergio Acosta',
      'Wilmer Ariza', 'Fabián Rojano', 'Leidy Manjarrés', 'Karen Pacheco', 'Rafael Noguera', 'Hernán Díaz',
      'Diego Salcedo', 'Ingrid Bolaño', 'Tatiana Padilla', 'Óscar Maestre', 'Nelson Cuello', 'Paola Villa',
      'Ricardo Fuentes', 'Samuel Pinto', 'Laura Gutiérrez', 'Ever Sierra', 'Jorge Iguarán'];
    const barrios = ['Gaira', 'Bastidas', 'Pescaíto', 'Mamatoco', 'El Prado', 'Taganga', 'Los Almendros', 'Bavaria'];
    const servicios = datos.Servicios;
    let semillaAzar = 7;
    const azar = () => { semillaAzar = (semillaAzar * 9301 + 49297) % 233280; return semillaAzar / 233280; };
    const elegir = arr => arr[Math.floor(azar() * arr.length)];

    nombres.forEach((nombre, i) => {
      const id = 'CL-DEMO' + pad(i);
      const diasSinVenir = [2, 5, 9, 14, 18, 23, 27, 38, 45, 70][i % 10];
      const totalVisitas = Math.max(1, Math.floor(azar() * 26));
      const esMiembro = i < 28 && diasSinVenir < 60;
      const nivel = U.nivelPorVisitas(totalVisitas);
      const cliente = {
        cliente_id: id, nombre, telefono: '30' + String(10000000 + Math.floor(azar() * 89999999)),
        fecha_nacimiento: i === 3 ? '1991-' + hoy.slice(5) : `19${80 + (i % 20)}-${pad(1 + (i % 12))}-${pad(1 + (i % 27))}`,
        genero: i >= 10 && i <= 15 ? 'F' : 'M', barrio: elegir(barrios), servicio_favorito: elegir(servicios).nombre,
        fecha_registro: U.sumarDias(hoy, -120 - i), referido_por: i > 20 ? 'CL-DEMO0' + (i % 5) : '',
        puntos: esMiembro ? totalVisitas * 24 : 0, nivel: nivel.clave, total_visitas: totalVisitas, total_gastado: totalVisitas * 15000,
        ultima_visita: U.sumarDias(hoy, -diasSinVenir), segmento: '', acepta_whatsapp: 'si', notas: ''
      };
      datos.Clientes.push(cliente);

      // Historial de visitas (hasta 6 recientes)
      for (let v = 0; v < Math.min(totalVisitas, 6); v++) {
        const s = elegir(servicios);
        const pct = esMiembro ? 15 : 0;
        const pagado = Math.round(s.precio * (100 - pct) / 100);
        datos.Visitas.push({
          visita_id: `VI-DEMO${i}-${v}`, fecha: U.sumarDias(hoy, -diasSinVenir - v * 18), hora: '1' + (v % 9) + ':30',
          cliente_id: id, beneficiario_id: '', atendido_nombre: nombre, servicio_id: s.servicio_id, servicio_nombre: s.nombre,
          profesional: v % 2 ? 'Yuli' : 'Carlos', valor_lista: s.precio, descuento_pct: pct, descuento: s.precio - pagado,
          valor_pagado: pagado, metodo_pago: elegir(['Efectivo', 'Nequi', 'Daviplata']),
          puntos_ganados: esMiembro ? 24 : 0, recompensa_usada: '', notas: ''
        });
      }

      if (esMiembro) {
        const plan = i % 5 === 0 ? 'PL-FAMILIAR' : (i % 7 === 0 ? 'PL-VIP' : 'PL-PERSONAL');
        const inicio = U.sumarDias(hoy, -((i * 3) % 29));
        datos.Membresias.push({
          membresia_id: 'MB-DEMO' + i, cliente_id: id, plan_id: plan, codigo: String(1000 + i * 37),
          fecha_inicio: inicio, fecha_vencimiento: U.sumarDias(inicio, 29), fecha_pago: inicio,
          valor_pagado: datos.Planes.find(p => p.plan_id === plan).precio_mensual, metodo_pago: 'Efectivo',
          estado: 'activa', renovaciones: i % 4
        });
        if (plan !== 'PL-PERSONAL' || i % 3 === 0) {
          datos.Beneficiarios.push({ beneficiario_id: 'BF-DEMO' + i, titular_id: id, nombre: 'Hijo de ' + nombre.split(' ')[0],
            telefono: '', parentesco: 'Hijo(a)', fecha_alta: inicio, ultima_visita: '', estado: 'activo' });
        }
        if (totalVisitas >= 5) {
          datos.RecompensasCliente.push({ rc_id: 'RC-DEMO' + i, cliente_id: id, recompensa_id: 'RW-5VISITAS',
            nombre: 'Servicio a mitad de precio', codigo: 'RDEM' + pad(i), descuento_pct: 50, fecha_otorgada: U.sumarDias(hoy, -3),
            fecha_vence: U.sumarDias(hoy, 40), origen: 'visitas', estado: 'disponible', transferida_a_nombre: '',
            transferida_a_tel: '', canjeada_por: '', fecha_canje: '' });
        }
      }
    });
    Nucleo.generarRecordatorios(Nucleo.crearContexto(db));
    guardar();
  }

  function cargar() {
    if (datos) return;
    try {
      const s = localStorage.getItem(CLAVE);
      if (s) { datos = JSON.parse(s); return; }
    } catch (e) { /* almacenamiento no disponible */ }
    sembrar();
  }
  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch (e) { /* ignorar */ }
  }

  return {
    PIN: '1234',
    procesar(accion, d, pin) {
      cargar();
      // En demo, la revisión diaria corre al abrir el tablero.
      if (accion === 'dashboard') Nucleo.generarRecordatorios(Nucleo.crearContexto(db));
      const r = Nucleo.procesar(db, accion, JSON.parse(JSON.stringify(d || {})), pin);
      guardar();
      return JSON.parse(JSON.stringify(r));
    },
    reiniciar() { try { localStorage.removeItem(CLAVE); } catch (e) { /* */ } datos = null; sembrar(); }
  };
})();

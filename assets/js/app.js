/**
 * App del dueño: tablero, visitas, clientes, membresías, premios y avisos.
 * JavaScript sin librerías. Rutas por hash: #/inicio, #/visita, #/cliente/ID ...
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------- utilidades
  const $ = s => document.querySelector(s);
  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pesos = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
  const fecha = f => Nucleo.util.fechaLarga(f) || '—';
  const iniciales = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const primer = n => String(n || '').split(/\s+/)[0];
  const SEG = Nucleo.SEGMENTOS;
  const METODOS = ['Efectivo', 'Nequi', 'Daviplata', 'Tarjeta', 'Transferencia'];
  const ICONO_AVISO = { recordar: '⏰', riesgo: '⚠️', perdido: '🚨', vence: '📅', vencida: '⌛', cumpleanos: '🎂' };

  const E = { cat: null, clientes: null, visita: {}, filtro: '', busqueda: '' };

  function diasTexto(d) {
    if (d === null || d === undefined || d === '') return 'Sin visitas';
    if (d === 0) return 'Vino hoy';
    if (d === 1) return 'Vino ayer';
    return `Hace ${d} días`;
  }

  function toast(msg, error) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (error ? ' error' : '');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.add('oculto'), error ? 4500 : 2600);
  }

  function titulo(t, sub, atras) {
    $('#titulo').innerHTML = `${esc(t)}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}`;
    $('#btn-atras').classList.toggle('oculto', !atras);
    $('#chip-demo').classList.toggle('oculto', !Api.esDemo);
  }

  function abrirHoja(html) {
    cerrarHoja();
    const velo = document.createElement('div');
    velo.className = 'velo';
    velo.id = 'velo';
    velo.innerHTML = `<div class="hoja" role="dialog"><div class="tirador"></div>${html}</div>`;
    velo.addEventListener('click', e => { if (e.target === velo) cerrarHoja(); });
    document.body.appendChild(velo);
    const primero = velo.querySelector('input');
    if (primero) setTimeout(() => primero.focus(), 200);
  }
  function cerrarHoja() { const v = $('#velo'); if (v) v.remove(); }

  async function llamar(accion, datos, { silencioso } = {}) {
    try {
      return await Api.llamar(accion, datos);
    } catch (e) {
      if (e.codigo === 'PIN') { Api.pin = ''; E.cat = null; location.hash = '#/login'; }
      if (!silencioso) toast(e.message, true);
      throw e;
    }
  }

  async function clientes(forzar) {
    if (!E.clientes || forzar) E.clientes = await llamar('listarClientes', {});
    return E.clientes;
  }
  const invalidar = () => { E.clientes = null; };
  /** Navega a una ruta; si ya estamos en ella, vuelve a pintar. */
  function ir(hash) { if (location.hash === hash) render(); else location.hash = hash; }

  function itemCliente(c, href) {
    const s = SEG[c.segmento] || SEG.nuevo;
    return `<a class="item" href="${href || '#/cliente/' + encodeURIComponent(c.cliente_id)}">
      <div class="avatar">${esc(iniciales(c.nombre))}<i class="punto ${s.color}"></i></div>
      <div class="cuerpo"><div class="nombre">${esc(c.nombre)}</div>
        <div class="detalle">${c.es_miembro ? '<span class="etiqueta miembro">Miembro</span> ' : ''}${esc(c.nivel_icono)} ${esc(diasTexto(c.dias_sin_visita))}</div></div>
      <div class="der"><b>${c.puntos}</b><br>pts</div></a>`;
  }

  // ---------------------------------------------------------------- login
  function vistaLogin() {
    titulo('Club de Membresías', Api.esDemo ? 'Modo demostración' : '');
    $('#menu').classList.add('oculto');
    let pin = '';
    const main = $('#vista');
    const pintar = () => {
      main.querySelector('.puntos-pin').innerHTML = Array.from({ length: Math.max(4, pin.length) }, (_, i) => `<span class="${i < pin.length ? 'on' : ''}"></span>`).join('');
    };
    main.innerHTML = `<div class="login">
      <div class="logo">💈</div>
      <h2 style="margin:6px 0">Escribe tu PIN</h2>
      <p class="suave peq">${Api.esDemo ? 'Demostración: el PIN es <b>1234</b>' : 'El PIN está en la hoja <b>Config</b> de tu Google Sheets'}</p>
      <div class="puntos-pin"></div>
      <div class="teclado">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}">${n}</button>`).join('')}
        <button data-n="borrar" aria-label="Borrar">⌫</button><button data-n="0">0</button><button data-n="ok" aria-label="Entrar" style="background:var(--primario);color:#fff">✓</button>
      </div>
      <p style="margin-top:22px"><a href="#/ajustes">⚙️ Ajustes de conexión</a> · <a href="miembro.html">Soy cliente</a></p>
    </div>`;
    pintar();
    const entrar = async () => {
      if (pin.length < 4) return toast('El PIN tiene al menos 4 números', true);
      try {
        E.cat = await Api.llamar('catalogos', {}, pin);
        Api.pin = pin;
        $('#menu').classList.remove('oculto');
        ir('#/inicio');
      } catch (e) {
        toast(e.message, true);
        pin = ''; pintar();
      }
    };
    main.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => {
      const n = b.dataset.n;
      if (n === 'borrar') pin = pin.slice(0, -1);
      else if (n === 'ok') return entrar();
      else if (pin.length < 8) pin += n;
      pintar();
    }));
  }

  // ---------------------------------------------------------------- inicio
  async function vistaInicio(main) {
    const d = await llamar('dashboard');
    titulo(d.negocio, 'Hoy, ' + fecha(d.hoy));
    const faltan = Math.max(0, d.meta - d.miembros_activos);
    const seg = (k, lbl) => `<a class="seg ${SEG[k].color}" href="#/clientes/${k}"><b>${d.segmentos[k]}</b><span>${lbl}</span></a>`;
    main.innerHTML = `
      <div class="tarjeta meta">
        <div class="anillo" style="--p:${d.progreso_meta}"><div><b>${d.miembros_activos}</b><small>de ${d.meta}</small></div></div>
        <div><div class="grande" style="font-size:20px">Miembros activos</div>
          <div class="suave">${faltan ? `Te faltan <b>${faltan}</b> para tu meta del mes` : '¡Meta cumplida! 🎉'}</div>
          ${d.miembros_en_riesgo ? `<div class="peq" style="color:var(--naranja);margin-top:4px">⚠️ ${d.miembros_en_riesgo} miembros no vienen hace rato</div>` : ''}</div>
      </div>
      <div class="acciones">
        <a class="accion principal" href="#/visita"><span class="ico">✂️</span>Registrar visita</a>
        <a class="accion" href="#/nuevo"><span class="ico">➕</span>Nuevo cliente</a>
        <a class="accion" href="#/avisos"><span class="ico">🔔</span>Avisos${d.recordatorios_pendientes ? `<span class="insignia">${d.recordatorios_pendientes}</span>` : ''}</a>
        <a class="accion" href="#/clientes"><span class="ico">👥</span>Clientes</a>
      </div>
      <div class="tarjeta"><h2>¿Cómo están tus clientes?</h2>
        <div class="segmentos">${seg('al_dia', 'Al día')}${seg('recordar', 'Recordar')}${seg('riesgo', 'En riesgo')}${seg('perdido', 'Perdidos')}</div>
        <p class="peq suave" style="margin:10px 0 0">Toca un color para ver quiénes son. ${d.clientes_total} clientes en total.</p>
      </div>
      <div class="tarjeta"><h2>Este mes</h2>
        <div class="cifras">
          <div class="cifra"><b>${d.visitas_mes}</b><span>visitas (${d.visitas_hoy} hoy)</span></div>
          <div class="cifra"><b>${pesos(d.ingresos_visitas_mes)}</b><span>en servicios</span></div>
          <div class="cifra"><b>${pesos(d.ingresos_membresias_mes)}</b><span>en membresías</span></div>
          <div class="cifra"><b>${pesos(d.ingresos_visitas_mes + d.ingresos_membresias_mes)}</b><span>total</span></div>
        </div>
      </div>
      ${d.vencen_pronto.length ? `<div class="seccion-titulo">📅 Membresías por vencer</div><div class="lista">
        ${d.vencen_pronto.map(v => `<a class="item" href="#/cliente/${encodeURIComponent(v.cliente_id)}"><div class="avatar b">${esc(iniciales(v.nombre))}</div>
          <div class="cuerpo"><div class="nombre">${esc(v.nombre)}</div><div class="detalle">Vence el ${fecha(v.vence)}</div></div>
          <div class="der"><span class="etiqueta ${v.dias <= 3 ? 'naranja' : ''}">${v.dias === 0 ? 'Hoy' : v.dias + ' días'}</span></div></a>`).join('')}</div>` : ''}
      ${d.top_clientes.length ? `<div class="seccion-titulo">🏆 Clientes con más puntos</div><div class="lista">
        ${d.top_clientes.map((c, i) => `<a class="item" href="#/cliente/${encodeURIComponent(c.cliente_id)}"><div class="avatar">${i + 1}</div>
          <div class="cuerpo"><div class="nombre">${esc(c.nombre)}</div></div><div class="der">${c.nivel} <b>${c.puntos}</b> pts</div></a>`).join('')}</div>` : ''}`;
  }

  // ---------------------------------------------------------------- clientes
  async function vistaClientes(main, [filtro]) {
    titulo('Clientes', '', false);
    E.filtro = filtro || '';
    const lista = await clientes(true);
    const chips = [['', 'Todos'], ['miembros', 'Miembros'], ['al_dia', 'Al día'], ['recordar', 'Recordar'], ['riesgo', 'En riesgo'], ['perdido', 'Perdidos']];
    main.innerHTML = `
      <div class="buscador"><input type="search" id="q" placeholder="🔍 Buscar por nombre o celular" value="${esc(E.busqueda)}" autocomplete="off"></div>
      <div class="opciones" style="margin-bottom:12px">${chips.map(([k, l]) => `<button class="opcion ${E.filtro === k ? 'sel' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
      <div id="res"></div>
      <a class="btn" href="#/nuevo" style="margin-top:6px">➕ Nuevo cliente</a>`;
    const pintar = () => {
      const q = E.busqueda.toLowerCase().trim();
      const r = lista.filter(c => {
        if (E.filtro === 'miembros' ? !c.es_miembro : (E.filtro && c.segmento !== E.filtro)) return false;
        return !q || c.nombre.toLowerCase().includes(q) || String(c.telefono).includes(q.replace(/\D/g, '') || '§');
      });
      $('#res').innerHTML = r.length ? `<p class="peq suave" style="margin:0 4px 8px">${r.length} cliente(s)</p><div class="lista">${r.map(c => itemCliente(c)).join('')}</div>`
        : '<div class="vacio">No hay clientes aquí todavía.</div>';
    };
    $('#q').addEventListener('input', e => { E.busqueda = e.target.value; pintar(); });
    main.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => {
      E.filtro = b.dataset.f;
      main.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('sel', x === b));
      pintar();
    }));
    pintar();
  }

  // ---------------------------------------------------------------- ficha del cliente
  async function vistaCliente(main, [id]) {
    const d = await llamar('obtenerCliente', { cliente_id: id });
    const c = d.cliente, r = d.resumen, p = d.progreso;
    titulo(primer(c.nombre), r.es_miembro ? r.plan : 'Sin membresía activa', true);
    const cupos = d.plan ? Number(d.plan.cupos_beneficiarios) : 0;
    const disponibles = d.recompensas.filter(x => x.estado === 'disponible');
    const otras = d.recompensas.filter(x => x.estado !== 'disponible').slice(0, 8);
    const transferibles = new Set(E.cat.recompensas.filter(x => /^s/i.test(x.transferible)).map(x => x.recompensa_id));
    const estadoTxt = { canjeada: 'Usado', transferida: 'Regalado', vencida: 'Vencido' };
    const s = SEG[r.segmento];

    main.innerHTML = `
      <div class="carnet ${r.es_miembro ? r.nivel : 'inactivo'}">
        ${d.membresia ? `<div class="codigo">#${esc(d.membresia.codigo)}</div>` : ''}
        <div class="nivel">${esc(r.nivel_icono)} Nivel ${esc(r.nivel_nombre)}</div>
        <div class="titular">${esc(c.nombre)}</div>
        <div class="plan">${r.es_miembro ? `${esc(r.plan)} · vence ${fecha(r.vence)}` : (d.membresia ? `Membresía vencida el ${fecha(d.membresia.fecha_vencimiento)}` : 'Aún no tiene membresía')}</div>
        <div class="datos"><div><b>${r.puntos}</b><small>puntos</small></div><div><b>${r.total_visitas}</b><small>visitas</small></div>
          <div><b>${r.dias_sin_visita === null ? '—' : r.dias_sin_visita}</b><small>días sin venir</small></div></div>
      </div>
      <div class="botones dos" style="margin-bottom:14px">
        <a class="btn" href="#/visita/${encodeURIComponent(c.cliente_id)}">✂️ Visita</a>
        <a class="btn wa" href="${esc(d.link_whatsapp)}" target="_blank" rel="noopener">💬 WhatsApp</a>
      </div>
      ${!r.es_miembro ? `<div class="tarjeta" style="border:2px solid var(--acento)"><h2>⭐ ${d.membresia ? 'Renovar membresía' : 'Ofrecer membresía'}</h2>
        <p class="peq" style="margin-top:0">Con la membresía gana descuentos, puntos, premios y puede compartir beneficios con su familia.</p>
        <button class="btn acento" data-accion="membresia">${d.membresia ? '🔄 Renovar ahora' : '⭐ Vender membresía'}</button></div>`
        : (r.dias_para_vencer <= 7 ? `<button class="btn acento" data-accion="membresia" style="margin-bottom:14px">🔄 Renovar (vence en ${r.dias_para_vencer} días)</button>` : '')}
      <div class="tarjeta"><div class="fila entre"><h2 style="margin:0">Estado</h2><span class="etiqueta ${s.color}">${s.etiqueta}</span></div>
        ${p.proximo_premio ? `<p style="margin:12px 0 0">🎁 <b>${esc(p.proximo_premio.nombre)}</b> en <b>${p.proximo_premio.faltan}</b> visita(s)</p>
          <div class="barra-progreso"><div style="width:${Math.round((p.proximo_premio.cada - p.proximo_premio.faltan) * 100 / p.proximo_premio.cada)}%"></div></div>` : ''}
        ${p.proximo_nivel ? `<p style="margin:12px 0 0">${esc(p.proximo_nivel.icono)} Nivel <b>${esc(p.proximo_nivel.nombre)}</b> en <b>${p.proximo_nivel.faltan}</b> visita(s)</p>` : '<p>💎 ¡Nivel máximo!</p>'}
        ${r.es_miembro && p.canjes.length ? `<div class="seccion-titulo" style="margin:16px 0 8px">Cambiar puntos</div><div class="botones">
          ${p.canjes.map(k => `<button class="btn chico ${k.alcanza ? 'acento' : 'sec'}" style="width:100%" data-canje="${esc(k.recompensa_id)}" ${k.alcanza ? '' : 'disabled'}>${esc(k.nombre)} · ${k.puntos} pts</button>`).join('')}</div>` : ''}
      </div>

      <div class="seccion-titulo">👪 Familia y amigos ${d.plan && r.es_miembro ? `(${d.beneficiarios.length}/${cupos})` : ''}</div>
      <div class="lista">${d.beneficiarios.length ? d.beneficiarios.map(b => `<div class="item"><div class="avatar b">${esc(iniciales(b.nombre))}</div>
          <div class="cuerpo"><div class="nombre">${esc(b.nombre)}</div><div class="detalle">${esc(b.parentesco)} · ${b.ultima_visita ? 'última visita ' + fecha(b.ultima_visita) : 'aún no viene'}</div></div>
          <button class="btn chico peligro" data-quitar="${esc(b.beneficiario_id)}">Quitar</button></div>`).join('')
        : `<div class="vacio peq">${r.es_miembro ? 'Puede compartir su membresía con familiares o amigos.' : 'Disponible con membresía activa.'}</div>`}</div>
      ${r.es_miembro && d.beneficiarios.length < cupos ? '<button class="btn sec" data-accion="beneficiario">➕ Agregar familiar o amigo</button>' : ''}

      <div class="seccion-titulo">🎁 Premios</div>
      ${disponibles.length ? disponibles.map(x => `<div class="premio"><span class="ico">🎁</span><div class="cuerpo"><b>${esc(x.nombre)}</b>
          <div class="peq suave">Código <span class="codigo-premio">${esc(x.codigo)}</span> · vence ${fecha(x.fecha_vence)}</div></div>
          ${transferibles.has(x.recompensa_id) ? `<button class="btn chico acento" data-regalar="${esc(x.rc_id)}">Regalar</button>` : ''}</div>`).join('')
        : '<div class="vacio peq tarjeta">No tiene premios disponibles ahora.</div>'}
      ${otras.map(x => `<div class="premio gris"><span class="ico">🎟️</span><div class="cuerpo"><b>${esc(x.nombre)}</b>
          <div class="peq">${estadoTxt[x.estado] || x.estado}${x.transferida_a_nombre ? ' a ' + esc(x.transferida_a_nombre) : ''}${x.fecha_canje ? ' · ' + fecha(x.fecha_canje) : ''}</div></div></div>`).join('')}
      <button class="btn sec" data-accion="referido" style="margin-top:4px">📨 Invitar a un amigo</button>

      <div class="seccion-titulo">🧾 Últimas visitas</div>
      <div class="lista">${d.visitas.length ? d.visitas.slice(0, 12).map(v => `<div class="item"><div class="cuerpo">
          <div class="nombre">${esc(v.servicio_nombre)}${v.beneficiario_id ? ` <span class="etiqueta">👪 ${esc(primer(v.atendido_nombre))}</span>` : ''}</div>
          <div class="detalle">${fecha(v.fecha)} · ${esc(v.profesional || '')} ${v.descuento ? '· −' + pesos(v.descuento) : ''}</div></div>
          <div class="der"><b>${pesos(v.valor_pagado)}</b>${v.puntos_ganados ? '<br>+' + v.puntos_ganados + ' pts' : ''}</div></div>`).join('')
        : '<div class="vacio peq">Sin visitas registradas.</div>'}</div>

      <div class="seccion-titulo">📋 Datos</div>
      <div class="tarjeta peq">
        <p style="margin-top:0">📱 ${esc(c.telefono)}</p>
        <p>🎂 ${c.fecha_nacimiento ? fecha(c.fecha_nacimiento) : 'Sin fecha'} · 📍 ${esc(c.barrio || 'Sin barrio')}</p>
        <p>✂️ Prefiere: ${esc(c.servicio_favorito || '—')}</p>
        ${c.notas ? `<p>📝 ${esc(c.notas)}</p>` : ''}
        <p class="suave" style="margin-bottom:0">Cliente desde ${fecha(c.fecha_registro)} · Total gastado ${pesos(c.total_gastado)}</p>
        <button class="btn chico sec" data-accion="editar" style="margin-top:12px">✏️ Editar datos</button>
      </div>`;

    const recargar = () => { invalidar(); render(); };
    main.querySelectorAll('[data-accion]').forEach(b => b.addEventListener('click', () => {
      ({ membresia: () => hojaMembresia(c, d.membresia, recargar), beneficiario: () => hojaBeneficiario(c, recargar),
        referido: () => hojaReferido(c), editar: () => hojaEditar(c, recargar) })[b.dataset.accion]();
    }));
    main.querySelectorAll('[data-quitar]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('¿Quitar a este beneficiario? Deja de recibir el descuento.')) return;
      await llamar('quitarBeneficiario', { beneficiario_id: b.dataset.quitar });
      toast('Beneficiario quitado'); recargar();
    }));
    main.querySelectorAll('[data-regalar]').forEach(b => b.addEventListener('click', () => hojaRegalar(b.dataset.regalar, c, recargar)));
    main.querySelectorAll('[data-canje]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('¿Cambiar puntos por este premio?')) return;
      const rc = await llamar('canjearPuntos', { cliente_id: c.cliente_id, recompensa_id: b.dataset.canje });
      toast('🎁 Premio listo: ' + rc.codigo); recargar();
    }));
  }

  function selectorOpciones(nombre, opciones, valor) {
    return `<div class="opciones" data-grupo="${nombre}">${opciones.map(o => `<button type="button" class="opcion ${o === valor ? 'sel' : ''}" data-valor="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
  }
  function activarOpciones(raiz, alCambiar) {
    raiz.querySelectorAll('[data-grupo]').forEach(g => g.querySelectorAll('.opcion').forEach(b => b.addEventListener('click', () => {
      g.querySelectorAll('.opcion').forEach(x => x.classList.toggle('sel', x === b));
      g.dataset.sel = b.dataset.valor;
      if (alCambiar) alCambiar(g.dataset.grupo, b.dataset.valor);
    })));
    raiz.querySelectorAll('[data-grupo]').forEach(g => { const s = g.querySelector('.sel'); if (s) g.dataset.sel = s.dataset.valor; });
  }
  const valorGrupo = (raiz, nombre) => (raiz.querySelector(`[data-grupo="${nombre}"]`) || {}).dataset?.sel || '';

  function tarjetasPlanes(seleccionado, conNinguno) {
    return `<div class="rejilla" id="planes">${conNinguno ? `<button type="button" class="caja ${!seleccionado ? 'sel' : ''}" data-plan=""><b>Sin membresía</b><span>Solo registrar</span></button>` : ''}
      ${E.cat.planes.map(p => `<button type="button" class="caja ${seleccionado === p.plan_id ? 'sel' : ''}" data-plan="${esc(p.plan_id)}">
        <b>${esc(p.nombre)}</b><span>${pesos(p.precio_mensual)}/mes</span><span class="peq">${esc(p.beneficios)}</span></button>`).join('')}</div>`;
  }
  function activarPlanes(raiz, alCambiar) {
    raiz.querySelectorAll('[data-plan]').forEach(b => b.addEventListener('click', () => {
      raiz.querySelectorAll('[data-plan]').forEach(x => x.classList.toggle('sel', x === b));
      alCambiar(b.dataset.plan);
    }));
  }

  function hojaMembresia(c, previa, alTerminar) {
    let plan = previa ? previa.plan_id : (E.cat.planes[0] || {}).plan_id;
    abrirHoja(`<h3>${previa ? '🔄 Renovar' : '⭐ Nueva'} membresía</h3><p class="suave" style="margin-top:-8px">${esc(c.nombre)}</p>
      ${tarjetasPlanes(plan)}
      <div class="campo" style="margin-top:14px"><span>¿Cómo pagó?</span>${selectorOpciones('metodo', METODOS, 'Efectivo')}</div>
      <button class="btn" id="ok">✅ Cobrar y activar</button>`);
    const h = $('#velo');
    activarPlanes(h, v => { plan = v; });
    activarOpciones(h);
    h.querySelector('#ok').addEventListener('click', async () => {
      const r = await llamar('activarMembresia', { cliente_id: c.cliente_id, plan_id: plan, metodo_pago: valorGrupo(h, 'metodo') });
      hojaBienvenida(c, r, alTerminar);
    });
  }

  function hojaBienvenida(c, r, alTerminar) {
    abrirHoja(`<div class="exito"><div class="ico">⭐</div><h3>${r.renovacion ? '¡Membresía renovada!' : '¡Bienvenido al club!'}</h3>
      <p>${esc(r.plan.nombre)} activa hasta el <b>${fecha(r.membresia.fecha_vencimiento)}</b></p>
      <p>Código de miembro: <span class="codigo-premio" style="font-size:26px">${esc(r.membresia.codigo)}</span></p>
      ${r.premios.map(p => `<div class="premio"><span class="ico">🎁</span><div class="cuerpo"><b>${esc(p.nombre)}</b></div></div>`).join('')}</div>
      <div class="botones"><a class="btn wa" href="${esc(r.link_whatsapp)}" target="_blank" rel="noopener">💬 Enviarle su código por WhatsApp</a>
      <button class="btn sec" id="listo">Listo</button></div>`);
    $('#listo').addEventListener('click', () => { cerrarHoja(); alTerminar && alTerminar(); });
  }

  function hojaBeneficiario(c, alTerminar) {
    abrirHoja(`<h3>👪 Compartir membresía</h3><p class="suave" style="margin-top:-8px">Tendrá descuento usando la membresía de ${esc(primer(c.nombre))}.</p>
      <label class="campo"><span>Nombre</span><input type="text" id="bn" autocomplete="off"></label>
      <label class="campo"><span>Celular (opcional)</span><input type="tel" id="bt" inputmode="numeric"></label>
      <div class="campo"><span>¿Qué es de ${esc(primer(c.nombre))}?</span>${selectorOpciones('par', ['Hijo(a)', 'Pareja', 'Hermano(a)', 'Papá/Mamá', 'Amigo(a)'], 'Hijo(a)')}</div>
      <button class="btn" id="ok">Agregar</button>`);
    const h = $('#velo'); activarOpciones(h);
    h.querySelector('#ok').addEventListener('click', async () => {
      await llamar('agregarBeneficiario', { cliente_id: c.cliente_id, nombre: $('#bn').value, telefono: $('#bt').value, parentesco: valorGrupo(h, 'par') });
      cerrarHoja(); toast('👪 Beneficiario agregado'); alTerminar();
    });
  }

  function hojaEnviar(tituloTxt, r, alTerminar) {
    abrirHoja(`<div class="exito"><div class="ico">📨</div><h3>${esc(tituloTxt)}</h3></div>
      <div class="aviso"><div class="msg">${esc(r.mensaje)}</div></div>
      <div class="botones"><a class="btn wa" href="${esc(r.link_whatsapp)}" target="_blank" rel="noopener" id="wa">💬 Enviar por WhatsApp</a>
      <button class="btn sec" id="listo">Cerrar</button></div>`);
    $('#listo').addEventListener('click', () => { cerrarHoja(); alTerminar && alTerminar(); });
  }

  function hojaRegalar(rcId, c, alTerminar) {
    abrirHoja(`<h3>🎁 Regalar premio</h3><p class="suave" style="margin-top:-8px">${esc(primer(c.nombre))} se lo regala a un familiar o amigo. Le llega el código por WhatsApp.</p>
      <label class="campo"><span>Nombre de quien lo recibe</span><input type="text" id="rn" autocomplete="off"></label>
      <label class="campo"><span>Celular</span><input type="tel" id="rt" inputmode="numeric" placeholder="3001234567"></label>
      <button class="btn acento" id="ok">Regalar</button>`);
    $('#ok').addEventListener('click', async () => {
      const r = await llamar('transferirRecompensa', { rc_id: rcId, nombre: $('#rn').value, telefono: $('#rt').value });
      hojaEnviar('¡Premio regalado!', r, alTerminar);
    });
  }

  function hojaReferido(c) {
    abrirHoja(`<h3>📨 Invitar a un amigo</h3><p class="suave" style="margin-top:-8px">Si se registra, ${esc(primer(c.nombre))} gana ${E.cat.config.PUNTOS_REFERIDO} puntos.</p>
      <label class="campo"><span>Nombre del amigo</span><input type="text" id="fn" autocomplete="off"></label>
      <label class="campo"><span>Celular</span><input type="tel" id="ft" inputmode="numeric" placeholder="3001234567"></label>
      <button class="btn" id="ok">Crear invitación</button>`);
    $('#ok').addEventListener('click', async () => {
      const r = await llamar('registrarReferido', { cliente_id: c.cliente_id, nombre: $('#fn').value, telefono: $('#ft').value });
      hojaEnviar('Invitación lista', r);
    });
  }

  function hojaEditar(c, alTerminar) {
    abrirHoja(`<h3>✏️ Editar datos</h3>
      <label class="campo"><span>Nombre</span><input type="text" id="en" value="${esc(c.nombre)}"></label>
      <label class="campo"><span>Celular</span><input type="tel" id="et" value="${esc(c.telefono)}" inputmode="numeric"></label>
      <label class="campo"><span>Cumpleaños</span><input type="date" id="ef" value="${esc(c.fecha_nacimiento)}"></label>
      <label class="campo"><span>Barrio</span><input type="text" id="eb" value="${esc(c.barrio)}"></label>
      <label class="campo"><span>Notas (gustos, alergias, estilo)</span><textarea id="eo" rows="3">${esc(c.notas)}</textarea></label>
      <div class="campo"><span>¿Acepta mensajes por WhatsApp?</span>${selectorOpciones('wa', ['si', 'no'], c.acepta_whatsapp === 'no' ? 'no' : 'si')}</div>
      <button class="btn" id="ok">Guardar</button>`);
    const h = $('#velo'); activarOpciones(h);
    $('#ok').addEventListener('click', async () => {
      await llamar('actualizarCliente', { cliente_id: c.cliente_id, nombre: $('#en').value, telefono: $('#et').value,
        fecha_nacimiento: $('#ef').value, barrio: $('#eb').value, notas: $('#eo').value, acepta_whatsapp: valorGrupo(h, 'wa') });
      cerrarHoja(); toast('Datos guardados'); alTerminar();
    });
  }

  // ---------------------------------------------------------------- nuevo cliente
  async function vistaNuevo(main) {
    titulo('Nuevo cliente', '', true);
    const lista = await clientes();
    let plan = '';
    main.innerHTML = `<form id="f" autocomplete="off">
      <div class="tarjeta">
        <label class="campo"><span>Nombre completo *</span><input type="text" name="nombre" required></label>
        <label class="campo"><span>Celular (WhatsApp) *</span><input type="tel" name="telefono" inputmode="numeric" placeholder="3001234567" required></label>
        <label class="campo"><span>Cumpleaños</span><input type="date" name="fecha_nacimiento"></label>
        <label class="campo"><span>Barrio</span><input type="text" name="barrio" placeholder="Ej: Gaira, Bastidas, El Prado"></label>
        <label class="campo"><span>Servicio que más pide</span><select name="servicio_favorito"><option value="">—</option>
          ${E.cat.servicios.map(s => `<option>${esc(s.nombre)}</option>`).join('')}</select></label>
        <label class="campo" style="margin-bottom:0"><span>¿Quién lo recomendó?</span><select name="referido_por"><option value="">Nadie / no sabe</option>
          ${lista.map(c => `<option value="${esc(c.cliente_id)}">${esc(c.nombre)}</option>`).join('')}</select></label>
      </div>
      <div class="seccion-titulo">⭐ Membresía</div>
      ${tarjetasPlanes('', true)}
      <div class="campo oculto" id="pago" style="margin-top:14px"><span>¿Cómo pagó?</span>${selectorOpciones('metodo', METODOS, 'Efectivo')}</div>
      <button class="btn" style="margin-top:16px">Guardar cliente</button></form>`;
    activarPlanes(main, v => { plan = v; $('#pago').classList.toggle('oculto', !v); });
    activarOpciones(main);
    $('#f').addEventListener('submit', async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const btn = e.target.querySelector('button:last-child'); btn.disabled = true;
      try {
        const r = await llamar('registrarCliente', { ...f, plan_id: plan, metodo_pago: valorGrupo(main, 'metodo') });
        invalidar();
        if (r.referido) toast(`🙌 ${r.referido.titular} ganó ${r.referido.puntos} puntos por recomendar`);
        const ir = () => { location.hash = '#/cliente/' + encodeURIComponent(r.cliente.cliente_id); };
        if (r.membresia) hojaBienvenida(r.cliente, r.membresia, ir); else { toast('Cliente guardado'); ir(); }
      } catch (err) { btn.disabled = false; }
    });
  }

  // ---------------------------------------------------------------- registrar visita
  async function vistaVisita(main, [preId]) {
    titulo('Registrar visita', '', true);
    const v = E.visita = { cliente_id: preId || '', beneficiario_id: '', servicio_id: '', rc_id: '', codigo_premio: '', metodo_pago: 'Efectivo', profesional: '' };
    const lista = await clientes(true);

    const pasos = n => `<div class="pasos">${[1, 2, 3].map(i => `<div class="${i <= n ? 'on' : ''}"></div>`).join('')}</div>`;

    const paso1 = () => {
      main.innerHTML = `${pasos(1)}<h2 style="margin:0 0 10px">¿A quién atiendes?</h2>
        <div class="buscador"><input type="search" id="q" placeholder="🔍 Nombre o celular" autocomplete="off"></div>
        <div id="res"></div>
        <div class="botones dos"><a class="btn sec" href="#/nuevo">➕ Cliente nuevo</a><button class="btn sec" id="cod">🎟️ Código de regalo</button></div>`;
      const pintar = q => {
        q = (q || '').toLowerCase().trim();
        const filas = [];
        lista.forEach(c => {
          const coincide = !q || c.nombre.toLowerCase().includes(q) || (q.replace(/\D/g, '') && String(c.telefono).includes(q.replace(/\D/g, '')));
          if (coincide) filas.push({ c });
          c.beneficiarios.forEach(b => { if (q && b.nombre.toLowerCase().includes(q)) filas.push({ c, b }); });
        });
        filas.sort((a, b) => (a.c.dias_sin_visita ?? 999) - (b.c.dias_sin_visita ?? 999));
        $('#res').innerHTML = filas.length ? `<div class="lista">${filas.slice(0, 40).map(({ c, b }) => b
          ? `<button class="item" data-c="${esc(c.cliente_id)}" data-b="${esc(b.beneficiario_id)}"><div class="avatar b">${esc(iniciales(b.nombre))}</div>
              <div class="cuerpo"><div class="nombre">${esc(b.nombre)}</div><div class="detalle">👪 ${esc(b.parentesco)} de ${esc(c.nombre)}</div></div></button>`
          : `<button class="item" data-c="${esc(c.cliente_id)}"><div class="avatar">${esc(iniciales(c.nombre))}<i class="punto ${SEG[c.segmento].color}"></i></div>
              <div class="cuerpo"><div class="nombre">${esc(c.nombre)}</div><div class="detalle">${c.es_miembro ? '<span class="etiqueta miembro">Miembro</span> ' : ''}${esc(diasTexto(c.dias_sin_visita))}</div></div></button>`).join('')}</div>`
          : '<div class="vacio">No lo encuentro. ¿Es un cliente nuevo?</div>';
        $('#res').querySelectorAll('[data-c]').forEach(el => el.addEventListener('click', () => {
          v.cliente_id = el.dataset.c; v.beneficiario_id = el.dataset.b || ''; paso2();
        }));
      };
      $('#q').addEventListener('input', e => pintar(e.target.value));
      $('#cod').addEventListener('click', hojaCodigo);
      pintar('');
    };

    const paso2 = () => {
      const c = lista.find(x => x.cliente_id === v.cliente_id);
      if (!c) return paso1();
      const quien = v.beneficiario_id ? c.beneficiarios.find(b => b.beneficiario_id === v.beneficiario_id) : null;
      main.innerHTML = `${pasos(2)}
        <div class="tarjeta fila"><div class="avatar ${quien ? 'b' : ''}">${esc(iniciales(quien ? quien.nombre : c.nombre))}</div>
          <div class="cuerpo" style="flex:1"><b>${esc(quien ? quien.nombre : c.nombre)}</b><div class="peq suave">${quien ? '👪 Beneficio de ' + esc(c.nombre) : (c.es_miembro ? '⭐ ' + esc(c.plan) : 'Sin membresía')}</div></div>
          <button class="btn chico sec" id="cambiar">Cambiar</button></div>
        ${c.beneficiarios.length && c.es_miembro ? `<div class="opciones" style="margin-bottom:12px">
          <button class="opcion ${!v.beneficiario_id ? 'sel' : ''}" data-b="">${esc(primer(c.nombre))}</button>
          ${c.beneficiarios.map(b => `<button class="opcion ${v.beneficiario_id === b.beneficiario_id ? 'sel' : ''}" data-b="${esc(b.beneficiario_id)}">👪 ${esc(primer(b.nombre))}</button>`).join('')}</div>` : ''}
        <h2 style="margin:4px 0 10px">¿Qué servicio?</h2>
        <div class="rejilla">${E.cat.servicios.map(s => `<button class="caja" data-s="${esc(s.servicio_id)}"><b>${esc(s.nombre)}</b><span>${pesos(s.precio)}</span></button>`).join('')}</div>`;
      $('#cambiar').addEventListener('click', () => { v.cliente_id = ''; v.beneficiario_id = ''; paso1(); });
      main.querySelectorAll('.opcion[data-b]').forEach(b => b.addEventListener('click', () => { v.beneficiario_id = b.dataset.b; paso2(); }));
      main.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => { v.servicio_id = b.dataset.s; paso3(); }));
    };

    const paso3 = async () => {
      main.innerHTML = '<div class="cargando">Calculando…</div>';
      let q;
      try { q = await llamar('cotizarVisita', v); } catch (e) { v.rc_id = ''; v.codigo_premio = ''; return paso2(); }
      const premios = v.beneficiario_id ? [] : q.premios_disponibles;
      main.innerHTML = `${pasos(3)}
        <div class="tarjeta cobro"><h2>${esc(q.servicio ? q.servicio.nombre : 'Servicio')} · ${esc(q.atendido)}</h2>
          <div class="linea"><span>Precio</span><span>${pesos(q.valor_lista)}</span></div>
          ${q.descuento ? `<div class="linea desc"><span>${esc(q.origen_descuento)} (−${q.descuento_pct}%)</span><span>−${pesos(q.descuento)}</span></div>` : `<div class="linea suave peq"><span>${esc(q.origen_descuento)}</span></div>`}
          <div class="linea total"><span>Cobrar</span><span>${pesos(q.valor_pagado)}</span></div>
          ${q.puntos ? `<p class="peq" style="margin:8px 0 0">⭐ ${esc(primer(q.cliente.nombre))} gana <b>${q.puntos} puntos</b>${q.sube_nivel ? ` y <b>sube a ${esc(q.nivel_despues.icono)} ${esc(q.nivel_despues.nombre)}</b>` : ''}</p>` : ''}
          ${q.premios_nuevos.length ? `<p class="peq" style="margin:6px 0 0">🎁 Con esta visita gana: <b>${q.premios_nuevos.map(p => esc(p.nombre)).join(', ')}</b></p>` : ''}
          ${!q.membresia ? '<p class="peq" style="margin:8px 0 0;color:var(--naranja)">💡 Con membresía pagaría menos y ganaría puntos. ¡Ofrécela!</p>' : ''}
        </div>
        ${premios.length ? `<div class="seccion-titulo">🎁 ¿Usar un premio?</div><div class="rejilla">
          <button class="caja ${!v.rc_id ? 'sel' : ''}" data-rc=""><b>No usar</b><span>Guardarlo</span></button>
          ${premios.map(p => `<button class="caja ${v.rc_id === p.rc_id ? 'sel' : ''}" data-rc="${esc(p.rc_id)}"><b>${esc(p.nombre)}</b><span>−${p.descuento_pct}%</span></button>`).join('')}</div>` : ''}
        ${v.codigo_premio ? `<p class="peq">🎟️ Código aplicado: <b>${esc(v.codigo_premio)}</b> <a href="#" id="quitarcod">quitar</a></p>` : `<p><a href="#" id="usarcod">🎟️ Tiene un código de regalo</a></p>`}
        ${E.cat.profesionales.length ? `<div class="campo"><span>¿Quién atendió?</span>${selectorOpciones('prof', E.cat.profesionales, v.profesional || E.cat.profesionales[0])}</div>` : ''}
        <div class="campo"><span>¿Cómo pagó?</span>${selectorOpciones('metodo', METODOS, v.metodo_pago)}</div>
        <button class="btn" id="ok">✅ Registrar ${pesos(q.valor_pagado)}</button>
        <button class="btn sec" id="atras" style="margin-top:10px">← Cambiar servicio</button>`;
      activarOpciones(main, (g, val) => { if (g === 'prof') v.profesional = val; if (g === 'metodo') v.metodo_pago = val; });
      v.profesional = valorGrupo(main, 'prof'); v.metodo_pago = valorGrupo(main, 'metodo');
      main.querySelectorAll('[data-rc]').forEach(b => b.addEventListener('click', () => { v.rc_id = b.dataset.rc; v.codigo_premio = ''; paso3(); }));
      const usar = $('#usarcod'), quitar = $('#quitarcod');
      if (usar) usar.addEventListener('click', e => { e.preventDefault(); const k = prompt('Escribe el código del premio (ej: RAB12C)'); if (k) { v.codigo_premio = k.trim().toUpperCase(); v.rc_id = ''; paso3(); } });
      if (quitar) quitar.addEventListener('click', e => { e.preventDefault(); v.codigo_premio = ''; paso3(); });
      $('#atras').addEventListener('click', paso2);
      $('#ok').addEventListener('click', async ev => {
        ev.target.disabled = true;
        try { exito(await llamar('registrarVisita', v), q); } catch (e) { ev.target.disabled = false; }
      });
    };

    const exito = (r, q) => {
      invalidar();
      main.innerHTML = `<div class="tarjeta exito"><div class="ico">${r.sube_nivel ? r.nivel.icono : '✅'}</div>
        <h2 style="font-size:22px;text-transform:none;color:var(--tinta)">¡Visita registrada!</h2>
        <p class="grande">${pesos(r.valor_pagado)}</p>
        ${r.puntos_ganados ? `<p>⭐ +${r.puntos_ganados} puntos · ahora tiene <b>${r.cliente.puntos}</b></p>` : ''}
        ${r.sube_nivel ? `<p><b>🎉 ¡${esc(primer(r.cliente.nombre))} subió a nivel ${esc(r.nivel.nombre)}!</b></p>` : ''}
        ${r.regreso_aplicado ? '<p>👋 Se aplicó el premio de regreso. ¡Qué bueno que volvió!</p>' : ''}</div>
        ${r.premios_nuevos.map(p => `<div class="premio"><span class="ico">🎁</span><div class="cuerpo"><b>¡Ganó: ${esc(p.nombre)}!</b>
          <div class="peq suave">Código <span class="codigo-premio">${esc(p.codigo)}</span> · vence ${fecha(p.fecha_vence)}</div></div></div>`).join('')}
        ${r.premios_nuevos.length ? `<a class="btn wa" style="margin-bottom:10px" target="_blank" rel="noopener" href="${esc(Nucleo.util.linkWhatsApp(q.cliente.telefono,
          `🎁 ¡${primer(q.cliente.nombre)}, ganaste "${r.premios_nuevos.map(p => p.nombre).join('", "')}" en ${E.cat.config.NOMBRE_NEGOCIO}! Tu código: ${r.premios_nuevos.map(p => p.codigo).join(', ')}. También lo puedes regalar a un familiar o amigo.`))}">💬 Avisarle por WhatsApp</a>` : ''}
        <div class="botones dos"><button class="btn" id="otra">✂️ Otra visita</button>
        <a class="btn sec" href="#/cliente/${encodeURIComponent(r.cliente.cliente_id)}">Ver cliente</a></div>`;
      $('#otra').addEventListener('click', () => ir('#/visita'));
    };

    if (v.cliente_id) paso2(); else paso1();
  }

  /** Amigo que llega con un código regalado y aún no es cliente. */
  function hojaCodigo() {
    abrirHoja(`<h3>🎟️ Código de regalo</h3><p class="suave" style="margin-top:-8px">Para personas que traen un premio regalado por un miembro.</p>
      <label class="campo"><span>Código</span><input type="text" id="k" style="text-transform:uppercase;letter-spacing:2px;font-weight:800" placeholder="RXXXXX"></label>
      <div id="kres"></div><button class="btn" id="ver">Verificar</button>`);
    $('#ver').addEventListener('click', async () => {
      const rc = await llamar('canjearRecompensa', { codigo: $('#k').value, solo_consultar: true });
      $('#kres').innerHTML = `<div class="premio"><span class="ico">✅</span><div class="cuerpo"><b>${esc(rc.nombre)}</b>
        <div class="peq">−${rc.descuento_pct}% · ${rc.transferida_a_nombre ? 'Regalo para ' + esc(rc.transferida_a_nombre) : 'Premio de miembro'} · vence ${fecha(rc.fecha_vence)}</div></div></div>
        <p class="peq suave">💡 Si registras a esta persona como cliente, usa el código en su visita y quien la invitó gana puntos.</p>`;
      const b = $('#ver'); b.textContent = 'Marcar como usado'; b.replaceWith(b.cloneNode(true));
      $('#ver').addEventListener('click', async () => {
        await llamar('canjearRecompensa', { codigo: rc.codigo, canjeada_por: rc.transferida_a_nombre });
        cerrarHoja(); toast('🎟️ Premio usado. Aplica el ' + rc.descuento_pct + '% al cobrar.');
      });
    });
  }

  // ---------------------------------------------------------------- avisos
  async function vistaAvisos(main, [estado]) {
    titulo('Avisos', 'Clientes para contactar');
    estado = estado || 'pendiente';
    const lista = await llamar('listarRecordatorios', { estado });
    main.innerHTML = `
      <div class="opciones" style="margin-bottom:12px">
        <a class="opcion ${estado === 'pendiente' ? 'sel' : ''}" href="#/avisos/pendiente">Por enviar</a>
        <a class="opcion ${estado === 'enviado' ? 'sel' : ''}" href="#/avisos/enviado">Enviados</a>
        <a class="opcion ${estado === 'resuelto' ? 'sel' : ''}" href="#/avisos/resuelto">Volvieron ✅</a></div>
      ${estado === 'pendiente' ? '<button class="btn sec" id="revisar" style="margin-bottom:14px">🔄 Revisar clientes ahora</button>' : ''}
      ${lista.length ? lista.map(r => `<div class="aviso ${esc(r.tipo)}" data-id="${esc(r.recordatorio_id)}">
          <div class="fila entre"><b>${ICONO_AVISO[r.tipo] || '🔔'} ${esc(r.nombre)}</b><span class="etiqueta">${esc(r.etiqueta)}</span></div>
          <div class="peq suave">${r.dias_sin_visita !== '' ? esc(diasTexto(Number(r.dias_sin_visita))) + ' · ' : ''}creado ${fecha(r.fecha)}</div>
          <div class="msg">${esc(r.mensaje)}</div>
          ${estado === 'pendiente' ? `<div class="botones dos"><a class="btn wa chico" style="width:100%" href="${esc(r.link_whatsapp)}" target="_blank" rel="noopener" data-enviar>💬 Enviar</a>
            <button class="btn sec chico" style="width:100%" data-descartar>Descartar</button></div>` : ''}
          <a class="peq" href="#/cliente/${encodeURIComponent(r.cliente_id)}">Ver cliente →</a></div>`).join('')
        : `<div class="vacio">${estado === 'pendiente' ? '🎉 No hay clientes por contactar. ¡Todo al día!' : 'Nada por aquí.'}</div>`}`;
    const rev = $('#revisar');
    if (rev) rev.addEventListener('click', async () => {
      const r = await llamar('generarRecordatorios');
      toast(r.total ? `${r.total} avisos nuevos` : 'No hay avisos nuevos'); render();
    });
    main.querySelectorAll('.aviso').forEach(el => {
      const id = el.dataset.id;
      const quitar = () => { el.style.opacity = '.4'; setTimeout(() => el.remove(), 300); };
      const env = el.querySelector('[data-enviar]'), des = el.querySelector('[data-descartar]');
      if (env) env.addEventListener('click', () => { llamar('marcarRecordatorio', { recordatorio_id: id, estado: 'enviado' }).then(quitar, () => {}); });
      if (des) des.addEventListener('click', () => { llamar('marcarRecordatorio', { recordatorio_id: id, estado: 'descartado' }).then(quitar, () => {}); });
    });
  }

  // ---------------------------------------------------------------- ajustes
  function vistaAjustes(main) {
    titulo('Ajustes', '', true);
    main.innerHTML = `
      <div class="tarjeta"><h2>Conexión</h2>
        <div class="campo"><span>Modo</span>${selectorOpciones('modo', ['Demostración', 'Mi Google Sheets'], Api.esDemo ? 'Demostración' : 'Mi Google Sheets')}</div>
        <label class="campo"><span>URL del servidor (Apps Script, termina en /exec)</span>
          <input type="url" id="url" value="${esc(Api.url)}" placeholder="https://script.google.com/macros/s/.../exec"></label>
        <div class="botones dos"><button class="btn sec" id="probar">Probar</button><button class="btn" id="guardar">Guardar</button></div>
      </div>
      <div class="tarjeta"><h2>Para tus clientes</h2>
        <p class="peq" style="margin-top:0">Comparte este enlace para que tus miembros vean sus puntos y regalen premios a su familia:</p>
        <a class="btn sec" href="miembro.html" target="_blank">🔗 Abrir "Mi membresía"</a></div>
      <div class="tarjeta"><h2>Sesión</h2><div class="botones">
        ${Api.esDemo ? '<button class="btn sec" id="reiniciar">♻️ Reiniciar datos de demostración</button>' : ''}
        <button class="btn peligro" id="salir">Cerrar sesión</button></div>
        <p class="peq suave">El PIN, los planes, servicios y premios se cambian en tu Google Sheets (hojas Config, Planes, Servicios, Recompensas).</p>
        <p class="peq suave" style="margin-bottom:0">Versión ${esc(Nucleo.VERSION)}</p></div>`;
    activarOpciones(main);
    const modoElegido = () => valorGrupo(main, 'modo') === 'Demostración' ? 'demo' : 'real';
    $('#probar').addEventListener('click', async () => {
      const antes = [Api.url, Api.modo];
      Api.url = $('#url').value; Api.modo = modoElegido();
      try { const r = await Api.llamar('ping'); toast('✅ Conectado: ' + r.negocio); }
      catch (e) { toast(e.message, true); }
      finally { Api.url = antes[0]; Api.modo = antes[1]; }
    });
    $('#guardar').addEventListener('click', () => {
      const modo = modoElegido();
      if (modo === 'real' && !/^https:\/\/script\.google(usercontent)?\.com\//.test($('#url').value.trim())) return toast('Pega la URL de Apps Script (https://script.google.com/...)', true);
      Api.url = $('#url').value; Api.modo = modo; Api.pin = ''; E.cat = null; invalidar();
      toast('Guardado. Entra con tu PIN.'); ir('#/login');
    });
    const re = $('#reiniciar');
    if (re) re.addEventListener('click', () => { if (confirm('¿Borrar todo y volver a los datos de ejemplo?')) { DemoBackend.reiniciar(); invalidar(); toast('Demo reiniciada'); } });
    $('#salir').addEventListener('click', () => { Api.pin = ''; E.cat = null; ir('#/login'); });
  }

  // ---------------------------------------------------------------- enrutador
  const RUTAS = { inicio: vistaInicio, clientes: vistaClientes, cliente: vistaCliente, nuevo: vistaNuevo,
    visita: vistaVisita, avisos: vistaAvisos, ajustes: vistaAjustes };
  const MENU = { inicio: 'inicio', visita: 'visita', clientes: 'clientes', cliente: 'clientes', nuevo: 'clientes', avisos: 'avisos' };

  async function render() {
    cerrarHoja();
    const [ruta, ...params] = (location.hash.replace(/^#\/?/, '') || 'inicio').split('/').map(decodeURIComponent);
    const main = $('#vista');
    window.scrollTo(0, 0);
    if (ruta === 'ajustes') { $('#menu').classList.toggle('oculto', !E.cat); return vistaAjustes(main); }
    if (!E.cat && Api.pin) {
      main.innerHTML = '<div class="cargando">Conectando…</div>';
      try { E.cat = await Api.llamar('catalogos'); } catch (e) { if (e.codigo === 'PIN') Api.pin = ''; else toast(e.message, true); }
    }
    if (E.cat && ruta === 'login') return ir('#/inicio');
    if (!E.cat) return vistaLogin();
    $('#menu').classList.remove('oculto');
    document.querySelectorAll('#menu a').forEach(a => a.classList.toggle('activo', a.dataset.r === MENU[ruta]));
    main.innerHTML = '<div class="cargando">Cargando…</div>';
    try {
      await (RUTAS[ruta] || vistaInicio)(main, params);
    } catch (e) {
      main.innerHTML = `<div class="vacio">😕 ${esc(e.message)}<br><br><button class="btn sec" onclick="location.reload()">Reintentar</button></div>`;
    }
    actualizarInsignia();
  }

  async function actualizarInsignia() {
    try {
      const n = (await Api.llamar('listarRecordatorios', { estado: 'pendiente' })).length;
      const i = $('#insignia-avisos'); i.textContent = n; i.classList.toggle('oculto', !n);
    } catch (e) { /* sin conexión */ }
  }

  $('#btn-atras').addEventListener('click', () => history.length > 1 ? history.back() : (location.hash = '#/inicio'));
  window.addEventListener('hashchange', render);
  render();
})();

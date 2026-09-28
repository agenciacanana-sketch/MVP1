/**
 * Onboarding: tutorial interactivo para usuarios nuevos.
 *
 * - Se muestra solo la primera vez (se recuerda en localStorage, por dispositivo).
 * - Al completarlo o saltarlo no vuelve a aparecer.
 * - Para cambiar los pasos, edita el arreglo PASOS.
 * - Si modificas el tutorial y quieres que todos lo vean de nuevo, sube el número de CLAVE (v1 → v2).
 * - Desde consola: Onboarding.reiniciar() vuelve a mostrarlo.
 */
(() => {
  'use strict';

  const CLAVE = 'club_onboarding_v1';

  // objetivo = selector CSS de lo que se resalta. Sin objetivo = cuadro centrado (bienvenida / final).
  const PASOS = [
    { icono: '💈', titulo: '¡Bienvenido al Club de Membresías!',
      texto: 'En menos de un minuto te mostramos cómo llevar tus <b>clientes, membresías y puntos</b> desde el celular.' },
    { objetivo: '.tarjeta.meta', titulo: 'Tu meta del mes',
      texto: 'Este anillo cuenta tus <b>miembros activos</b> frente a tu meta. Cada miembro nuevo lo va llenando.' },
    { objetivo: '.accion.principal', titulo: 'Registrar una visita',
      texto: 'Cuando un cliente termine su servicio, toca aquí. Queda anotada en pocos toques y el <b>descuento de su membresía se calcula solo</b>.' },
    { objetivo: '.acciones a[href="#/nuevo"]', titulo: 'Nuevo cliente',
      texto: 'Agrega a una persona con su nombre y celular. Después puedes ofrecerle una membresía.' },
    { objetivo: '.acciones a[href="#/avisos"]', titulo: 'Avisos',
      texto: 'Te dice a quién escribirle: clientes que hace rato no vienen, cumpleaños y membresías por vencer, con el <b>mensaje de WhatsApp listo</b> para enviar.' },
    { objetivo: '.segmentos', titulo: 'El semáforo de tus clientes',
      texto: '<b>Verde</b>: al día. <b>Amarillo</b>: toca recordarles. <b>Naranja</b>: en riesgo. <b>Rojo</b>: perdidos. Toca un color para ver quiénes son.' },
    { objetivo: '#menu', titulo: 'Menú inferior',
      texto: 'Muévete entre <b>Inicio, Visita, Clientes y Avisos</b> desde cualquier pantalla.' },
    { objetivo: '.barra a[href="#/ajustes"] button', titulo: 'Ajustes',
      texto: 'Con el engranaje conectas tu Google Sheets, compartes el enlace para tus clientes y puedes <b>repetir este tutorial</b> cuando quieras.' },
    { icono: '🎉', titulo: '¡Ya estás listo!',
      texto: 'Ya conoces lo esencial. Empieza registrando tu primera visita o agregando un cliente.', final: true }
  ];

  // ---------------------------------------------------------------- estado
  let activo = false, pendiente = false, vistoEnSesion = false;
  let pasos = [], paso = 0, cambio = 0;
  let capa, foco, cuadro, previo;

  const leer = () => { try { return localStorage.getItem(CLAVE); } catch (e) { return null; } };
  const guardar = estado => {
    vistoEnSesion = true;
    try { localStorage.setItem(CLAVE, JSON.stringify({ estado, fecha: new Date().toISOString() })); } catch (e) { /* modo privado */ }
  };
  const yaVisto = () => vistoEnSesion || !!leer();
  const $ = s => document.querySelector(s);

  // ---------------------------------------------------------------- entrada
  /** La app la llama después de pintar cada pantalla. Solo arranca en el Inicio y solo si es la primera vez. */
  function intentar() {
    if (activo || pendiente || yaVisto()) return;
    if (!$('#vista .acciones')) return;           // no estamos en el Inicio
    pendiente = true;
    setTimeout(() => {                             // deja que el tablero termine de asentarse
      pendiente = false;
      if (!activo && !yaVisto() && $('#vista .acciones') && !$('#velo')) iniciar();
    }, 450);
  }

  function iniciar() {
    // Solo los pasos cuyo elemento existe y se ve
    pasos = PASOS.filter(p => {
      if (!p.objetivo) return true;
      const el = $(p.objetivo);
      return el && el.getBoundingClientRect().width > 0;
    });
    if (pasos.length < 2) return;
    activo = true; paso = 0;
    previo = document.activeElement;

    capa = document.createElement('div');
    capa.className = 'ob-capa';
    foco = document.createElement('div');
    foco.className = 'ob-foco sin-objetivo';
    cuadro = document.createElement('div');
    cuadro.className = 'ob-cuadro centrado';
    cuadro.setAttribute('role', 'dialog');
    cuadro.setAttribute('aria-modal', 'true');
    cuadro.setAttribute('aria-labelledby', 'ob-titulo');
    cuadro.setAttribute('aria-describedby', 'ob-texto');
    cuadro.tabIndex = -1;
    document.body.append(capa, foco, cuadro);
    document.documentElement.classList.add('ob-bloqueado');

    cuadro.addEventListener('click', alHacerClic);
    document.addEventListener('keydown', alTeclear, true);
    window.addEventListener('resize', reubicar);
    window.addEventListener('orientationchange', reubicar);
    window.addEventListener('hashchange', alCambiarRuta);

    mostrar(0, true);
  }

  // ---------------------------------------------------------------- pasos
  function mostrar(i, primero) {
    paso = Math.max(0, Math.min(i, pasos.length - 1));
    const token = ++cambio;
    const p = pasos[paso];
    const objetivo = p.objetivo ? $(p.objetivo) : null;

    cuadro.classList.remove('visible');
    // Los elementos fijos (barra y menú) no necesitan desplazamiento
    if (objetivo && !objetivo.closest('.barra, #menu')) objetivo.scrollIntoView({ block: 'center' });

    setTimeout(() => {
      if (!activo || token !== cambio) return;
      const ultimo = paso === pasos.length - 1;
      cuadro.innerHTML = `
        ${p.icono ? `<div class="ob-icono" aria-hidden="true">${p.icono}</div>` : ''}
        <h3 id="ob-titulo">${p.titulo}</h3>
        <p id="ob-texto">${p.texto}</p>
        <div class="ob-progreso" role="img" aria-label="Paso ${paso + 1} de ${pasos.length}">
          ${pasos.map((_, k) => `<i class="${k <= paso ? 'on' : ''}"></i>`).join('')}</div>
        <div class="ob-botones">
          ${paso > 0 ? '<button type="button" class="ob-btn sec" data-ob="atras">Atrás</button>' : ''}
          <button type="button" class="ob-btn" data-ob="sig">${ultimo ? '¡Empezar!' : 'Siguiente'}</button>
        </div>
        ${ultimo ? '' : '<button type="button" class="ob-saltar" data-ob="saltar">Saltar tutorial</button>'}
        <span class="ob-flecha"></span>`;
      posicionar();
      cuadro.classList.add('visible');
      const sig = cuadro.querySelector('[data-ob="sig"]');
      if (sig) sig.focus({ preventScroll: true });
    }, primero ? 0 : 150);
  }

  /** Coloca el foco sobre el elemento y el cuadro arriba o abajo de él, sin salirse de la pantalla. */
  function posicionar(reintento) {
    const p = pasos[paso];
    const objetivo = p.objetivo ? $(p.objetivo) : null;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const M = 12, SEP = 14, PAD = 6;
    cuadro.classList.remove('arriba', 'abajo', 'sin-flecha');
    cuadro.classList.toggle('centrado', !objetivo);   // "centrado" cambia la tipografía: se aplica antes de medir
    const w = cuadro.offsetWidth, h = cuadro.offsetHeight;

    if (!objetivo) {
      foco.className = 'ob-foco sin-objetivo';
      Object.assign(foco.style, { top: vh / 2 + 'px', left: vw / 2 + 'px', width: '0px', height: '0px' });
      cuadro.classList.add('sin-flecha');
      cuadro.style.left = Math.round((vw - w) / 2) + 'px';
      cuadro.style.top = Math.max(M, Math.round((vh - h) / 2)) + 'px';
      return;
    }

    const r = objetivo.getBoundingClientRect();
    const radio = (parseFloat(getComputedStyle(objetivo).borderTopLeftRadius) || 12) + PAD;
    foco.className = 'ob-foco';
    Object.assign(foco.style, {
      top: r.top - PAD + 'px', left: r.left - PAD + 'px',
      width: r.width + PAD * 2 + 'px', height: r.height + PAD * 2 + 'px', borderRadius: radio + 'px'
    });

    const abajo = vh - (r.bottom + PAD) - M, arriba = r.top - PAD - M;
    let lado = null, top;
    if (abajo >= h + SEP) { lado = 'abajo'; top = r.bottom + PAD + SEP; }
    else if (arriba >= h + SEP) { lado = 'arriba'; top = r.top - PAD - SEP - h; }
    else if (!reintento && !objetivo.closest('.barra, #menu')) {
      // No cabe ni arriba ni abajo: sube el elemento hasta debajo de la barra para dejar espacio
      const dy = r.top - 84;
      if (Math.abs(dy) > 2) { window.scrollBy(0, dy); return posicionar(true); }
      top = vh - h - M;
    }
    else { top = vh - h - M; }                     // objetivo muy grande: cuadro pegado al borde inferior

    const left = Math.min(Math.max(r.left + r.width / 2 - w / 2, M), vw - w - M);
    cuadro.style.left = Math.round(left) + 'px';
    cuadro.style.top = Math.round(top) + 'px';

    if (lado) {
      cuadro.classList.add(lado);
      const flecha = cuadro.querySelector('.ob-flecha');
      const x = Math.min(Math.max(r.left + r.width / 2 - left - 8, 20), w - 36);
      if (flecha) flecha.style.left = Math.round(x) + 'px';
    } else {
      cuadro.classList.add('sin-flecha');
    }
  }

  function reubicar() { if (activo) posicionar(); }

  // ---------------------------------------------------------------- acciones
  const siguiente = () => paso >= pasos.length - 1 ? cerrar('completado') : mostrar(paso + 1);
  const atras = () => { if (paso > 0) mostrar(paso - 1); };
  const saltar = () => cerrar('saltado');

  function alHacerClic(e) {
    const b = e.target.closest('[data-ob]');
    if (!b) return;
    ({ sig: siguiente, atras, saltar })[b.dataset.ob]();
  }

  function alTeclear(e) {
    if (!activo) return;
    if (e.key === 'Escape') { e.preventDefault(); saltar(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); siguiente(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); atras(); }
    else if (e.key === 'Tab') {                    // el foco no se escapa del cuadro
      const f = [...cuadro.querySelectorAll('button')];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus({ preventScroll: true });
    }
  }

  // Si la persona navega con el botón "atrás" del teléfono, se cierra sin marcarlo como visto
  function alCambiarRuta() { cerrar(null); }

  function cerrar(estado) {
    if (!activo) return;
    activo = false; cambio++;
    document.removeEventListener('keydown', alTeclear, true);
    window.removeEventListener('resize', reubicar);
    window.removeEventListener('orientationchange', reubicar);
    window.removeEventListener('hashchange', alCambiarRuta);
    capa.remove(); foco.remove(); cuadro.remove();
    document.documentElement.classList.remove('ob-bloqueado');
    if (estado) guardar(estado);
    window.scrollTo(0, 0);
    if (previo && previo.focus) { try { previo.focus({ preventScroll: true }); } catch (e) { /* */ } }
  }

  /** Vuelve a mostrar el tutorial (lo usa el botón de Ajustes). */
  function reiniciar() {
    vistoEnSesion = false;
    try { localStorage.removeItem(CLAVE); } catch (e) { /* */ }
    if (location.hash === '#/inicio') intentar(); else location.hash = '#/inicio';
  }

  window.Onboarding = { intentar, reiniciar };
})();

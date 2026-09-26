/**
 * Cliente de la API. Habla con Google Apps Script (modo real)
 * o con el backend de demostración en el navegador (modo demo).
 *
 * Nota CORS: se envía el cuerpo como text/plain para que el navegador
 * NO haga la petición previa OPTIONS, que Apps Script no soporta.
 */
const Api = (() => {
  const K = { url: 'club_api_url', modo: 'club_modo', pin: 'club_pin' };
  const leer = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const escribir = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* */ } };

  // Si config.js define una URL por defecto, se usa en modo real.
  const urlPorDefecto = (window.CLUB_CONFIG && window.CLUB_CONFIG.API_URL) || '';

  const api = {
    get url() { return leer(K.url) || urlPorDefecto; },
    set url(v) { escribir(K.url, (v || '').trim()); },
    get modo() { return leer(K.modo) || (this.url ? 'real' : 'demo'); },
    set modo(v) { escribir(K.modo, v); },
    get pin() { return leer(K.pin); },
    set pin(v) { escribir(K.pin, v); },
    get esDemo() { return this.modo === 'demo' || !this.url; },

    async llamar(accion, datos = {}, pin = this.pin) {
      let r;
      if (this.esDemo) {
        await new Promise(res => setTimeout(res, 120)); // simula red
        r = DemoBackend.procesar(accion, datos, pin);
      } else {
        let resp;
        try {
          resp = await fetch(this.url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ accion, datos, pin }),
            redirect: 'follow'
          });
        } catch (e) {
          throw Object.assign(new Error('Sin conexión con el servidor. Revisa tu internet o la URL en Ajustes.'), { codigo: 'RED' });
        }
        const txt = await resp.text();
        try { r = JSON.parse(txt); } catch (e) {
          throw Object.assign(new Error('El servidor no respondió bien. ¿Publicaste la app web con acceso "Cualquier usuario"?'), { codigo: 'RESPUESTA' });
        }
      }
      if (!r.ok) throw Object.assign(new Error(r.error), { codigo: r.codigo });
      return r.datos;
    }
  };
  return api;
})();

# 💈 Club de Membresías — Barberías y Salones de Belleza

MVP de una plataforma web para que las barberías y salones de barrio (Santa Marta, estratos medios) **fidelicen a sus clientes con una membresía mensual mixta**: personal y compartida con familiares y amigos. Reemplaza el cuaderno, el Excel y el “registro mental” por un sistema simple desde el celular.

- 📱 **Frontend**: HTML/CSS/JS sin librerías, pensado para smartphones, alojado gratis en **GitHub Pages**.
- ⚙️ **Backend**: **Google Apps Script** (API `doGet`/`doPost` + disparador diario).
- 📊 **Base de datos**: **Google Sheets** (11 hojas).
- 🧪 **Modo demostración**: funciona sin configurar nada, con datos de ejemplo.

## ¿Qué hace?

| Para el dueño | Para el cliente |
|---|---|
| Tablero con la **meta de 40 miembros activos** | Carnet digital con nivel, puntos y vencimiento |
| Registrar una visita en 3 toques con el **descuento calculado solo** | Ver sus premios y cuánto le falta para el siguiente |
| Clientes por color: al día · recordar · en riesgo · perdidos | **Regalar premios** a familiares y amigos por WhatsApp |
| **Avisos diarios** con mensaje de WhatsApp listo para enviar | Apartar turno por WhatsApp |
| Beneficiarios (familia/amigos) por plan, con cupos y límite de usos | |
| Premios escalonados, niveles Bronce → Diamante, canje de puntos, referidos | |

## Probarlo ya

```bash
python3 -m http.server 8000     # o cualquier servidor estático
# abre http://localhost:8000  →  PIN de demostración: 1234
```

## Documentación (entregables)

1. [**Modelo de datos en Google Sheets**](docs/01-modelo-de-datos.md): hojas, columnas y relaciones.
2. [**Backend en Google Apps Script**](docs/02-backend-apps-script.md): instalación, endpoints, algoritmo de fidelización y recordatorios.
3. [**Integración GitHub Pages ⇄ Apps Script ⇄ Sheets**](docs/03-integracion-github-pages.md): despliegue, CORS y solución de problemas.
4. [**Manual del dueño**](docs/04-manual-del-dueno.md): guía en lenguaje sencillo.

## Estructura

```
index.html              App del dueño (PIN)
miembro.html            Página pública "Mi membresía" para clientes
assets/
  css/app.css           Estilos móviles
  js/config.js          ← aquí va la URL /exec de tu Apps Script
  js/api.js             Cliente de la API (real o demo)
  js/demo.js            Backend de demostración en localStorage
  js/app.js             Pantallas y flujos
backend/
  Nucleo.js             Lógica de negocio COMPARTIDA (Apps Script + navegador)
  BaseDatos.gs          Instalación de hojas y adaptador de Google Sheets
  Codigo.gs             doGet / doPost, PIN, bloqueo, menú de la hoja
  Automatizacion.gs     Recordatorios diarios y correo de resumen
  appsscript.json       Manifiesto (zona horaria Bogotá, V8)
pruebas/                Pruebas automáticas (node)
docs/                   Guías
```

## Pruebas

```bash
npm test     # o: node pruebas/nucleo.test.js && node pruebas/gas-simulado.test.js
```

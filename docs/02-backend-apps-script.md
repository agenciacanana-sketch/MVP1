# 2. Backend en Google Apps Script

## Archivos

| Archivo | Qué hace |
|---|---|
| `backend/Nucleo.js` | **Toda la lógica de negocio** (membresías, puntos, niveles, premios, recordatorios, referidos). Es el mismo archivo que usa el modo demo en el navegador. |
| `backend/BaseDatos.gs` | `instalar()` crea las hojas; `crearAdaptadorSheets()` lee y escribe en Sheets. |
| `backend/Codigo.gs` | Endpoints `doGet` / `doPost`, PIN, bloqueo contra escrituras simultáneas y menú “💈 Membresías”. |
| `backend/Automatizacion.gs` | Disparador diario `tareaDiaria()` y correo de resumen. |
| `backend/appsscript.json` | Zona horaria `America/Bogota`, V8 y permisos. |

## Instalación paso a paso (15 minutos)

1. Entra a [sheets.new](https://sheets.new) con la cuenta de Google del negocio. Ponle nombre, ej: *Club Barbería*.
2. Menú **Extensiones → Apps Script**.
3. Borra el contenido de `Código.gs` y crea estos archivos (botón **＋ → Secuencia de comandos**), copiando el contenido de este repositorio:
   - `Nucleo` ← `backend/Nucleo.js`
   - `BaseDatos` ← `backend/BaseDatos.gs`
   - `Codigo` ← `backend/Codigo.gs`
   - `Automatizacion` ← `backend/Automatizacion.gs`
4. *(Opcional)* ⚙️ **Configuración del proyecto → Mostrar el archivo de manifiesto** y pega `backend/appsscript.json`.
5. Arriba, elige la función **`instalar`** y pulsa **▶ Ejecutar**. Acepta los permisos (“Configuración avanzada → Ir a proyecto”). Se crean las 11 hojas y el recordatorio diario de las 7 a.m.
6. En la hoja **Config** cambia `NOMBRE_NEGOCIO`, `PIN_DUENO` y `WHATSAPP_NEGOCIO`. Ajusta precios en **Planes** y **Servicios**.
7. **Implementar → Nueva implementación → ⚙️ Aplicación web**:
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: **Cualquier usuario**
   - Copia la **URL de la aplicación web** (termina en `/exec`).

> Cada vez que cambies el código: **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva**. La URL se mantiene.

**Alternativa con [clasp](https://github.com/google/clasp):** `clasp create --type sheets --rootDir backend && clasp push`.

## Contrato de la API

Una sola URL. Todas las peticiones son `POST` con cuerpo JSON enviado como `text/plain` (ver la guía de integración):

```json
{ "accion": "registrarVisita", "pin": "1234", "datos": { "cliente_id": "CL-...", "servicio_id": "SV-CORTE" } }
```

Respuesta:

```json
{ "ok": true, "datos": { ... } }
{ "ok": false, "error": "PIN incorrecto.", "codigo": "PIN" }
```

`GET <URL>?accion=ping` también funciona (útil para probar en el navegador). Si pasas `&callback=fn`, responde en JSONP.

### Acciones

| Acción | PIN | Datos | Devuelve |
|---|---|---|---|
| `ping` | — | | versión, fecha, negocio |
| `catalogos` | ✔ | | config (sin PIN), planes, servicios, recompensas, niveles |
| `dashboard` | ✔ | | miembros activos vs meta, segmentos, ingresos del mes, por vencer, top |
| `listarClientes` | ✔ | `segmento?`, `miembros?` | resumen de cada cliente con sus beneficiarios |
| `obtenerCliente` | ✔ | `cliente_id` | ficha completa, visitas, premios, progreso |
| `registrarCliente` | ✔ | `nombre, telefono, fecha_nacimiento?, barrio?, servicio_favorito?, referido_por?, plan_id?, metodo_pago?` | cliente + membresía + bono de referido |
| `actualizarCliente` | ✔ | `cliente_id` + campos | cliente |
| `activarMembresia` | ✔ | `cliente_id, plan_id?, metodo_pago?, valor_pagado?` | vende o renueva; código, premios, enlace de bienvenida |
| `agregarBeneficiario` | ✔ | `cliente_id, nombre, telefono?, parentesco?` | beneficiario (respeta cupos del plan) |
| `quitarBeneficiario` | ✔ | `beneficiario_id` | |
| `cotizarVisita` | ✔ | igual que `registrarVisita` | vista previa del cobro (no guarda) |
| `registrarVisita` | ✔ | `cliente_id, servicio_id \| valor_lista, beneficiario_id?, rc_id?, codigo_premio?, profesional?, metodo_pago?` | visita, puntos, nivel, premios nuevos |
| `canjearPuntos` | ✔ | `cliente_id, recompensa_id` | premio generado |
| `transferirRecompensa` | ✔ | `rc_id, nombre, telefono` | premio regalado + enlace de WhatsApp para el amigo |
| `canjearRecompensa` | ✔ | `codigo, solo_consultar?` | verifica o usa un código en caja |
| `registrarReferido` | ✔ | `cliente_id, nombre, telefono` | invitación + enlace de WhatsApp |
| `generarRecordatorios` | ✔ | | resumen de avisos creados |
| `listarRecordatorios` | ✔ | `estado?` (pendiente, enviado, resuelto, todos) | avisos ordenados por prioridad |
| `marcarRecordatorio` | ✔ | `recordatorio_id, estado` (enviado/descartado) | |
| `consultaMiembro` | celular + código | `telefono, codigo` | carnet público del miembro |
| `regalarPremioMiembro` | celular + código | `telefono, codigo, rc_id, nombre, telefono_amigo` | el propio cliente regala su premio |

## Lógica de fidelización

### Descuento en cada visita
1. Titular con membresía activa → `descuento_titular_pct` del plan.
2. Beneficiario → `descuento_beneficiario_pct`, con tope de `usos_mes_beneficiario` al mes.
3. Si usa un premio (propio o regalado por código), se aplica **el mayor** entre el premio y la membresía.
4. Si un miembro **en riesgo o perdido regresa**, se aplica solo el premio `regreso` (25%).

### Puntos y niveles
```
puntos = (PUNTOS_POR_VISITA + floor(valor_pagado / 1000) × PUNTOS_POR_MIL) × multiplicador_del_nivel
```
Solo ganan puntos los miembros. Las visitas de beneficiarios suman puntos **al titular**, pero no cuentan como visitas suyas.

### Recompensas escalonadas (automáticas)
| Momento | Premio inicial |
|---|---|
| Compra la primera membresía | Bienvenida 10% |
| Visita 5, 10, 15… | 50% (cada 5) · Gratis (cada 10) |
| Sube a Plata / Oro / Diamante | 30% / gratis / gratis |
| Cumpleaños (miembro) | Servicio gratis, 15 días |
| Vuelve estando en riesgo | 25% en esa visita |
| Un amigo suyo se registra | +50 puntos y 20% |
| Cada 3 renovaciones | 50% |
| Canje | 150 pts → 50% · 300 pts → gratis |

Los premios con `transferible = si` se pueden **regalar**: cambian a estado `transferida`, se genera un mensaje de WhatsApp con el código para el amigo y el amigo queda en `Referidos`. Cuando ese amigo se registra, quien lo invitó recibe el bono.

### Algoritmo de recordatorios (`tareaDiaria`, 7 a.m.)
```
para cada membresía activa cuyo vencimiento < hoy:
    marcar "vencida" y crear aviso "vencida"
para cada cliente:
    dias = hoy − ultima_visita
    segmento = perdido (≥60) | riesgo (≥35) | recordar (≥21) | al_dia
    si segmento ∈ {recordar, riesgo, perdido}:
        crear aviso con clave  cliente|segmento|ultima_visita   ← uno por etapa, sin duplicar
    si su membresía vence en ≤ 3 días: aviso "vence"
    si hoy es su cumpleaños: aviso + premio de cumpleaños (una vez al año)
vencer premios no usados
enviar correo resumen a EMAIL_DUENO (si existe)
```
Cuando el cliente vuelve y se registra la visita, sus avisos de inactividad pendientes pasan a `resuelto`.

## Seguridad (MVP)
- La hoja **no** se comparte: solo el script (que corre como el dueño) la lee.
- Todas las acciones del dueño exigen el PIN; tras 15 intentos fallidos la API se bloquea 10 minutos.
- Recomendado: PIN de 6 números. La consulta del cliente exige celular + código de membresía.
- Las escrituras usan `LockService` para que dos celulares no se pisen.

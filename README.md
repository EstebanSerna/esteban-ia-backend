# Esteban IA — Backend

Backend en Node.js/Express que reemplaza al Google Apps Script (`google-apps-script.js`) del
proyecto de la landing (`esteban-serna.com`). Maneja:

- Reservas → evento en Google Calendar.
- Proxy de chat con Claude (simulador de IA del sitio).
- Checkout de Mercado Pago (pago único + suscripción mensual con un segundo token de la misma
  tarjeta) y su Webhook de notificaciones.
- Notificaciones por correo (Resend) y WhatsApp (Meta Cloud API) al completar una venta.

Toda la lógica es la misma que ya estaba probada en Apps Script — se migró para tener logs reales,
despliegue automático por git push, y el SDK oficial de Mercado Pago.

---

## Desarrollo local

```bash
npm install
cp .env.example .env   # y llena las variables
npm start
```

El servidor escucha en `http://localhost:3000` (o el `PORT` que definas).

---

## Configuración necesaria (una sola vez)

### 1. Mercado Pago
- `MP_ACCESS_TOKEN`: Access Token de **producción** (Developers → Tus integraciones → tu app →
  Credenciales de producción). Nunca el Public Key aquí — ese va en el frontend.
- Una vez desplegado, registra la URL pública de este backend como Webhook en el panel de Mercado
  Pago (Tu app → Webhooks), evento **Pagos**.

### 2. Google Calendar (cuenta de servicio)
Apps Script tenía acceso directo al Calendar porque corría como tu propia cuenta; aquí hay que
autenticar explícitamente:

1. Ve a [Google Cloud Console](https://console.cloud.google.com/) → crea un proyecto (o reusa uno
   existente).
2. Habilita la **Google Calendar API** (menú "APIs y servicios" → "Habilitar APIs").
3. Crea una **cuenta de servicio** ("IAM y administración" → "Cuentas de servicio" → "Crear cuenta
   de servicio"). No necesita ningún rol especial de IAM.
4. Genera una **clave JSON** para esa cuenta de servicio y descárgala.
5. Abre tu Google Calendar → Configuración → "Compartir con determinadas personas" → agrega el
   correo de la cuenta de servicio (algo como `nombre@proyecto.iam.gserviceaccount.com`, está
   dentro del JSON como `client_email`) con permiso **"Hacer cambios en los eventos"**.
6. Pega el contenido completo del JSON (en una sola línea) en la variable de entorno
   `GOOGLE_SERVICE_ACCOUNT_KEY_JSON`.

### 3. Correo (Resend)
1. Crea una cuenta gratis en [resend.com](https://resend.com) (capa gratis: 3.000 correos/mes).
2. Genera una API key y ponla en `RESEND_API_KEY`.
3. Mientras no verifiques tu dominio, los correos salen desde `onboarding@resend.dev` (funciona,
   pero se ve menos profesional). Para enviar desde tu propio dominio:
   - En Resend → "Domains" → agrega `esteban-serna.com`.
   - Te da 2-3 registros DNS (TXT/CNAME) para agregar en tu panel de hosting (StackCP).
   - Una vez verificado, cambia `RESEND_FROM` a algo como
     `Esteban IA <hola@esteban-serna.com>`.

### 4. WhatsApp (reutiliza el proyecto `whatsapp-assistant`)
Copia estas dos variables desde el servicio `whatsapp-assistant` en Railway (mismo número de
WhatsApp Business, cero configuración nueva):
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`

**Importante:** el mensaje de bienvenida es un mensaje "de negocio hacia el cliente" y el cliente
nunca le ha escrito antes a este número. La API de WhatsApp exige que este tipo de mensaje use una
**plantilla pre-aprobada por Meta** (no un texto libre) — revisa en tu WhatsApp Business Manager si
ya tienes una plantilla de "confirmación de compra" aprobada. Si no, hay que crear una y esperar la
aprobación (normalmente minutos a un día). Mientras tanto, el código intenta un mensaje de texto
libre; si Meta lo rechaza por esto, el error queda registrado en los logs pero no bloquea el resto
del flujo (el correo de bienvenida sí llega).

### 5. Claude
- `ANTHROPIC_API_KEY`: la misma que ya usabas en Apps Script.

### 6. Variables generales
- `ESTEBAN_EMAIL`: correo que recibe las notificaciones internas de venta.
- `PUBLIC_BASE_URL`: la URL pública de este servicio en Railway (para `notification_url` de
  Mercado Pago) — Railway te la da al generar el dominio del servicio.
- `ALLOWED_ORIGIN`: `https://esteban-serna.com` (para CORS).

---

## Rutas

Para minimizar cambios en el frontend, se mantiene el mismo patrón de Apps Script: **un solo
endpoint** (`POST /`), que enruta según el campo `action` del body (o según `type`/`data.id` si es
un Webhook de Mercado Pago):

| `action` | Qué hace |
|---|---|
| *(ninguno, campos de reserva)* | Crea el evento de reserva en Calendar |
| `chat` | Proxy de chat con Claude |
| `mp_checkout` | Cobra el pago único y activa la suscripción |
| `mp_test_subscription` | Solo prueba `/preapproval` (no cobra nada) — herramienta de diagnóstico |
| *(Webhook de MP: `type: "payment"`)* | Retoma un pago que había quedado "en revisión" |

`GET /` es el healthcheck que usa Railway.

---

## Diseño: por qué no hay base de datos

Los datos del checkout que hacen falta para retomar la suscripción si el pago queda "en revisión"
(el segundo token de la tarjeta, el plan, el WhatsApp, etc.) se guardan en el campo `metadata` del
propio pago en Mercado Pago — no en una base de datos propia. Cuando llega el Webhook, se vuelve a
pedir ese mismo pago por su id y se lee la metadata desde ahí. Esto es intencional: mantiene el
servicio sin estado (aparte de un set en memoria para no procesar el mismo Webhook dos veces).

---

## Actualizar el frontend

Una vez que este backend esté desplegado y probado en Railway, el único cambio que falta en el
sitio (`js/app.js`) es apuntar `DEFAULT_WEBHOOK_URL` a la nueva URL de Railway en vez de la de
Apps Script.

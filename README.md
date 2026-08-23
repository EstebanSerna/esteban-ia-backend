# Esteban IA — Backend

Backend en Node.js/Express que reemplaza al Google Apps Script (`google-apps-script.js`) del
proyecto de la landing (`esteban-serna.com`). Maneja:

- Reservas → evento en Google Calendar.
- Proxy de chat con Claude (simulador de IA del sitio).
- Checkout de Mercado Pago (pago único + suscripción mensual con un segundo token de la misma
  tarjeta) y su Webhook de notificaciones.
- Notificaciones por correo (Resend) y WhatsApp (Meta Cloud API) al completar una venta.
- Blog automático: cada 3 días investiga un tema con Claude (búsqueda web real) y escribe un
  artículo 100% original, genera su portada, y manda un correo para aprobarlo o descartarlo antes
  de publicarlo en `esteban-serna.com/blog/` (ver sección "Blog automático" más abajo).

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
- `ANTHROPIC_API_KEY`: la misma que ya usabas en Apps Script. También la usa el blog automático
  (investiga con la herramienta oficial de búsqueda web de Claude y escribe el artículo).

### 6. Blog automático (GitHub como base de datos)
- `GITHUB_TOKEN`: token de acceso personal (fine-grained), con permiso **Contents: Read/write**
  únicamente sobre el repo `EstebanSerna/esteban-ia`. Se usa para leer/escribir los archivos del
  blog (borradores, posts, `posts.json`, `sitemap.xml`) directamente vía la API de GitHub — no hay
  base de datos aparte, el propio repo del frontend es el almacenamiento.
- `BLOG_GITHUB_REPO`: opcional, por defecto `EstebanSerna/esteban-ia`.
- `BLOG_APPROVAL_SECRET`: secreto para firmar (HMAC-SHA256) los enlaces "Publicar"/"Descartar" del
  correo de revisión — no se guarda ningún token, se recalcula y compara en cada clic. Generar uno
  con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` y no cambiarlo
  después (invalidaría cualquier correo de aprobación pendiente).

### 7. Variables generales
- `ESTEBAN_EMAIL`: correo que recibe las notificaciones internas de venta y los borradores del blog
  para aprobar.
- `PUBLIC_BASE_URL`: la URL pública de este servicio en Railway (para `notification_url` de
  Mercado Pago y para los enlaces de aprobación del blog) — Railway te la da al generar el dominio
  del servicio.
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

Además, dos rutas propias del blog (enlaces del correo de aprobación, no pensadas para llamarse a
mano):

| Ruta | Qué hace |
|---|---|
| `GET /blog/approve?slug=...&token=...` | Publica el borrador: crea la página, actualiza el índice, `posts.json` y `sitemap.xml`, y borra el borrador |
| `GET /blog/discard?slug=...&token=...` | Borra el borrador sin publicar nada |

---

## Blog automático

Cada día a las 9am (`America/Bogota`) corre un cron (`node-cron`, ver `src/blogScheduler.js`), pero
solo genera un artículo si han pasado 3 días desde el último — no hay que administrar fechas, se
calcula sola comparando el día actual contra un contador en memoria (si el proceso se reinicia justo
ese día, en el peor caso se genera un artículo con 1 día de diferencia, no es grave).

**Flujo completo:**
1. Se elige un tema de una lista rotativa de 15 (`src/services/blogTopics.js`, basada en la fecha —
   sin estado persistido).
2. Claude investiga el tema con su herramienta oficial de búsqueda web (hasta 5 búsquedas) y escribe
   un artículo 100% original (nunca copia las fuentes) — ver `src/services/blogGenerator.js`. El
   precio real de los planes va inyectado en el prompt para que Claude nunca invente cifras, y el
   prompt prohíbe explícitamente mencionar herramientas como Make o n8n (se habla de "agentes",
   "automatización de procesos" en términos genéricos).
3. Se genera una imagen de portada (1200×630, on-brand, sin fotos de stock) con `satori` +
   `@resvg/resvg-js` — ver `src/services/coverImage.js`.
4. Todo se sube como **borrador** al repo `esteban-ia` vía la API de GitHub (`blog/drafts/{slug}.*`
   — no enlazado desde ningún lado, bloqueado en `robots.txt`, con `noindex,nofollow`) — ver
   `src/services/github.js` y `src/services/blogPublisher.js`.
5. Llega un correo a `ESTEBAN_EMAIL` con el artículo completo, un enlace de vista previa, y dos
   botones: **Publicar** / **Descartar** (enlaces firmados con `BLOG_APPROVAL_SECRET`, sin estado
   que expire ni se pueda perder — ver `src/services/blogApproval.js`).
6. Al hacer clic, `GET /blog/approve` o `GET /blog/discard` ejecutan la acción. Publicar mueve los
   archivos de `blog/drafts/` a `blog/posts/`, regenera `blog/index.html`, actualiza `posts.json` y
   agrega la URL a `sitemap.xml` — todo en commits separados al repo del frontend, que dispara su
   propio despliegue por GitHub Actions.

**Para disparar la generación manualmente** (sin esperar el cron), no hay una ruta HTTP para esto
— usa la consola de Railway (`railway run node -e "import('./src/blogScheduler.js').then(m => m.generateAndNotify())"`)
o corre el mismo código en local con las variables de entorno cargadas.

**Re-generar posts ya publicados** (por ejemplo tras un cambio de plantilla/footer) tampoco tiene
ruta HTTP — son funciones internas (`regeneratePost`/`regenerateAll`/`regenerateIndex` en
`src/services/blogPublisher.js`) pensadas para llamarse igual, desde una consola puntual, cuando
haga falta. Se quitaron sus rutas `/debug/*` una vez cumplieron su propósito inicial (ver historial
de git si hace falta recuperarlas).

**Limitación conocida:** `regeneratePost` necesita `blog/posts/{slug}.json` (los datos completos del
artículo, no solo el HTML). Los posts publicados después de que esto se agregó lo tienen; el primer
post publicado (antes de este cambio) no, así que no se puede regenerar automáticamente — habría que
reconstruir su JSON a mano si algún día necesita una plantilla nueva.

---

## Diseño: por qué no hay base de datos

Los datos del checkout que hacen falta para retomar la suscripción si el pago queda "en revisión"
(el segundo token de la tarjeta, el plan, el WhatsApp, etc.) se guardan en el campo `metadata` del
propio pago en Mercado Pago — no en una base de datos propia. Cuando llega el Webhook, se vuelve a
pedir ese mismo pago por su id y se lee la metadata desde ahí. Esto es intencional: mantiene el
servicio sin estado (aparte de un set en memoria para no procesar el mismo Webhook dos veces).

El blog sigue la misma filosofía: en vez de una base de datos, el propio repo `esteban-ia` en
GitHub es el almacenamiento (borradores, posts, manifiesto, sitemap), y los enlaces de aprobación
del correo son tokens firmados sin estado (se verifican recalculando el HMAC, no consultando ningún
registro).

---

## Actualizar el frontend

Una vez que este backend esté desplegado y probado en Railway, el único cambio que falta en el
sitio (`js/app.js`) es apuntar `DEFAULT_WEBHOOK_URL` a la nueva URL de Railway en vez de la de
Apps Script.

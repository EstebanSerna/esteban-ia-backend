import express from "express";
import cors from "cors";

import { isWithinRateLimit } from "./utils/rateLimit.js";
import { callClaude } from "./services/chat.js";
import { parseDateTime } from "./services/booking.js";
import { createCalendarEvent } from "./services/calendar.js";
import {
  createOneTimePayment,
  getPayment,
  createSubscription,
  cancelSubscription,
  translatePaymentStatusDetail
} from "./services/mercadopago.js";
import {
  notifySuccessfulSale,
  sendWelcomeEmailToCustomer,
  sendWelcomeWhatsAppToCustomer,
  notifyPartialCheckoutFailure,
  notifyPendingPayment,
  notifyPendingResolvedAsRejected
} from "./services/notifications.js";
import { formatCOP } from "./utils/format.js";
import { startBlogScheduler } from "./blogScheduler.js";
import { publishDraft, discardDraft } from "./services/blogPublisher.js";
import { verifyApprovalToken } from "./services/blogApproval.js";

const CHAT_RATE_LIMIT_PER_MINUTE = 20;
const CHECKOUT_RATE_LIMIT_PER_MINUTE = 10;

const app = express();

// ALLOWED_ORIGIN admite una lista separada por comas (ej. dominio raiz y
// "www." al mismo tiempo) -- con un solo string fijo, cors() lo devuelve tal
// cual sin importar el Origin real de la petición, y el navegador bloquea
// la respuesta si no coincide EXACTO con el origen desde el que se navegó
// (esteban-serna.com hace redirect a www.esteban-serna.com a nivel de
// hosting, así que hacían falta los dos).
const allowedOrigins = (process.env.ALLOWED_ORIGIN || "*").split(",").map((o) => o.trim());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origen no permitido por CORS: ${origin}`));
    }
  }
}));
// El frontend manda Content-Type: text/plain a propósito (evita el
// preflight de CORS -- es el mismo truco que usaba con Apps Script), asi
// que hay que parsear el body como JSON sin importar el Content-Type que
// venga, en vez del "application/json" exacto que exige express.json()
// por defecto.
app.use(express.json({ limit: "1mb", type: () => true }));

// Healthcheck para Railway.
app.get("/", (_req, res) => res.status(200).json({ ok: true, service: "esteban-ia-backend" }));

function approvalResultPage(title, message, color) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${title}</title>
  <style>body{font-family:Arial,sans-serif;background:#040405;color:#f0f0f5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px;}
  .box{max-width:480px;} h1{color:${color};font-size:22px;} p{color:#9090a0;font-size:14px;}</style></head>
  <body><div class="box"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

// Enlaces del correo de revision del blog.
app.get("/blog/approve", async (req, res) => {
  const { slug, token } = req.query;
  if (!slug || !verifyApprovalToken(slug, "publish", token)) {
    return res.status(403).send(approvalResultPage("Enlace inválido", "Este enlace ya se usó o no es válido.", "#e74c3c"));
  }
  try {
    const entry = await publishDraft(slug);
    res.send(approvalResultPage("✅ Publicado", `"${entry.title}" ya está en vivo en el blog.`, "#2ecc71"));
  } catch (err) {
    console.error("Error publicando articulo de blog:", err);
    res.status(200).send(approvalResultPage("Error al publicar", err.message, "#e74c3c"));
  }
});

app.get("/blog/discard", async (req, res) => {
  const { slug, token } = req.query;
  if (!slug || !verifyApprovalToken(slug, "discard", token)) {
    return res.status(403).send(approvalResultPage("Enlace inválido", "Este enlace ya se usó o no es válido.", "#e74c3c"));
  }
  try {
    await discardDraft(slug);
    res.send(approvalResultPage("🗑️ Descartado", "El borrador se eliminó, no se publicó nada.", "#f1c40f"));
  } catch (err) {
    console.error("Error descartando articulo de blog:", err);
    res.status(200).send(approvalResultPage("Error al descartar", err.message, "#e74c3c"));
  }
});

// Evita duplicar el procesamiento cuando Mercado Pago reintenta el mismo
// aviso de Webhook varias veces seguidas (comportamiento normal de MP).
// Limitacion conocida: vive en memoria, un reinicio del proceso justo en
// medio de la ventana podria dejar pasar un reintento -- riesgo bajo y
// aceptable para esta version.
const processedWebhookPaymentIds = new Set();

app.post("/", async (req, res) => {
  const data = req.body || {};

  try {
    // --- Webhook de Mercado Pago ---
    if (data.type === "payment" && data.data && data.data.id) {
      await handleMercadoPagoWebhook(data.data.id);
      return res.status(200).json({ success: true });
    }

    // --- Proxy de chat con Claude ---
    if (data.action === "chat") {
      return res.json(await handleChat(data));
    }

    // --- Checkout de Mercado Pago ---
    if (data.action === "mp_checkout") {
      return res.json(await handleCheckout(data));
    }

    // --- Herramienta de diagnostico: solo prueba la suscripcion ---
    if (data.action === "mp_test_subscription") {
      return res.json(await handleTestSubscription(data));
    }

    // --- Reserva por defecto ---
    return res.json(await handleBooking(data));
  } catch (err) {
    console.error("Error en POST /:", err);
    return res.status(200).json({ success: false, error: err.message });
  }
});

// Mercado Pago tambien puede llamar con GET a la notification_url en
// algunos flujos legados (IPN v1) -- se responde 200 sin hacer nada para
// no generar reintentos infinitos.
app.get("/mp-webhook-ping", (_req, res) => res.status(200).send("ok"));

async function handleChat(data) {
  if (!data.userText || !data.systemPrompt) {
    return { success: false, error: "Faltan datos del mensaje" };
  }
  if (!isWithinRateLimit("chat", CHAT_RATE_LIMIT_PER_MINUTE)) {
    return { success: false, error: "Límite de mensajes por minuto alcanzado, intenta de nuevo en un momento" };
  }
  try {
    const text = await callClaude({ userText: data.userText, systemPrompt: data.systemPrompt, history: data.history });
    return { success: true, text };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleBooking(data) {
  if (!data.name || !data.date || !data.time || !data.service) {
    return { success: false, error: "Faltan campos requeridos (nombre, fecha, hora o servicio)" };
  }

  const { startDate, durationMinutes } = parseDateTime(data.date, data.time, data.service);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

  const description =
    `Detalles de la Reserva:\n-----------------------------------\n` +
    `📌 Servicio: ${data.service}\n👤 Cliente: ${data.name}\n✉ Correo: ${data.email}\n` +
    `💬 WhatsApp: ${data.whatsapp}\n🔗 Redes Sociales: ${data.social}\n🎯 Objetivo/Área de Apoyo: ${data.goal}\n\n` +
    `Creado automáticamente desde la web de Esteban IA.`;

  const eventId = await createCalendarEvent({
    summary: `Sesión: ${data.name} (${data.service})`,
    description,
    startDate,
    endDate,
    attendeeEmail: data.email
  });

  return { success: true, eventId, startTime: startDate.toISOString(), endTime: endDate.toISOString() };
}

async function handleCheckout(data) {
  if (!data.oneTimeToken || !data.subscriptionToken || !data.paymentMethodId || !data.payerEmail || !data.oneTimeAmount || !data.monthlyAmount) {
    return { success: false, error: "Faltan datos para procesar el pago" };
  }
  if (!isWithinRateLimit("checkout", CHECKOUT_RATE_LIMIT_PER_MINUTE)) {
    return { success: false, error: "Demasiados intentos de pago en poco tiempo. Espera un momento e intenta de nuevo." };
  }

  const payment = await createOneTimePayment(data);
  console.log(`Pago /v1/payments -> status=${payment.status} status_detail=${payment.status_detail} id=${payment.id}`);

  // Si el pago se resolvio al instante (no quedo pendiente), se marca ya
  // mismo como "procesado" para el Webhook -- Mercado Pago suele avisar el
  // Webhook casi en simultaneo, y sin este marcador el Webhook intenta
  // activar la MISMA suscripcion en paralelo con este mismo flujo, usando
  // el mismo subscriptionToken (de un solo uso) -- el que llega segundo
  // falla con un error de tarjeta que no tiene nada que ver con la tarjeta
  // en si. Solo debe actuar el Webhook cuando el pago SI quedo pendiente.
  if (payment.status !== "in_process" && payment.status !== "pending") {
    processedWebhookPaymentIds.add(String(payment.id));
  }

  if (payment.status === "in_process" || payment.status === "pending") {
    await notifyPendingPayment(data, payment);
    return {
      success: false,
      paymentApproved: false,
      paymentPending: true,
      error: "Tu pago quedó en revisión. Te confirmaremos por correo en cuanto se apruebe (puede tardar unos minutos)."
    };
  }

  if (payment.status !== "approved") {
    const reason = translatePaymentStatusDetail(payment.status_detail) || payment.message || "Tu pago no fue aprobado";
    return { success: false, paymentApproved: false, error: reason };
  }

  const activation = await activateSubscriptionAndNotify(data, payment);
  if (!activation.subscriptionActive) {
    return {
      success: false,
      paymentApproved: true,
      subscriptionActive: false,
      error: "El pago se procesó pero la suscripción no pudo activarse",
      debugSubResult: activation.subscriptionResult
    };
  }

  return {
    success: true,
    paymentApproved: true,
    subscriptionActive: true,
    paymentId: payment.id,
    subscriptionId: activation.subscriptionResult.id
  };
}

// Comparte la logica de "pago ya aprobado -> activar suscripcion + avisar"
// entre el flujo sincrono (handleCheckout) y el Webhook (pago que quedo
// pendiente y se aprobo despues).
async function activateSubscriptionAndNotify(data, payment) {
  const { result: subscriptionResult, startDate } = await createSubscription({
    payerEmail: data.payerEmail,
    subscriptionToken: data.subscriptionToken,
    planTitle: data.planTitle,
    serviceKey: data.serviceKey,
    monthlyAmount: data.monthlyAmount
  });
  console.log(`Suscripcion /preapproval -> ${JSON.stringify(subscriptionResult)}`);

  const subscriptionActive = subscriptionResult.status === "authorized" || subscriptionResult.status === "pending";
  if (!subscriptionActive) {
    await notifyPartialCheckoutFailure(data, payment, subscriptionResult);
    return { subscriptionActive: false, subscriptionResult };
  }

  try {
    await createCalendarEvent({
      summary: `Venta: ${data.cardholderName || data.payerEmail} (${data.planTitle || "Plan"})`,
      description:
        `Pago único: ${formatCOP(data.oneTimeAmount)}\n` +
        `Suscripción: ${formatCOP(data.monthlyAmount)}/mes (empieza en 30 días)\n` +
        `Correo: ${data.payerEmail}\nWhatsApp: ${data.payerWhatsapp || "no proporcionado"}\n` +
        `ID Pago: ${payment.id}\nID Suscripción: ${subscriptionResult.id}`,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 60 * 1000)
    });
  } catch (calErr) {
    console.error("No se pudo registrar el evento de venta en Calendar:", calErr.message);
  }

  await notifySuccessfulSale(data, payment, subscriptionResult, startDate);
  await sendWelcomeEmailToCustomer(data, payment, subscriptionResult, startDate);
  await sendWelcomeWhatsAppToCustomer(data, startDate);

  return { subscriptionActive: true, subscriptionResult };
}

// Webhook de Mercado Pago: retoma un pago que habiamos dejado "en revision"
// si ya se resolvio (aprobado o rechazado). Lee los datos originales del
// checkout desde la metadata guardada en el propio pago -- no necesitamos
// una base de datos aparte para esto.
async function handleMercadoPagoWebhook(paymentId) {
  if (processedWebhookPaymentIds.has(String(paymentId))) return;

  const payment = await getPayment(paymentId);
  const metadata = payment.metadata || {};
  if (!metadata.subscription_token) return; // no es un pago nuestro que hayamos dejado pendiente

  if (payment.status === "approved") {
    processedWebhookPaymentIds.add(String(paymentId));
    const data = {
      subscriptionToken: metadata.subscription_token,
      payerEmail: metadata.payer_email,
      payerWhatsapp: metadata.payer_whatsapp,
      planTitle: metadata.plan_title,
      serviceKey: metadata.service_key,
      oneTimeAmount: metadata.one_time_amount,
      monthlyAmount: metadata.monthly_amount,
      docType: metadata.doc_type,
      docNumber: metadata.doc_number,
      cardholderName: metadata.cardholder_name
    };
    await activateSubscriptionAndNotify(data, payment);
  } else if (payment.status === "rejected" || payment.status === "cancelled") {
    processedWebhookPaymentIds.add(String(paymentId));
    await notifyPendingResolvedAsRejected(
      {
        planTitle: metadata.plan_title,
        cardholderName: metadata.cardholder_name,
        payerEmail: metadata.payer_email,
        payerWhatsapp: metadata.payer_whatsapp
      },
      payment
    );
  }
}

// Herramienta de diagnostico: prueba UNICAMENTE la creacion de la
// suscripcion (sin cobrar el pago unico). Si llega a crearse de verdad, se
// cancela de inmediato para no dejarla cobrando.
async function handleTestSubscription(data) {
  if (!data.subscriptionToken || !data.payerEmail) {
    return { success: false, error: "Faltan datos para la prueba" };
  }
  if (!isWithinRateLimit("checkout", CHECKOUT_RATE_LIMIT_PER_MINUTE)) {
    return { success: false, error: "Demasiados intentos, espera un momento." };
  }

  const { result: subscriptionResult } = await createSubscription({
    payerEmail: data.payerEmail,
    subscriptionToken: data.subscriptionToken,
    planTitle: "PRUEBA DE DIAGNOSTICO (no real) - Esteban IA",
    serviceKey: "test",
    monthlyAmount: data.monthlyAmount || 10000
  });
  console.log(`[DEBUG] Respuesta cruda de /preapproval: ${JSON.stringify(subscriptionResult)}`);

  const subscriptionActive = subscriptionResult.status === "authorized" || subscriptionResult.status === "pending";
  if (subscriptionActive && subscriptionResult.id) {
    try {
      await cancelSubscription(subscriptionResult.id);
      console.log(`[DEBUG] Suscripción de prueba ${subscriptionResult.id} cancelada automáticamente.`);
    } catch (cancelErr) {
      console.error(`[DEBUG] No se pudo cancelar la suscripción de prueba ${subscriptionResult.id}:`, cancelErr.message);
    }
  }

  return { success: true, subscriptionActive, raw: subscriptionResult };
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`esteban-ia-backend escuchando en el puerto ${port}`);
  startBlogScheduler();
});

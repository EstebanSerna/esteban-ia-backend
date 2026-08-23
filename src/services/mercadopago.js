// Integracion con Mercado Pago usando el SDK OFICIAL de Node (a diferencia
// de Apps Script, que tenia que armar las llamadas HTTP a mano con
// UrlFetchApp). Esto ademas cuenta para el punto "SDK de backend" de la
// medicion de "Calidad de integracion" de Mercado Pago.
import { MercadoPagoConfig, Payment, PreApproval } from "mercadopago";

const SUBSCRIPTION_FREE_TRIAL_DAYS = 30;

function getClient() {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error("MP_ACCESS_TOKEN no configurado");
  return new MercadoPagoConfig({ accessToken, options: { timeout: 8000 } });
}

function getWebhookUrl() {
  const base = process.env.PUBLIC_BASE_URL;
  return base ? `${base.replace(/\/$/, "")}/` : undefined;
}

// Cobra el pago unico de implementacion. `data` trae los campos que manda
// el formulario del sitio (ver src/routes/index.js). Los datos del checkout
// que hacen falta para retomar la suscripcion despues (si el pago queda
// "en revision") se guardan en `metadata` DENTRO del propio pago de
// Mercado Pago -- asi no necesitamos una base de datos propia: cuando el
// Webhook nos avise despues, solo hay que volver a pedir este mismo pago
// por su id y leer metadata.
export async function createOneTimePayment(data) {
  const client = getClient();
  const payment = new Payment(client);

  const [firstName, ...rest] = (data.cardholderName || "").trim().split(/\s+/);
  const lastName = rest.join(" ");

  const body = {
    transaction_amount: Number(data.oneTimeAmount),
    token: data.oneTimeToken,
    description: `${data.planTitle || "Implementación Esteban IA"} - Pago Único`,
    statement_descriptor: "ESTEBAN IA",
    installments: 1,
    payment_method_id: data.paymentMethodId,
    external_reference: `pay_${(data.serviceKey || "plan").replace(/\s+/g, "_")}_${Date.now()}`,
    notification_url: getWebhookUrl(),
    payer: {
      email: data.payerEmail,
      first_name: firstName || "",
      last_name: lastName || "",
      identification: { type: data.docType || "CC", number: data.docNumber || "" }
    },
    additional_info: {
      items: [
        {
          id: (data.serviceKey || "plan").replace(/\s+/g, "_").toLowerCase(),
          title: data.planTitle || "Plan Esteban IA",
          description: `Implementación de ${data.planTitle || "agente de IA"} para negocio - pago único inicial`,
          category_id: "services",
          quantity: 1,
          unit_price: Number(data.oneTimeAmount)
        }
      ],
      payer: { first_name: firstName || "", last_name: lastName || "", phone: { number: data.payerWhatsapp || "" } }
    },
    // Metadata propia: se recupera despues si el pago queda pendiente y hay
    // que retomarlo desde el Webhook. Mercado Pago exige valores string.
    metadata: {
      subscription_token: data.subscriptionToken || "",
      payer_email: data.payerEmail || "",
      payer_whatsapp: data.payerWhatsapp || "",
      plan_title: data.planTitle || "",
      service_key: data.serviceKey || "",
      one_time_amount: String(data.oneTimeAmount || ""),
      monthly_amount: String(data.monthlyAmount || ""),
      doc_type: data.docType || "",
      doc_number: data.docNumber || "",
      cardholder_name: data.cardholderName || ""
    }
  };
  if (data.issuerId) body.issuer_id = data.issuerId;

  const requestOptions = { idempotencyKey: cryptoRandomId() };
  // Device ID anti-fraude: va como header, no como campo del body (Mercado
  // Pago lo rechaza como campo invalido si se manda en additional_info).
  if (data.deviceId) {
    requestOptions.customHeaders = { "X-meli-session-id": data.deviceId };
  }

  return payment.create({ body, requestOptions });
}

// Trae un pago ya existente por su id (lo usa el Webhook para revisar el
// estado actual y leer la metadata guardada al crearlo).
export async function getPayment(paymentId) {
  const client = getClient();
  const payment = new Payment(client);
  return payment.get({ id: paymentId });
}

// Activa la suscripcion mensual con el SEGUNDO token de la tarjeta (un
// CardToken de Mercado Pago solo sirve una vez). La suscripcion queda
// autorizada desde ya, pero el primer cobro mensual no ocurre hasta dentro
// de SUBSCRIPTION_FREE_TRIAL_DAYS (el pago unico de hoy ya cubre la
// implementacion).
export async function createSubscription({ payerEmail, subscriptionToken, planTitle, serviceKey, monthlyAmount }) {
  const client = getClient();
  const preapproval = new PreApproval(client);

  const startDate = new Date(Date.now() + SUBSCRIPTION_FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const body = {
    payer_email: payerEmail,
    card_token_id: subscriptionToken,
    reason: `${planTitle || "Esteban IA"} - Sostenimiento Mensual`,
    external_reference: `sub_${(serviceKey || "plan").replace(/\s+/g, "_")}_${Date.now()}`,
    back_url: "https://esteban-serna.com/",
    notification_url: getWebhookUrl(),
    status: "authorized",
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      start_date: startDate.toISOString(),
      transaction_amount: Number(monthlyAmount),
      currency_id: "COP"
    }
  };

  const result = await preapproval.create({ body });
  return { result, startDate };
}

export async function cancelSubscription(preapprovalId) {
  const client = getClient();
  const preapproval = new PreApproval(client);
  return preapproval.update({ id: preapprovalId, body: { status: "cancelled" } });
}

// Traduce los codigos mas comunes de rechazo de Mercado Pago a un mensaje
// entendible para el cliente.
const REJECTION_MESSAGES = {
  cc_rejected_insufficient_amount: "Tu tarjeta no tiene fondos suficientes.",
  cc_rejected_bad_filled_security_code: "El código de seguridad (CVV) es incorrecto.",
  cc_rejected_bad_filled_date: "La fecha de vencimiento es incorrecta.",
  cc_rejected_bad_filled_other: "Revisa los datos de tu tarjeta e intenta de nuevo.",
  cc_rejected_bad_filled_card_number: "El número de tarjeta es incorrecto.",
  cc_rejected_call_for_authorize: "Tu banco requiere que autorices el pago directamente con ellos.",
  cc_rejected_card_disabled: "Tu tarjeta está deshabilitada. Contacta a tu banco o usa otra tarjeta.",
  cc_rejected_duplicated_payment: "Ya se registró un pago igual hace poco. Si no fuiste tú, contáctanos.",
  cc_rejected_high_risk: "El pago fue rechazado por seguridad. Prueba con otra tarjeta.",
  cc_rejected_max_attempts: "Alcanzaste el máximo de intentos permitidos con esta tarjeta.",
  cc_rejected_other_reason: "Tu banco rechazó el pago. Prueba con otra tarjeta o método."
};

export function translatePaymentStatusDetail(statusDetail) {
  return REJECTION_MESSAGES[statusDetail] || null;
}

function cryptoRandomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

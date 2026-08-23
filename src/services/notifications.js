import { sendEmail } from "./email.js";
import { sendWhatsAppText } from "./whatsapp.js";
import { formatCOP, formatSpanishDate, escapeHtml } from "../utils/format.js";

const ESTEBAN_EMAIL = process.env.ESTEBAN_EMAIL || "esteban.serna.garcia@gmail.com";
const BOOKING_URL = "https://esteban-serna.com/#reservar";

// Correo con el articulo nuevo listo para revisar, y los dos botones de
// accion (publicar / descartar) -- el articulo NO sale en vivo hasta que
// se le de clic a "Publicar".
export async function notifyBlogDraftReady(article, { approveUrl, discardUrl, previewUrl }) {
  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 640px; margin: 0 auto; color: #1a1a1a;">
      <div style="background: linear-gradient(135deg, #f3e5ab 0%, #d4af37 50%, #aa7c11 100%); padding: 24px 28px; border-radius: 10px 10px 0 0;">
        <div style="font-size: 20px; font-weight: 700; color: #1a1a1a;">Esteban IA — Blog</div>
        <div style="font-size: 11px; color: #3a3a3a; letter-spacing: 1px; text-transform: uppercase;">Nuevo artículo listo para revisar</div>
      </div>
      <div style="border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 10px 10px; padding: 28px;">
        <h2 style="font-size: 20px; margin: 0 0 6px;">${escapeHtml(article.title)}</h2>
        <p style="font-size: 13px; color: #666; margin: 0 0 20px;">${escapeHtml(article.excerpt)}</p>

        <p style="text-align:center; margin-bottom: 16px;">
          <a href="${previewUrl}" style="color: #a67c00; font-size: 13px;">👁️ Ver el artículo completo antes de decidir</a>
        </p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${approveUrl}" style="background: linear-gradient(135deg, #f3e5ab 0%, #d4af37 50%, #aa7c11 100%); color: #1a1a1a; text-decoration: none; font-weight: 700; padding: 12px 28px; border-radius: 8px; display: inline-block; font-size: 14px; margin: 0 8px 10px;">✅ Publicar</a>
          <a href="${discardUrl}" style="background: #f0f0f0; color: #444; text-decoration: none; font-weight: 700; padding: 12px 28px; border-radius: 8px; display: inline-block; font-size: 14px; margin: 0 8px 10px;">🗑️ Descartar</a>
        </div>

        <p style="font-size: 12px; color: #999; text-align: center;">Si no haces nada, el artículo se queda como borrador sin publicar — no afecta el sitio.</p>
      </div>
    </div>`;

  try {
    await sendEmail({
      to: ESTEBAN_EMAIL,
      subject: `📝 Nuevo artículo de blog para revisar: ${article.title}`,
      text: `Nuevo artículo listo para revisar: "${article.title}"\n\n${article.excerpt}\n\nVerlo: ${previewUrl}\nPublicar: ${approveUrl}\nDescartar: ${discardUrl}`,
      html
    });
  } catch (err) {
    console.error("Fallo el envio del correo de borrador de blog:", err.message);
  }
}

// Correo interno a Esteban: la senal para arrancar la implementacion.
export async function notifySuccessfulSale(data, payment, subscription, subscriptionStartDate) {
  try {
    await sendEmail({
      to: ESTEBAN_EMAIL,
      subject: `🎉 Nueva venta: ${data.planTitle || "Plan"} — ${data.cardholderName || data.payerEmail}`,
      text:
        `¡Nueva venta confirmada! Ya se puede arrancar la implementación.\n\n` +
        `Cliente: ${data.cardholderName || "-"}\n` +
        `Correo: ${data.payerEmail}\n` +
        `WhatsApp: ${data.payerWhatsapp || "no proporcionado"}\n` +
        `Documento: ${data.docType || ""} ${data.docNumber || ""}\n\n` +
        `Plan: ${data.planTitle || "-"}\n` +
        `Pago único cobrado: ${formatCOP(data.oneTimeAmount)} (ID: ${payment.id})\n` +
        `Suscripción mensual: ${formatCOP(data.monthlyAmount)}/mes, primer cobro el ${formatSpanishDate(subscriptionStartDate)} (ID: ${subscription.id})\n\n` +
        `Contáctalo por WhatsApp para coordinar el inicio de la implementación.`
    });
  } catch (err) {
    console.error("Fallo el envio del correo de venta a Esteban:", err.message);
  }
}

// Correo profesional de bienvenida para el CLIENTE. Confirma la compra,
// pide que corrija el WhatsApp si esta mal, y ofrece agendar la sesion de
// inicio de una vez (via el motor de reservas que ya existe en el sitio).
export async function sendWelcomeEmailToCustomer(data, payment, subscription, subscriptionStartDate) {
  const rawFirstName = (data.cardholderName || "").trim().split(/\s+/)[0] || "";
  const rawPlanTitle = data.planTitle || "Plan Esteban IA";
  const rawPayerEmail = data.payerEmail || "-";
  const rawWhatsapp = data.payerWhatsapp || "no proporcionado";
  const subscriptionDateStr = formatSpanishDate(subscriptionStartDate);
  const oneTimeFormatted = formatCOP(data.oneTimeAmount);
  const monthlyFormatted = `${formatCOP(data.monthlyAmount)}/mes`;

  const firstName = escapeHtml(rawFirstName);
  const planTitle = escapeHtml(rawPlanTitle);
  const payerEmail = escapeHtml(rawPayerEmail);
  const whatsappDisplay = escapeHtml(rawWhatsapp);
  const greetingHtml = firstName ? `Hola ${firstName},` : "Hola,";

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <div style="background: linear-gradient(135deg, #f3e5ab 0%, #d4af37 50%, #aa7c11 100%); padding: 24px 28px; border-radius: 10px 10px 0 0;">
        <div style="margin: 0; font-size: 20px; font-weight: 700; color: #1a1a1a;">Esteban IA</div>
        <div style="margin: 4px 0 0; font-size: 11px; color: #3a3a3a; letter-spacing: 1px; text-transform: uppercase;">IA &amp; Automatizaciones Empresariales</div>
      </div>
      <div style="border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 10px 10px; padding: 28px;">
        <p style="font-size: 16px; margin-top: 0;">${greetingHtml}</p>
        <p style="font-size: 14px; line-height: 1.6;">¡Gracias por confiar en <strong>Esteban IA</strong>! Tu pago se procesó con éxito y tu <strong>${planTitle}</strong> ya está en marcha.</p>
        <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Plan contratado</td><td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">${planTitle}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Pago único (implementación)</td><td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">${oneTimeFormatted}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Sostenimiento mensual</td><td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">${monthlyFormatted}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Primer cobro mensual</td><td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">${subscriptionDateStr}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Correo de contacto</td><td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">${payerEmail}</td></tr>
          <tr><td style="padding: 10px 0; color: #666;">WhatsApp confirmado</td><td style="padding: 10px 0; text-align: right; font-weight: 600;">${whatsappDisplay}</td></tr>
        </table>
        <p style="font-size: 12px; line-height: 1.5; color: #888; background: #f7f7f7; border-radius: 8px; padding: 10px 12px;">📱 Si el WhatsApp de arriba <strong>no es correcto</strong>, responde a este correo con el número correcto para que podamos contactarte sin problema.</p>
        <p style="font-size: 14px; line-height: 1.6; margin-top: 20px;"><strong>¿Qué sigue?</strong> Nos pondremos en contacto contigo por WhatsApp en los próximos días para coordinar el inicio de la implementación.</p>
        <p style="font-size: 14px; line-height: 1.6;">Si prefieres no esperar, también puedes agendar tú mismo la sesión de inicio según mi disponibilidad de calendario:</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${BOOKING_URL}" style="background: linear-gradient(135deg, #f3e5ab 0%, #d4af37 50%, #aa7c11 100%); color: #1a1a1a; text-decoration: none; font-weight: 700; padding: 12px 28px; border-radius: 8px; display: inline-block; font-size: 14px;">Agendar sesión de inicio</a>
        </p>
        <p style="font-size: 13px; line-height: 1.6; color: #666;">Si tienes cualquier duda mientras tanto, puedes responder directamente a este correo.</p>
        <p style="font-size: 14px; margin-top: 28px;">¡Bienvenido a bordo!<br><strong>Esteban Serna</strong> — Esteban IA</p>
      </div>
    </div>`;

  const text =
    `${rawFirstName ? `Hola ${rawFirstName},` : "Hola,"}\n\n` +
    `¡Gracias por confiar en Esteban IA! Tu pago se procesó con éxito y tu ${rawPlanTitle} ya está en marcha.\n\n` +
    `Resumen de tu compra:\n` +
    `- Plan: ${rawPlanTitle}\n` +
    `- Pago único (implementación): ${oneTimeFormatted}\n` +
    `- Sostenimiento mensual: ${monthlyFormatted} (primer cobro el ${subscriptionDateStr})\n` +
    `- Correo de contacto: ${rawPayerEmail}\n` +
    `- WhatsApp confirmado: ${rawWhatsapp}\n\n` +
    `Si ese WhatsApp no es correcto, responde a este correo con el número correcto.\n\n` +
    `¿Qué sigue? Te contactaremos por WhatsApp en los próximos días para coordinar el inicio de la implementación. Si prefieres agendar tú mismo según mi disponibilidad: ${BOOKING_URL}\n\n` +
    `Si tienes cualquier duda mientras tanto, responde directamente a este correo.\n\n` +
    `¡Bienvenido a bordo!\nEsteban Serna — Esteban IA`;

  try {
    await sendEmail({
      to: rawPayerEmail,
      subject: `🎉 ¡Bienvenido a Esteban IA! Tu ${rawPlanTitle} ya está en marcha`,
      text,
      html
    });
  } catch (err) {
    console.error("Fallo el envio del correo de bienvenida al cliente:", err.message);
  }
}

// Mensaje de WhatsApp de bienvenida al cliente. OJO: ver la nota de
// limitacion de "ventana de 24h / plantillas" en services/whatsapp.js --
// esto puede fallar si no hay una plantilla aprobada para este caso. El
// fallo se registra pero no bloquea el resto del flujo (el correo llega
// igual).
export async function sendWelcomeWhatsAppToCustomer(data, subscriptionStartDate) {
  if (!data.payerWhatsapp) return;
  const rawFirstName = (data.cardholderName || "").trim().split(/\s+/)[0] || "";
  const greeting = rawFirstName ? `¡Hola ${rawFirstName}! 👋` : "¡Hola! 👋";
  const message =
    `${greeting} Soy Esteban, de Esteban IA.\n\n` +
    `Tu pago para "${data.planTitle || "tu plan"}" se procesó con éxito y ya está todo listo para empezar. ` +
    `Te voy a escribir por aquí en los próximos días para coordinar el inicio de la implementación.\n\n` +
    `Si prefieres agendar tú mismo la sesión de inicio, puedes hacerlo aquí: ${BOOKING_URL}`;

  try {
    await sendWhatsAppText(data.payerWhatsapp, message);
  } catch (err) {
    console.error("Fallo el envio del WhatsApp de bienvenida al cliente:", err.message);
  }
}

export async function notifyPartialCheckoutFailure(data, payment, subscriptionResult) {
  try {
    await sendEmail({
      to: ESTEBAN_EMAIL,
      subject: `⚠️ Pago cobrado pero suscripción NO activada — ${data.planTitle || ""}`,
      text:
        `Se cobró el pago único a ${data.payerEmail} (WhatsApp: ${data.payerWhatsapp || "no proporcionado"}, ID de pago: ${payment.id}) pero la suscripción mensual no se pudo activar.\n\n` +
        `Detalle de Mercado Pago:\n${JSON.stringify(subscriptionResult, null, 2)}\n\n` +
        `Contacta al cliente para completar la suscripción manualmente, o reintenta desde el panel de Mercado Pago.`
    });
  } catch (err) {
    console.error("Fallo el envio de correo de fallo parcial:", err.message);
  }
}

export async function notifyPendingPayment(data, payment) {
  try {
    await sendEmail({
      to: ESTEBAN_EMAIL,
      subject: `⏳ Pago en revisión: ${data.planTitle || "Plan"} — ${data.cardholderName || data.payerEmail}`,
      text:
        `Un cliente intentó pagar y el pago quedó "${payment.status}" (${payment.status_detail || ""}) en revisión de Mercado Pago.\n\n` +
        `Cliente: ${data.cardholderName || "-"}\n` +
        `Correo: ${data.payerEmail}\n` +
        `WhatsApp: ${data.payerWhatsapp || "no proporcionado"}\n` +
        `Plan: ${data.planTitle || "-"}\n` +
        `ID de pago: ${payment.id}\n\n` +
        `No hace falta que hagas nada: en cuanto Mercado Pago resuelva el pago te llegará un correo nuevo confirmando si se activó la suscripción o si finalmente se rechazó.`
    });
  } catch (err) {
    console.error("Fallo el envio de correo de pago pendiente:", err.message);
  }
}

export async function notifyPendingResolvedAsRejected(data, payment) {
  try {
    await sendEmail({
      to: ESTEBAN_EMAIL,
      subject: `❌ Pago finalmente rechazado: ${data.planTitle || "Plan"} — ${data.cardholderName || data.payerEmail}`,
      text:
        `El pago que había quedado "en revisión" se resolvió como ${payment.status} (${payment.status_detail || ""}).\n\n` +
        `Cliente: ${data.cardholderName || "-"}\n` +
        `Correo: ${data.payerEmail}\n` +
        `WhatsApp: ${data.payerWhatsapp || "no proporcionado"}\n\n` +
        `No se activó la suscripción. Es solo informativo, no hace falta que hagas nada.`
    });
  } catch (err) {
    console.error("Fallo el envio de correo de pago rechazado:", err.message);
  }
}

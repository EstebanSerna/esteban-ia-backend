// Envio de WhatsApp via la API de Meta (WhatsApp Cloud API), reutilizando
// las mismas credenciales del proyecto whatsapp-assistant.
//
// OJO -- limitacion real de la API de WhatsApp Business que hay que tener
// en cuenta: un mensaje de texto libre ("free-form") solo se puede enviar
// dentro de las 24 horas siguientes a que el CLIENTE le escriba primero a
// tu numero de WhatsApp Business. Como el mensaje de bienvenida se dispara
// justo despues de un pago (el cliente probablemente nunca le ha escrito
// antes a este numero), Meta puede rechazar un mensaje de texto libre aqui.
// La forma correcta es usar una PLANTILLA de mensaje pre-aprobada por Meta
// (tipo "utility" / confirmacion de compra). Revisa en tu WhatsApp Business
// Manager si ya tienes una plantilla aprobada que sirva para esto; si no,
// hay que crear una y esperar la aprobacion (usualmente minutos a un dia).
// Mientras tanto, esta funcion intenta el mensaje de texto libre y si Meta
// lo rechaza por la ventana de 24h, se registra el error sin bloquear el
// resto del flujo (el correo de bienvenida sigue llegando igual).
const GRAPH_VERSION = "v20.0";

export async function sendWhatsAppText(toPhoneNumber, message) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error("WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID no configuradas");
  }

  const normalized = normalizePhoneNumber(toPhoneNumber);
  if (!normalized) {
    throw new Error(`Numero de WhatsApp invalido: "${toPhoneNumber}"`);
  }

  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalized,
      type: "text",
      text: { body: message }
    })
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(`WhatsApp API error: ${JSON.stringify(result)}`);
  }
  return result;
}

// Quita espacios/guiones y exige formato internacional con "+". Devuelve
// null si no se puede normalizar (para no intentar enviar algo invalido).
function normalizePhoneNumber(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d+]/g, "");
  if (!/^\+?\d{8,15}$/.test(digits)) return null;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

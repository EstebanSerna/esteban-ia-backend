// Envio de correo via Resend (resend.com). Reemplaza a MailApp de Apps
// Script -- necesita una API key propia (capa gratis: 3.000 correos/mes).
// Mientras el dominio esteban-serna.com no este verificado en Resend, usa
// el remitente de pruebas "onboarding@resend.dev" (funciona igual, solo
// que el remitente no se ve tan profesional). Ver README.md para verificar
// el dominio propio.
import { Resend } from "resend";

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY no configurada");
    }
    client = new Resend(process.env.RESEND_API_KEY);
  }
  return client;
}

export async function sendEmail({ to, subject, text, html }) {
  const from = process.env.RESEND_FROM || "Esteban IA <onboarding@resend.dev>";
  const resend = getClient();
  const { error } = await resend.emails.send({ from, to, subject, text, html });
  if (error) {
    throw new Error(typeof error === "string" ? error : JSON.stringify(error));
  }
}

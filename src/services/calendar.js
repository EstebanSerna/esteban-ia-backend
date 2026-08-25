// Integracion con Google Calendar via cuenta de servicio (Service Account).
// A diferencia de Google Apps Script (que corre como la cuenta del dueno y
// tiene acceso directo a su Calendar), aqui necesitamos autenticar
// explicitamente. Configuracion requerida (ver README.md):
//   1. Crear una cuenta de servicio en Google Cloud, habilitar la API de
//      Calendar, y descargar su clave JSON.
//   2. Compartir el Google Calendar de Esteban con el correo de esa cuenta
//      de servicio (client_email dentro del JSON), con permiso de "Hacer
//      cambios en los eventos".
//   3. Pegar el JSON completo (en una sola linea) en la variable de entorno
//      GOOGLE_SERVICE_ACCOUNT_KEY_JSON.
import { google } from "googleapis";

let cachedClient = null;

function getCalendarClient() {
  if (cachedClient) return cachedClient;

  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
  if (!rawKey) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_JSON no configurada");
  }

  const credentials = JSON.parse(rawKey);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar"]
  });

  cachedClient = google.calendar({ version: "v3", auth });
  return cachedClient;
}

function getCalendarId() {
  return process.env.GOOGLE_CALENDAR_ID || "primary";
}

// Extrae el link de Google Meet de la respuesta de la API, con el mismo
// criterio que usa el propio Calendar: primero el atajo hangoutLink, y si
// no viene, el entryPoint de video dentro de conferenceData.
function extractMeetLink(eventData) {
  if (eventData.hangoutLink) return eventData.hangoutLink;
  const entryPoints = eventData.conferenceData && eventData.conferenceData.entryPoints;
  const videoEntry = Array.isArray(entryPoints) ? entryPoints.find((e) => e.entryPointType === "video") : null;
  return videoEntry ? videoEntry.uri : null;
}

// Pide que Calendar genere un link de Google Meet nuevo y unico para el
// evento -- requestId solo necesita ser unico por intento, no se reutiliza.
function buildConferenceData() {
  return {
    createRequest: {
      requestId: `esteban-ia-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      conferenceSolutionKey: { type: "hangoutsMeet" }
    }
  };
}

// Crea un evento y devuelve { id, htmlLink, meetLink }. `attendeeEmail` es
// opcional (invita al cliente por correo, igual que hacia CalendarApp con
// sendInvites). htmlLink sirve para que el correo interno a Esteban pueda
// enlazar directo al evento en su Calendar; meetLink es el link de Google
// Meet generado automaticamente para la reunion (puede venir null si la
// generacion de Meet falla -- no bloquea la creacion del evento).
export async function createCalendarEvent({ summary, description, startDate, endDate, attendeeEmail }) {
  const calendar = getCalendarClient();

  const event = {
    summary,
    description,
    start: { dateTime: startDate.toISOString() },
    end: { dateTime: endDate.toISOString() },
    conferenceData: buildConferenceData()
  };
  if (attendeeEmail) {
    event.attendees = [{ email: attendeeEmail }];
  }

  try {
    const response = await calendar.events.insert({
      calendarId: getCalendarId(),
      requestBody: event,
      conferenceDataVersion: 1,
      sendUpdates: attendeeEmail ? "all" : "none"
    });
    return { id: response.data.id, htmlLink: response.data.htmlLink, meetLink: extractMeetLink(response.data) };
  } catch (err) {
    // Fallback sin invitado, igual que el intento original en Apps Script,
    // por si el envio de invitacion es lo que falla. Se mantiene el
    // conferenceData para seguir intentando generar el link de Meet.
    if (attendeeEmail) {
      const response = await calendar.events.insert({
        calendarId: getCalendarId(),
        requestBody: { summary, description, start: event.start, end: event.end, conferenceData: buildConferenceData() },
        conferenceDataVersion: 1,
        sendUpdates: "none"
      });
      return { id: response.data.id, htmlLink: response.data.htmlLink, meetLink: extractMeetLink(response.data) };
    }
    throw err;
  }
}

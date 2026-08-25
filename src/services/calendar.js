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

async function insertEvent(calendar, calendarId, requestBody, sendUpdates) {
  const response = await calendar.events.insert({
    calendarId,
    requestBody,
    conferenceDataVersion: 1,
    sendUpdates
  });
  return { id: response.data.id, htmlLink: response.data.htmlLink, meetLink: extractMeetLink(response.data) };
}

// Crea un evento y devuelve { id, htmlLink, meetLink }. `attendeeEmail` es
// opcional (invita al cliente por correo, igual que hacia CalendarApp con
// sendInvites); meetLink es el link de Google Meet generado
// automaticamente (puede venir null si Meet no se pudo generar -- pasa en
// algunas cuentas personales sin Google Workspace, "Invalid conference
// type value" -- no debe tumbar la reserva completa por eso).
//
// Se intenta en orden, cada vez con menos features, hasta que uno
// funcione: (1) invitado + Meet, (2) invitado sin Meet, (3) ni invitado
// ni Meet -- el minimo que deberia funcionar siempre.
export async function createCalendarEvent({ summary, description, startDate, endDate, attendeeEmail }) {
  const calendar = getCalendarClient();
  const calendarId = getCalendarId();
  const base = {
    summary,
    description,
    start: { dateTime: startDate.toISOString() },
    end: { dateTime: endDate.toISOString() }
  };

  const attempts = [];
  if (attendeeEmail) {
    attempts.push({
      requestBody: { ...base, attendees: [{ email: attendeeEmail }], conferenceData: buildConferenceData() },
      sendUpdates: "all"
    });
    attempts.push({
      requestBody: { ...base, attendees: [{ email: attendeeEmail }] },
      sendUpdates: "all"
    });
  } else {
    attempts.push({
      requestBody: { ...base, conferenceData: buildConferenceData() },
      sendUpdates: "none"
    });
  }
  attempts.push({ requestBody: { ...base }, sendUpdates: "none" });

  let lastError;
  for (const attempt of attempts) {
    try {
      return await insertEvent(calendar, calendarId, attempt.requestBody, attempt.sendUpdates);
    } catch (err) {
      lastError = err;
      console.error("Intento de crear evento en Calendar fallo, probando el siguiente respaldo:", err.message);
    }
  }
  throw lastError;
}

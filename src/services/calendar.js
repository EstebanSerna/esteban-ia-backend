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

// Marca los eventos creados por este backend (no las otras cosas que ya
// hay en el calendario real de Esteban -- academia, coaching, etc.) para
// poder filtrarlos despues sin adivinar por texto del titulo/descripcion,
// que puede coincidir por casualidad con eventos de otras apps (paso con
// "PWA Coach Esteban", que usa un formato de descripcion casi identico).
const ESTEBAN_IA_SOURCE_TAG = "esteban-ia-backend";

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
// `reminderProperties`, si se pasa, se guarda como extendedProperties
// privadas del evento (source, nombre/whatsapp/correo del cliente) para
// que el recordatorio de 20 minutos antes (ver meetingReminderScheduler.js)
// pueda encontrar y leer estos eventos sin tener que adivinar por texto.
//
// Se intenta en orden, cada vez con menos features, hasta que uno
// funcione: (1) invitado + Meet, (2) invitado sin Meet, (3) ni invitado
// ni Meet -- el minimo que deberia funcionar siempre.
export async function createCalendarEvent({ summary, description, startDate, endDate, attendeeEmail, reminderProperties }) {
  const calendar = getCalendarClient();
  const calendarId = getCalendarId();
  const base = {
    summary,
    description,
    start: { dateTime: startDate.toISOString() },
    end: { dateTime: endDate.toISOString() },
    ...(reminderProperties ? { extendedProperties: { private: { source: ESTEBAN_IA_SOURCE_TAG, ...reminderProperties } } } : {})
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

// Busca reuniones creadas por este backend (via el tag de
// ESTEBAN_IA_SOURCE_TAG en extendedProperties.private) que empiezan entre
// `fromMinutes` y `toMinutes` desde ahora, y que todavia no se les mando
// el recordatorio de 20 minutos antes.
export async function listUpcomingMeetingsNeedingReminder({ fromMinutes, toMinutes }) {
  const calendar = getCalendarClient();
  const calendarId = getCalendarId();
  const now = Date.now();

  const res = await calendar.events.list({
    calendarId,
    timeMin: new Date(now + fromMinutes * 60000).toISOString(),
    timeMax: new Date(now + toMinutes * 60000).toISOString(),
    singleEvents: true,
    privateExtendedProperty: [`source=${ESTEBAN_IA_SOURCE_TAG}`]
  });

  return (res.data.items || [])
    .filter((ev) => {
      const priv = (ev.extendedProperties && ev.extendedProperties.private) || {};
      return priv.reminderSent !== "true" && ev.start && ev.start.dateTime;
    })
    .map((ev) => {
      const priv = (ev.extendedProperties && ev.extendedProperties.private) || {};
      return {
        id: ev.id,
        summary: ev.summary,
        startDate: new Date(ev.start.dateTime),
        endDate: new Date(ev.end.dateTime),
        meetLink: extractMeetLink(ev),
        clientName: priv.clientName || "",
        clientWhatsapp: priv.clientWhatsapp || "",
        clientEmail: priv.clientEmail || "",
        service: priv.service || ""
      };
    });
}

// Marca un evento como "ya se le mando el recordatorio", persistido en el
// propio evento de Calendar (no en memoria) -- sobrevive a un reinicio del
// servidor sin arriesgar mandar el recordatorio duplicado. Se trae las
// extendedProperties existentes primero para no perder el resto de campos
// al actualizar (el PATCH de la API reemplaza el mapa completo, no lo
// mezcla campo por campo).
export async function markMeetingReminderSent(eventId) {
  const calendar = getCalendarClient();
  const calendarId = getCalendarId();

  const existing = await calendar.events.get({ calendarId, eventId });
  const existingPrivate = (existing.data.extendedProperties && existing.data.extendedProperties.private) || {};

  await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: {
      extendedProperties: { private: { ...existingPrivate, reminderSent: "true" } }
    }
  });
}

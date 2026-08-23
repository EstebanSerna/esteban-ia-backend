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

// Crea un evento y devuelve su id. `attendeeEmail` es opcional (invita al
// cliente por correo, igual que hacia CalendarApp con sendInvites).
export async function createCalendarEvent({ summary, description, startDate, endDate, attendeeEmail }) {
  const calendar = getCalendarClient();

  const event = {
    summary,
    description,
    start: { dateTime: startDate.toISOString() },
    end: { dateTime: endDate.toISOString() }
  };
  if (attendeeEmail) {
    event.attendees = [{ email: attendeeEmail }];
  }

  try {
    const response = await calendar.events.insert({
      calendarId: getCalendarId(),
      requestBody: event,
      sendUpdates: attendeeEmail ? "all" : "none"
    });
    return response.data.id;
  } catch (err) {
    // Fallback sin invitado, igual que el intento original en Apps Script,
    // por si el envio de invitacion es lo que falla.
    if (attendeeEmail) {
      const response = await calendar.events.insert({
        calendarId: getCalendarId(),
        requestBody: { summary, description, start: event.start, end: event.end },
        sendUpdates: "none"
      });
      return response.data.id;
    }
    throw err;
  }
}

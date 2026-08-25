// Recordatorio de reuniones: 20 minutos antes de cada sesion agendada
// desde el sitio (Diagnostico Gratuito o una sesion de un plan pagado),
// le manda a Esteban un correo con el enlace de Google Meet listo para
// copiar y mandar por WhatsApp -- por ahora solo por correo (pedido
// explicito), el envio directo por WhatsApp puede agregarse despues
// reutilizando los mismos datos.
import cron from "node-cron";
import { listUpcomingMeetingsNeedingReminder, markMeetingReminderSent } from "./services/calendar.js";
import { notifyMeetingReminder } from "./services/notifications.js";

// Ventana de busqueda mas ancha que el intervalo del cron (cada 5 min) a
// proposito: si el proceso se reinicia justo en medio de una revision, la
// siguiente igual encuentra la reunion dentro de esta ventana. El propio
// evento de Calendar (reminderSent) evita mandar el correo dos veces.
const CRON_INTERVAL = "*/5 * * * *";
const WINDOW_FROM_MINUTES = 15;
const WINDOW_TO_MINUTES = 25;

export function startMeetingReminderScheduler() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON || !process.env.GOOGLE_CALENDAR_ID) {
    console.log("Recordatorio de reuniones desactivado: falta GOOGLE_SERVICE_ACCOUNT_KEY_JSON / GOOGLE_CALENDAR_ID");
    return;
  }

  cron.schedule(CRON_INTERVAL, () => {
    checkAndSendReminders().catch((err) => console.error("Error revisando recordatorios de reuniones:", err));
  }, { timezone: "America/Bogota" });

  console.log("Recordatorio de reuniones activo: revisa cada 5 minutos si hay una sesion empezando en ~20 min.");
}

export async function checkAndSendReminders() {
  const meetings = await listUpcomingMeetingsNeedingReminder({
    fromMinutes: WINDOW_FROM_MINUTES,
    toMinutes: WINDOW_TO_MINUTES
  });

  for (const meeting of meetings) {
    try {
      await notifyMeetingReminder(meeting);
      await markMeetingReminderSent(meeting.id);
      console.log(`Recordatorio enviado para la reunion con ${meeting.clientName || meeting.id}`);
    } catch (err) {
      console.error(`No se pudo procesar el recordatorio de la reunion ${meeting.id}:`, err.message);
    }
  }

  return meetings.length;
}

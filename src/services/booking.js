const MONTHS = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
};

// dateStr: "18 de Julio de 2026" -- timeStr: "10:30 AM" / "02:30 PM"
export function parseDateTime(dateStr, timeStr, serviceName) {
  const cleanStr = dateStr.toLowerCase().replace(/\bde\b/gi, " ");
  const parts = cleanStr.split(/\s+/).filter(Boolean);
  if (parts.length < 3) {
    throw new Error(`Formato de fecha inválido. Se esperaba 'DD de Mes de AAAA'. Recibido: ${dateStr}`);
  }

  const day = parseInt(parts[0], 10);
  const monthName = parts[1];
  const year = parseInt(parts[2], 10);

  const month = MONTHS[monthName];
  if (month === undefined) throw new Error(`Mes no reconocido: ${monthName}`);

  const timeParts = timeStr.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!timeParts) throw new Error(`Formato de hora inválido: ${timeStr}`);

  let hours = parseInt(timeParts[1], 10);
  const minutes = parseInt(timeParts[2], 10);
  const ampm = timeParts[3].toUpperCase();
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;

  // OJO: nunca usar `new Date(year, month, day, hours, minutes)` aqui --
  // eso interpreta la hora en la zona horaria LOCAL del proceso que corre
  // el codigo, que en el servidor real de Railway es UTC (no Colombia),
  // aunque al probarlo con `railway run` en una maquina que SI esta en
  // hora de Colombia parezca funcionar bien -- fue asi como se detecto
  // este bug, con una reserva real que quedo guardada 5 horas antes de lo
  // que el cliente selecciono. Colombia es UTC-5 fijo todo el ano (no
  // tiene horario de verano), asi que construimos el instante UTC exacto
  // sumando esas 5 horas explicitamente, sin depender de la zona horaria
  // del servidor.
  const COLOMBIA_UTC_OFFSET_HOURS = 5;
  const startDate = new Date(Date.UTC(year, month, day, hours + COLOMBIA_UTC_OFFSET_HOURS, minutes, 0, 0));

  let durationMinutes = 30;
  const sName = serviceName.toLowerCase();
  if (sName.includes("diagnostico") || sName.includes("gratuito")) {
    durationMinutes = 30;
  } else if (sName.includes("basico") || sName.includes("whatsapp") || sName.includes("redes")) {
    durationMinutes = 45;
  } else if (sName.includes("experto") || sName.includes("empresa") || sName.includes("plataforma") || sName.includes("completo")) {
    durationMinutes = 60;
  }

  return { startDate, durationMinutes };
}

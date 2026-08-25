// Formatea una fecha como "22 de septiembre de 2026" a mano, en vez de
// depender de toLocaleDateString("es-CO") -- garantiza el idioma sin
// importar que ICU tenga cargados o no los datos de espanol en el runtime.
export function formatSpanishDate(date) {
  const months = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ];
  return `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
}

// Formatea un monto en pesos colombianos como "$1.950.000 COP" a mano
// (Colombia usa punto como separador de miles, no coma).
export function formatCOP(amount) {
  const rounded = Math.round(Number(amount) || 0);
  return `$${rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} COP`;
}

// Convierte un Date (instante UTC) a fecha + hora en Colombia, en texto,
// SIN depender de en que zona horaria corra el servidor ni de que el
// runtime de Node tenga cargados los datos de locale es-CO (mismo motivo
// por el que formatSpanishDate no usa toLocaleDateString -- ver su
// comentario). Colombia es UTC-5 fijo todo el ano, asi que restamos ese
// offset a mano y leemos los componentes con los metodos getUTC* (no los
// locales) sobre el resultado desplazado -- el mismo truco que se uso
// para corregir el bug de 5 horas en parseDateTime().
const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];

export function formatSpanishDateTimeColombia(date) {
  const COLOMBIA_UTC_OFFSET_HOURS = 5;
  const shifted = new Date(date.getTime() - COLOMBIA_UTC_OFFSET_HOURS * 60 * 60 * 1000);

  const day = shifted.getUTCDate();
  const month = MONTHS_ES[shifted.getUTCMonth()];
  const year = shifted.getUTCFullYear();
  const dateStr = `${day} de ${month} de ${year}`;

  const hours24 = shifted.getUTCHours();
  const minutes = shifted.getUTCMinutes();
  const period = hours24 < 12 ? "a. m." : "p. m.";
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;
  const timeStr = `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;

  return { dateStr, timeStr };
}

// Escapa texto para insertarlo de forma segura dentro de un correo HTML.
// Los campos del formulario de pago los escribe el propio visitante --sin
// esto, alguien podria insertar HTML/JS en el campo de nombre.
export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

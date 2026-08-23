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

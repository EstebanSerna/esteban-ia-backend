// Lista rotativa de temas del blog. Cada 3 dias se toma el siguiente en base
// a la fecha (ver blog.js) -- no hace falta guardar en que posicion vamos,
// la formula siempre da el mismo resultado para el mismo dia.
export const BLOG_TOPICS = [
  { topic: "Qué es un agente de IA y en qué se diferencia de un chatbot tradicional", keyword: "agente de IA vs chatbot" },
  { topic: "Cómo automatizar la atención por WhatsApp con inteligencia artificial", keyword: "automatizar WhatsApp con IA" },
  { topic: "Cuánto cuesta implementar inteligencia artificial en una pyme en Colombia", keyword: "costo implementar IA pyme Colombia" },
  { topic: "Agentes de IA para ópticas: cómo automatizar citas y catálogo de precios", keyword: "agente de IA para ópticas" },
  { topic: "Agentes de IA para restaurantes: pedidos y reservas 24/7", keyword: "agente de IA para restaurantes" },
  { topic: "Agentes de IA para inmobiliarias: calificación automática de clientes potenciales", keyword: "agente de IA para inmobiliarias" },
  { topic: "5 errores comunes al automatizar la atención al cliente con inteligencia artificial", keyword: "errores automatizar atención al cliente IA" },
  { topic: "Inteligencia artificial vs. contratar más personal: qué conviene más para tu negocio", keyword: "IA vs contratar personal" },
  { topic: "Tendencias de inteligencia artificial para negocios en Colombia", keyword: "tendencias IA negocios Colombia" },
  { topic: "Cómo un agente de IA puede vender por ti mientras duermes", keyword: "agente de IA vende automático" },
  { topic: "Agentes de IA para clínicas y consultorios: agendamiento automático de citas", keyword: "agente de IA para clínicas" },
  { topic: "Qué es la optimización de procesos empresariales con inteligencia artificial", keyword: "optimización de procesos empresariales con IA" },
  { topic: "Cómo saber si tu negocio necesita un agente de IA", keyword: "mi negocio necesita agente de IA" },
  { topic: "Agentes de IA para tiendas online: atención y ventas automatizadas", keyword: "agente de IA para ecommerce" },
  { topic: "El retorno de inversión real de implementar un asistente de IA en tu empresa", keyword: "ROI asistente de IA empresa" }
];

// Devuelve el tema del dia de hoy, cambiando cada 3 dias -- sin necesidad de
// guardar estado en ningun lado (la misma fecha siempre da el mismo tema).
export function getTopicForToday() {
  const threeDayBlock = Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 3));
  const index = threeDayBlock % BLOG_TOPICS.length;
  return BLOG_TOPICS[index];
}

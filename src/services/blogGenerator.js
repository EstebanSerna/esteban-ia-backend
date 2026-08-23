// Genera un articulo de blog original: Claude investiga el tema en la web
// (herramienta web_search de Anthropic, no copia articulos existentes) y
// despues escribe el contenido completo desde cero, en el tono de la marca.
const MODEL = "claude-sonnet-5";

const REAL_PLAN_PRICING = `
- Asistente para Redes Sociales & WhatsApp: $1.950.000 COP de implementación única + $330.000 COP/mes de sostenimiento.
- Asistente Experto en tu Empresa: $3.450.000 COP de implementación única + $520.000 COP/mes.
- Plataforma Empresarial & Página Web IA: $5.900.000 COP de implementación única + $890.000 COP/mes.
El primer mes de sostenimiento no se cobra (corre por cuenta de Esteban IA mientras se implementa).
`.trim();

const SYSTEM_PROMPT = `
Eres el redactor de contenido de "Esteban IA", una agencia de inteligencia artificial en Colombia
dirigida por Esteban Serna. La agencia diseña e implementa agentes de IA a la medida (atención por
WhatsApp y redes sociales, agendamiento automático, calificación de clientes potenciales),
optimiza procesos empresariales, y construye aplicativos empresariales y sitios web conectados a
esos agentes.

Reglas estrictas:
- NUNCA menciones Make, n8n, ni ninguna herramienta de automatización de terceros por nombre --
  la marca no usa esas herramientas de cara al cliente.
- NUNCA inventes cifras de clientes, años de experiencia, testimonios, ni casos de éxito
  específicos que no se te hayan dado. Si el artículo necesita un ejemplo, usa uno genérico
  ("una óptica en Bogotá podría...") sin afirmar que es un cliente real de Esteban IA.
- Si mencionas precios de Esteban IA, usa EXACTAMENTE estos (no los inventes ni los redondees):
${REAL_PLAN_PRICING}
- El artículo debe ser 100% original -- está prohibido copiar o parafrasear de cerca cualquier
  fuente que encuentres en tu búsqueda. Investiga para tener datos y contexto reales y actuales,
  pero la redacción, estructura y ejemplos deben ser tuyos.
- Tono: directo, en español de Colombia, hablándole al dueño de un negocio (no a un técnico).
  Evita la jerga técnica innecesaria. Usa "tu negocio", "tu empresa".
- Extensión: entre 900 y 1400 palabras en el cuerpo del artículo.
- Estructura: introducción breve, 3-5 subtítulos (<h2>) con contenido sustancial cada uno, y un
  cierre con una llamada a la acción natural (sin sonar a anuncio forzado) invitando a agendar un
  diagnóstico gratuito en https://esteban-serna.com/#reservar.
- Formato del cuerpo: HTML semántico simple -- solo <p>, <h2>, <h3>, <ul>, <li>, <strong>, <a>.
  NUNCA incluyas <html>, <head>, <body>, ni estilos inline.

Cuando termines de investigar, responde en TU ÚLTIMO mensaje ÚNICAMENTE con el resultado envuelto
así, sin texto antes ni después del bloque:

<ARTICLE_JSON>
{
  "title": "Título del artículo (máximo 65 caracteres, atractivo y con la palabra clave)",
  "slug": "titulo-en-minusculas-separado-por-guiones-sin-tildes",
  "metaDescription": "Descripción para buscadores, máximo 155 caracteres",
  "excerpt": "Resumen de 1-2 frases para la tarjeta del blog, máximo 200 caracteres",
  "bodyHtml": "<p>...el articulo completo en HTML...</p>"
}
</ARTICLE_JSON>
`.trim();

export async function generateArticle({ topic, keyword }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada");

  const userPrompt =
    `Tema del artículo: "${topic}"\n` +
    `Palabra clave objetivo (SEO): "${keyword}"\n\n` +
    `Investiga en la web información actual y relevante sobre este tema (usa la herramienta de ` +
    `búsqueda las veces que haga falta, máximo 5), y después escribe el artículo completo según ` +
    `las instrucciones del sistema.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }]
    })
  });

  const result = await response.json();
  if (result.error) {
    throw new Error(`Claude API error: ${result.error.message}`);
  }

  const blocks = result.content || [];

  // Extrae las fuentes que uso Claude durante la investigacion, para
  // mostrarlas al final del articulo (transparencia, y respalda que la
  // informacion viene de busquedas reales, no inventada).
  const sources = [];
  const seenUrls = new Set();
  for (const block of blocks) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const item of block.content) {
        if (item.type === "web_search_result" && item.url && !seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          sources.push({ url: item.url, title: item.title || item.url });
        }
      }
    }
  }

  const fullText = blocks
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  const match = fullText.match(/<ARTICLE_JSON>([\s\S]*?)<\/ARTICLE_JSON>/);
  if (!match) {
    throw new Error("No se pudo extraer el JSON del articulo generado por Claude");
  }

  let article;
  try {
    article = JSON.parse(match[1].trim());
  } catch (err) {
    throw new Error(`JSON del articulo invalido: ${err.message}`);
  }

  for (const field of ["title", "slug", "metaDescription", "excerpt", "bodyHtml"]) {
    if (!article[field]) throw new Error(`Al articulo generado le falta el campo "${field}"`);
  }

  // Normaliza el slug por seguridad, aunque se le pidio a Claude que ya
  // viniera limpio.
  article.slug = String(article.slug)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  article.sources = sources.slice(0, 6);
  article.keyword = keyword;
  article.topic = topic;

  return article;
}

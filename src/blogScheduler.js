import cron from "node-cron";
import { getTopicForToday } from "./services/blogTopics.js";
import { generateArticle } from "./services/blogGenerator.js";
import { saveDraft } from "./services/blogPublisher.js";
import { generateApprovalToken } from "./services/blogApproval.js";
import { notifyBlogDraftReady } from "./services/notifications.js";

const SITE_URL = "https://esteban-serna.com";

let lastProcessedBlock = null; // ultimo bloque de 3 dias ya procesado (evita duplicar en el mismo bloque)

function currentThreeDayBlock() {
  return Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 3));
}

// Corre todos los dias a las 9am (hora Colombia), pero solo genera un
// articulo si hoy es un "dia de publicacion" segun la rotacion de 3 dias
// (ver getTopicForToday) y no se ha generado ya hoy.
export function startBlogScheduler() {
  if (!process.env.ANTHROPIC_API_KEY || !process.env.GITHUB_TOKEN || !process.env.BLOG_APPROVAL_SECRET) {
    console.log("Blog automatico desactivado: faltan ANTHROPIC_API_KEY / GITHUB_TOKEN / BLOG_APPROVAL_SECRET");
    return;
  }

  cron.schedule("0 9 * * *", () => {
    runIfPublishDay().catch((err) => console.error("Error en el scheduler del blog:", err));
  }, { timezone: "America/Bogota" });

  console.log("Blog automatico activo: revisa todos los dias a las 9am (Colombia) si toca generar articulo.");
}

async function runIfPublishDay() {
  const block = currentThreeDayBlock();
  if (lastProcessedBlock === block) return; // ya se genero para este bloque de 3 dias
  lastProcessedBlock = block;

  await generateAndNotify();
}

// Exportada aparte para poder probarla manualmente sin esperar al cron
// (ver la ruta /debug/generate-blog-draft en server.js).
export async function generateAndNotify() {
  const { topic, keyword } = getTopicForToday();
  console.log(`Generando articulo de blog -- tema: "${topic}"`);

  const article = await generateArticle({ topic, keyword });
  await saveDraft(article);

  const backendUrl = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  const approveUrl = `${backendUrl}/blog/approve?slug=${encodeURIComponent(article.slug)}&token=${generateApprovalToken(article.slug, "publish")}`;
  const discardUrl = `${backendUrl}/blog/discard?slug=${encodeURIComponent(article.slug)}&token=${generateApprovalToken(article.slug, "discard")}`;
  const previewUrl = `${SITE_URL}/blog/drafts/${article.slug}.html`;

  await notifyBlogDraftReady(article, { approveUrl, discardUrl, previewUrl });
  console.log(`Borrador de blog listo y correo enviado: "${article.title}"`);
  return article;
}

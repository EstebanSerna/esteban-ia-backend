import { getFile, getFileBuffer, putFile, deleteFile } from "./github.js";
import { renderPostPage, renderIndexPage } from "./blogTemplates.js";
import { generateCoverImagePng } from "./coverImage.js";

const SITE_URL = "https://esteban-serna.com";

// Guarda el articulo generado como BORRADOR: se sube al repo (para que la
// pagina ya exista y se pueda previsualizar en vivo) pero no se enlaza
// desde ningun lado ni se agrega al sitemap -- invisible hasta aprobarlo.
export async function saveDraft(article) {
  const draftMeta = { ...article, generatedAt: new Date().toISOString() };

  await putFile(
    `blog/drafts/${article.slug}.json`,
    JSON.stringify(draftMeta, null, 2),
    `Blog: borrador generado - ${article.title}`
  );

  let hasCoverImage = false;
  try {
    const coverPng = await generateCoverImagePng(article.title);
    await putFile(`blog/drafts/${article.slug}-cover.png`, coverPng, `Blog: portada del borrador - ${article.title}`);
    hasCoverImage = true;
  } catch (err) {
    console.error("No se pudo generar la imagen de portada (no bloquea el borrador):", err.message);
  }

  const html = renderPostPage(article, { publishedAt: new Date(), isDraft: true, hasCoverImage });
  await putFile(
    `blog/drafts/${article.slug}.html`,
    html,
    `Blog: borrador generado - ${article.title}`
  );

  return draftMeta;
}

export async function getDraft(slug) {
  const file = await getFile(`blog/drafts/${slug}.json`);
  if (!file) return null;
  return JSON.parse(file.content);
}

// Mueve el borrador a publicado: crea la pagina real, actualiza el indice
// del blog, el manifiesto (posts.json) y el sitemap.xml, y borra el
// borrador. Cada llamada de putFile es su propio commit -- GitHub Actions
// solo despliega una vez, al terminar todos los pushes.
export async function publishDraft(slug) {
  const article = await getDraft(slug);
  if (!article) throw new Error(`No existe un borrador con slug "${slug}"`);

  const publishedAt = new Date();

  // Mueve la imagen de portada del borrador a la carpeta publicada (si se
  // alcanzo a generar bien) en vez de regenerarla dos veces.
  const draftCover = await getFileBuffer(`blog/drafts/${slug}-cover.png`);
  if (draftCover) {
    await putFile(`blog/posts/${slug}-cover.png`, draftCover.content, `Blog: portada de "${article.title}"`);
  }

  const html = renderPostPage(article, { publishedAt, isDraft: false, hasCoverImage: !!draftCover });
  await putFile(`blog/posts/${slug}.html`, html, `Blog: publicar "${article.title}"`);

  const manifest = await getPostsManifest();
  const entry = {
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    publishedAt: publishedAt.toISOString(),
    hasCoverImage: !!draftCover
  };
  const updatedManifest = [...manifest.filter((p) => p.slug !== slug), entry];
  await putFile(
    "blog/posts.json",
    JSON.stringify(updatedManifest, null, 2),
    `Blog: agregar "${article.title}" al manifiesto`
  );

  const indexHtml = renderIndexPage(updatedManifest);
  await putFile("blog/index.html", indexHtml, `Blog: regenerar índice tras publicar "${article.title}"`);

  await addToSitemap(`${SITE_URL}/blog/posts/${slug}.html`, publishedAt);

  await deleteFile(`blog/drafts/${slug}.json`, `Blog: limpiar borrador ya publicado - ${article.title}`);
  await deleteFile(`blog/drafts/${slug}.html`, `Blog: limpiar borrador ya publicado - ${article.title}`);
  if (draftCover) {
    await deleteFile(`blog/drafts/${slug}-cover.png`, `Blog: limpiar portada del borrador ya publicado - ${article.title}`);
  }

  return entry;
}

export async function discardDraft(slug) {
  const article = await getDraft(slug);
  await deleteFile(`blog/drafts/${slug}.json`, `Blog: descartar borrador - ${slug}`);
  await deleteFile(`blog/drafts/${slug}.html`, `Blog: descartar borrador - ${slug}`);
  await deleteFile(`blog/drafts/${slug}-cover.png`, `Blog: descartar borrador - ${slug}`);
  return article;
}

// Regenera blog/index.html a partir del manifiesto actual, sin necesidad
// de publicar nada nuevo -- util para aplicar cambios de diseno de la
// plantilla del indice a posts que ya estaban publicados.
export async function regenerateIndex() {
  const manifest = await getPostsManifest();
  const indexHtml = renderIndexPage(manifest);
  await putFile("blog/index.html", indexHtml, "Blog: regenerar índice (cambio de diseño)");
  return manifest.length;
}

async function getPostsManifest() {
  const file = await getFile("blog/posts.json");
  if (!file) return [];
  try {
    return JSON.parse(file.content);
  } catch {
    return [];
  }
}

async function addToSitemap(url, lastmod) {
  const file = await getFile("sitemap.xml");
  if (!file) return; // si no existe el sitemap, no bloquea la publicacion
  if (file.content.includes(`<loc>${url}</loc>`)) return; // ya esta

  const entry =
    `  <url>\n` +
    `    <loc>${url}</loc>\n` +
    `    <lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>\n` +
    `    <changefreq>monthly</changefreq>\n` +
    `    <priority>0.7</priority>\n` +
    `  </url>\n`;

  const updated = file.content.replace("</urlset>", `${entry}</urlset>`);
  await putFile("sitemap.xml", updated, `Blog: agregar ${url} al sitemap`);
}

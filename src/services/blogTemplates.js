// Plantillas HTML del blog. Usa URLs absolutas para CSS/imagenes/enlaces de
// navegacion (evita bugs de rutas relativas entre /blog/index.html y
// /blog/posts/{slug}.html, que viven a distinta profundidad).
const SITE_URL = "https://esteban-serna.com";

const HEADER_HTML = `
    <header class="main-header">
      <a href="${SITE_URL}/" class="logo-area" id="brand-logo" style="text-decoration:none;">
        <div class="logo-icon">ES</div>
        <div class="logo-text-group">
          <span class="logo-text text-gradient">ESTEBAN SERNA</span>
          <span class="logo-subtext">IA para Negocios</span>
        </div>
      </a>
      <nav class="nav-links" id="nav-links">
        <a href="${SITE_URL}/" class="nav-item">Inicio</a>
        <a href="${SITE_URL}/#servicios" class="nav-item">¿Qué hace la IA?</a>
        <a href="${SITE_URL}/#planes" class="nav-item">Servicios</a>
        <a href="${SITE_URL}/blog/" class="nav-item">Blog</a>
        <a href="${SITE_URL}/#reservar" class="nav-item">Agendar</a>
      </nav>
      <button class="menu-btn" id="mobile-menu-trigger" aria-label="Abrir menú" aria-expanded="false">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line class="menu-icon-line menu-icon-top" x1="3" y1="12" x2="21" y2="12"></line>
          <line class="menu-icon-line menu-icon-mid" x1="3" y1="6" x2="21" y2="6"></line>
          <line class="menu-icon-line menu-icon-bottom" x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>
    </header>`;

const FOOTER_HTML = `
    <footer class="main-footer">
      <div class="footer-logo">ESTEBAN IA</div>
      <p class="footer-quote">"El contexto es el argumento decisivo de los resultados de tu negocio. Cambiemos tu contexto operativo con Inteligencia Artificial."</p>
      <div class="footer-links">
        <a href="${SITE_URL}/">Inicio</a>
        <a href="${SITE_URL}/#servicios">¿Qué hace la IA?</a>
        <a href="${SITE_URL}/#sobre-mi">Sobre Esteban</a>
        <a href="${SITE_URL}/#planes">Servicios</a>
        <a href="${SITE_URL}/blog/">Blog</a>
        <a href="${SITE_URL}/#faq">Preguntas Frecuentes</a>
        <a href="${SITE_URL}/#reservar">Reservar</a>
      </div>
      <div class="footer-copyright">&copy; 2026 Esteban Serna. Todos los derechos reservados.<br>Implementación de IA &amp; Automatizaciones Empresariales.</div>
    </footer>`;

// Menu movil minimo (no se carga js/app.js completo en el blog -- esta
// pensado para el sitio principal, no para paginas de solo lectura).
const MOBILE_MENU_SCRIPT = `
  <script>
    (function() {
      var btn = document.getElementById('mobile-menu-trigger');
      var nav = document.getElementById('nav-links');
      if (!btn || !nav) return;
      btn.addEventListener('click', function() {
        var open = nav.classList.toggle('mobile-open');
        btn.classList.toggle('active', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    })();
  </script>`;

function escapeHtmlAttr(str) {
  return String(str || "").replace(/"/g, "&quot;");
}

export function renderPostPage(article, { publishedAt, isDraft, hasCoverImage }) {
  const dateIso = publishedAt.toISOString();
  const dateDisplay = publishedAt.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  const url = `${SITE_URL}/blog/posts/${article.slug}.html`;
  const folder = isDraft ? "drafts" : "posts";
  const imageUrl = hasCoverImage
    ? `${SITE_URL}/blog/${folder}/${article.slug}-cover.png`
    : `${SITE_URL}/images/ai_business_hero.jpg`;

  const sourcesHtml = (article.sources && article.sources.length)
    ? `
      <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--gold-border); font-size: 12px; color: var(--text-muted);">
        <strong style="display:block; margin-bottom: 8px; color: var(--text-secondary);">Fuentes consultadas:</strong>
        <ul style="padding-left: 18px; line-height: 1.8;">
          ${article.sources.map((s) => `<li><a href="${escapeHtmlAttr(s.url)}" target="_blank" rel="noopener noreferrer" style="color: var(--text-muted);">${escapeHtmlAttr(s.title)}</a></li>`).join("\n          ")}
        </ul>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtmlAttr(article.title)} | Esteban IA</title>
  <meta name="description" content="${escapeHtmlAttr(article.metaDescription)}">
  <meta name="author" content="Esteban Serna">
  <link rel="canonical" href="${url}">
  ${isDraft ? '<meta name="robots" content="noindex, nofollow">' : ""}

  <meta property="og:type" content="article">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${escapeHtmlAttr(article.title)}">
  <meta property="og:description" content="${escapeHtmlAttr(article.metaDescription)}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:locale" content="es_CO">
  <meta property="og:site_name" content="Esteban Serna | Esteban IA">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtmlAttr(article.title)}">
  <meta name="twitter:description" content="${escapeHtmlAttr(article.metaDescription)}">

  <link rel="icon" type="image/png" sizes="192x192" href="${SITE_URL}/images/favicon-192.png">
  <link rel="stylesheet" href="${SITE_URL}/css/styles.css">

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": ${JSON.stringify(article.title)},
    "description": ${JSON.stringify(article.metaDescription)},
    "datePublished": "${dateIso}",
    "dateModified": "${dateIso}",
    "author": { "@type": "Person", "name": "Esteban Serna" },
    "publisher": { "@type": "Organization", "name": "Esteban IA", "url": "${SITE_URL}/" },
    "mainEntityOfPage": { "@type": "WebPage", "@id": "${url}" },
    "image": "${imageUrl}"
  }
  </script>
</head>
<body>
  <canvas id="quantum-canvas" style="position:fixed; inset:0; z-index:-1;"></canvas>
  <div class="app-container">
${HEADER_HTML}
    <main style="max-width: 760px; margin: 60px auto; padding: 0 20px;">
      ${isDraft ? '<div style="background: rgba(212,175,55,0.12); border: 1px solid var(--gold-border); border-radius: 10px; padding: 12px 16px; margin-bottom: 24px; font-size: 13px; color: var(--gold-light);">🔒 Borrador sin publicar — no indexado, no aparece en el blog ni en el sitemap todavía.</div>' : ""}
      <div class="section-tagline">BLOG · ESTEBAN IA</div>
      <h1 style="font-size: 32px; line-height: 1.25; margin: 10px 0 14px;" class="text-gradient">${escapeHtmlAttr(article.title)}</h1>
      <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 24px;">Publicado el ${dateDisplay} · Esteban Serna</p>
      ${hasCoverImage ? `<img src="${imageUrl}" alt="${escapeHtmlAttr(article.title)}" style="width: 100%; border-radius: 14px; margin-bottom: 32px; border: 1px solid var(--gold-border);">` : ""}
      <article style="color: var(--text-secondary); font-size: 16px; line-height: 1.85;">
        ${article.bodyHtml}
      </article>
      ${sourcesHtml}
      <div style="text-align: center; margin: 56px 0 20px;">
        <a href="${SITE_URL}/#reservar" class="btn btn-primary">Agendar Diagnóstico Gratis (30 min)</a>
      </div>
    </main>
${FOOTER_HTML}
  </div>
${MOBILE_MENU_SCRIPT}
</body>
</html>`;
}

export function renderIndexPage(posts) {
  const cards = posts
    .slice()
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .map((p) => `
        <a href="${SITE_URL}/blog/posts/${p.slug}.html" class="insight-card" style="text-decoration:none; display:block; overflow:hidden; padding:0;">
          ${p.hasCoverImage ? `<img src="${SITE_URL}/blog/posts/${p.slug}-cover.png" alt="${escapeHtmlAttr(p.title)}" style="width:100%; aspect-ratio: 1200 / 630; object-fit:cover; display:block;">` : ""}
          <div style="padding: 20px;">
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">${new Date(p.publishedAt).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}</div>
            <h3 class="insight-card-title">${escapeHtmlAttr(p.title)}</h3>
            <p class="insight-card-text">${escapeHtmlAttr(p.excerpt)}</p>
          </div>
        </a>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blog | Esteban IA — Agentes de IA y Automatización Empresarial</title>
  <meta name="description" content="Artículos sobre agentes de IA, automatización empresarial y transformación digital para negocios en Colombia.">
  <link rel="canonical" href="${SITE_URL}/blog/">
  <link rel="icon" type="image/png" sizes="192x192" href="${SITE_URL}/images/favicon-192.png">
  <link rel="stylesheet" href="${SITE_URL}/css/styles.css">
</head>
<body>
  <canvas id="quantum-canvas" style="position:fixed; inset:0; z-index:-1;"></canvas>
  <div class="app-container">
${HEADER_HTML}
    <section class="section" style="max-width: 1100px; margin: 0 auto;">
      <div class="section-header">
        <div class="section-tagline">BLOG</div>
        <h1 class="section-title text-gradient">Agentes de IA y Automatización Empresarial</h1>
        <p class="section-description">Artículos sobre cómo la inteligencia artificial puede transformar la operación de tu negocio en Colombia.</p>
      </div>
      <div class="insights-grid">
${cards || '<p style="color: var(--text-muted);">Muy pronto el primer artículo.</p>'}
      </div>
    </section>
${FOOTER_HTML}
  </div>
${MOBILE_MENU_SCRIPT}
</body>
</html>`;
}

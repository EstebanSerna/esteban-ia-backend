import crypto from "node:crypto";

// Token firmado (HMAC) sin necesidad de guardar nada en ningun lado: se
// recalcula igual cada vez que se verifica, a partir del slug + una accion
// (publicar/descartar) + el secreto. Si alguien cambia el slug o la accion
// en la URL, el token deja de coincidir.
function getSecret() {
  const secret = process.env.BLOG_APPROVAL_SECRET;
  if (!secret) throw new Error("BLOG_APPROVAL_SECRET no configurado");
  return secret;
}

export function generateApprovalToken(slug, action) {
  return crypto.createHmac("sha256", getSecret()).update(`${slug}:${action}`).digest("hex");
}

export function verifyApprovalToken(slug, action, token) {
  if (!token) return false;
  const expected = generateApprovalToken(slug, action);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

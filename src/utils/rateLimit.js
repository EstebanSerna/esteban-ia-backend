// Limite simple de peticiones por minuto en memoria -- reemplaza
// CacheService de Apps Script. Vale mientras el servicio corra en una sola
// replica (es la configuracion actual en Railway); si algun dia se escalan
// replicas, esto habria que moverlo a un store compartido (p.ej. Redis).
const counters = new Map();

export function isWithinRateLimit(key, maxPerMinute) {
  const windowKey = `${key}_${Math.floor(Date.now() / 60000)}`;
  const current = counters.get(windowKey) || 0;
  if (current >= maxPerMinute) return false;
  counters.set(windowKey, current + 1);
  // Limpieza perezosa de ventanas viejas para no crecer sin limite.
  if (counters.size > 500) {
    const cutoff = Math.floor(Date.now() / 60000) - 5;
    for (const k of counters.keys()) {
      const windowPart = Number(k.split("_").pop());
      if (windowPart < cutoff) counters.delete(k);
    }
  }
  return true;
}

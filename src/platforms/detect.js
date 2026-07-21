// src/platforms/detect.js
// URL-based detection. Mirrors the reference's a/k branch but returns null for anything else.

/**
 * @param {Location|{pathname: string, href: string}} loc
 * @returns {'weba'|'webk'|null}
 */
export function detectPlatform(loc = globalThis.location) {
  if (!loc?.pathname) return null;
  if (loc.pathname.startsWith('/a')) return 'weba';
  if (loc.pathname.startsWith('/k')) return 'webk';
  return null;
}

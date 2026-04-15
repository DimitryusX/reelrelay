const URL_RE = /https?:\/\/[^\s<>"')]+/gi;

/**
 * Whether the hostname is one we try to handle (IG / TikTok / FB).
 * @param {string} hostname
 */
function isSupportedHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === "fb.watch") return true;
  if (h === "vm.tiktok.com" || h === "vt.tiktok.com") return true;
  if (h === "tiktok.com" || h.endsWith(".tiktok.com")) return true;
  if (h === "instagram.com" || h.endsWith(".instagram.com")) return true;
  if (h === "facebook.com" || h.endsWith(".facebook.com")) return true;
  return false;
}

/**
 * Extract unique supported social URLs from plain text.
 * @param {string} text
 * @returns {string[]}
 */
export function extractSupportedUrls(text) {
  if (!text) return [];
  const seen = new Set();
  const out = [];
  for (const m of text.matchAll(URL_RE)) {
    let raw = m[0];
    raw = raw.replace(/[),.;]+$/g, "");
    let u;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    if (!isSupportedHost(u.hostname)) continue;
    const key = u.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

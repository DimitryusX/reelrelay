const URL_RE = /https?:\/\/[^\s<>"')]+/gi;

/**
 * Facebook photo pages (`/photo/?fbid=`, `/photo.php?fbid=`, `/<user>/photos/…`,
 * `/share/p/…`). Sent as photos via gallery-dl (yt-dlp cannot extract them).
 * Legacy `photo.php?v=` video links are not photos.
 * @param {URL} u
 */
function isFacebookPhotoUrl(u) {
  const h = u.hostname.toLowerCase();
  if (h !== "facebook.com" && !h.endsWith(".facebook.com")) return false;
  const p = u.pathname.toLowerCase();
  if (p === "/photo.php") return !u.searchParams.has("v");
  if (p === "/photo" || p.startsWith("/photo/")) return true;
  if (/^\/[^/]+\/photos\//.test(p)) return true;
  if (/\/share\/p\//.test(p)) return true;
  return false;
}

/**
 * Whether the URL looks like a single video post (not a profile, photo album,
 * explore page, etc.). Anything else is ignored with no chat reply.
 * @param {URL} u
 */
function isVideoUrl(u) {
  const h = u.hostname.toLowerCase();
  const p = u.pathname.toLowerCase();

  // Short links resolve to a single clip.
  if (h === "fb.watch") return true;
  if (h === "vm.tiktok.com" || h === "vt.tiktok.com") return true;

  if (h === "tiktok.com" || h.endsWith(".tiktok.com")) {
    if (p.includes("/photo")) return false;
    return /\/video\/|\/t\/|\/v\//.test(p);
  }

  if (h === "instagram.com" || h.endsWith(".instagram.com")) {
    // /reel/, /reels/, /tv/, /p/ (video posts; photo-only /p/ stay silent later)
    return /^\/(reel|reels|tv|p)\//.test(p);
  }

  if (h === "facebook.com" || h.endsWith(".facebook.com")) {
    if (isFacebookPhotoUrl(u)) return false;
    if (/\/(reel|reels|watch|videos)(\/|$)/.test(p)) return true;
    if (/\/share\/(v|r)\//.test(p)) return true;
    if (/^\/[^/]+\/videos\//.test(p)) return true;
    if (p === "/photo.php" && u.searchParams.has("v")) return true;
    return false;
  }

  return false;
}

/**
 * @param {string} url
 * @returns {"video" | "photo" | null}
 */
export function classifyMediaUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (isFacebookPhotoUrl(u)) return "photo";
  if (isVideoUrl(u)) return "video";
  return null;
}

/**
 * Extract unique supported social media URLs from plain text.
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
    if (!isFacebookPhotoUrl(u) && !isVideoUrl(u)) continue;
    const key = u.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * Supported URLs from a Telegram message: its text or media caption, plus
 * links hidden behind `text_link` entities.
 * @param {{ text?: string, caption?: string, entities?: { type: string, url?: string }[], caption_entities?: { type: string, url?: string }[] }} message
 * @returns {string[]}
 */
export function collectMessageUrls(message) {
  const text = message.text ?? message.caption ?? "";
  const entities = message.entities ?? message.caption_entities ?? [];
  const linked = entities
    .filter((e) => e.type === "text_link" && e.url)
    .map((e) => e.url);
  return extractSupportedUrls([text, ...linked].join(" "));
}

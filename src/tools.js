import { CAPTION_LIMIT } from "./constants.js";

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
 * Facebook photo pages (`/photo/?fbid=`, `/photo.php?fbid=`, `/<user>/photos/…`).
 * yt-dlp has no extractor for them; legacy `photo.php?v=` video links are kept.
 * @param {URL} u
 */
function isFacebookPhotoUrl(u) {
  const h = u.hostname.toLowerCase();
  if (h !== "facebook.com" && !h.endsWith(".facebook.com")) return false;
  const p = u.pathname.toLowerCase();
  if (p === "/photo.php") return !u.searchParams.has("v");
  return p === "/photo" || p === "/photo/" || /^\/[^/]+\/photos\//.test(p);
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
    if (isFacebookPhotoUrl(u)) continue;
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

/**
 * Short failure text for the chat: yt-dlp `ERROR:` lines if any, otherwise the
 * first line. The full output (paths, debug lines) goes to the log only.
 * @param {unknown} e
 */
export function formatFailure(e) {
  const msg = e instanceof Error ? e.message : String(e);
  const errors = msg.split("\n").filter((l) => l.startsWith("ERROR:"));
  return errors.length > 0 ? errors.join("\n") : msg.split("\n")[0];
}

/**
 * Display name of the sender: the chat title for anonymous admins / channel
 * posts, otherwise "First Last".
 * @param {{ from?: { first_name: string, last_name?: string }, sender_chat?: { title?: string } }} message
 * @returns {string | null}
 */
function senderName(message) {
  if (message.sender_chat?.title) return message.sender_chat.title;
  if (!message.from) return null;
  return [message.from.first_name, message.from.last_name]
    .filter(Boolean)
    .join(" ");
}

/**
 * Video caption "Sender: url"; the sender's name is a `text_mention` linking
 * to their profile (works without a username). Anonymous admins and channels
 * get their chat title as plain text.
 * @param {Parameters<typeof senderName>[0]} message
 * @param {string} url
 */
export function buildCaption(message, url) {
  const name = senderName(message);
  const caption = (name ? `${name}: ${url}` : url).slice(0, CAPTION_LIMIT);
  if (!name || message.sender_chat || !message.from) return { caption };
  return {
    caption,
    caption_entities: [
      {
        type: /** @type {const} */ ("text_mention"),
        offset: 0,
        length: Math.min(name.length, CAPTION_LIMIT),
        user: message.from,
      },
    ],
  };
}

/**
 * Whether the text is nothing but supported links, so deleting the message
 * after its videos are posted loses nothing.
 * @param {string | undefined} text
 */
export function isOnlyLinks(text) {
  const tokens = text?.trim().split(/\s+/).filter(Boolean) ?? [];
  return (
    tokens.length > 0 &&
    tokens.every(
      (t) => /^https?:\/\//i.test(t) && extractSupportedUrls(t).length === 1,
    )
  );
}

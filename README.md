# ReelRelay

**ReelRelay** is a Telegram bot on **Node.js** ([grammY](https://grammy.dev/)) that finds **Instagram**, **TikTok**, or **Facebook** links in a message, downloads the video with **[yt-dlp](https://github.com/yt-dlp/yt-dlp)**, and replies in the same chat with **MP4** (H.264 + AAC when transcoding is required via **ffmpeg**).

## Requirements

- **Node.js** 20 or newer
- **[pnpm](https://pnpm.io/)** 9 (via Corepack: `corepack enable`)
- **`yt-dlp`** and **`ffmpeg`** on **PATH**
- Bot token from [@BotFather](https://t.me/BotFather)

Check:

```bash
node -v
yt-dlp --version
ffmpeg -version
```

## Setup

```bash
git clone <repo-url> reelrelay
cd reelrelay
corepack enable
pnpm install
cp .env.example .env
```

Edit `.env`: **`BOT_TOKEN`** (required). **`YT_DLP_COOKIES_FILE`** — optional path to Netscape `cookies.txt` for Instagram/Facebook when yt-dlp needs auth ([FAQ](https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp)).

```env
BOT_TOKEN=123456:ABC...
# YT_DLP_COOKIES_FILE=/path/to/cookies.txt
```

## Run

```bash
pnpm start
```

You should see something like `Bot @your_bot started`. Send the bot (or a group with the bot) a message **containing a supported link** — it replies with the video (as a reply to your message).

### Groups

If the bot in a **group / supergroup** ignores normal messages with links, turn off **Group Privacy** in @BotFather or include `@your_bot_username` in the text.

## Do I need a web server?

**No.** The bot uses the Telegram **Bot API** in **long polling** mode: the process repeatedly asks Telegram for updates (`getUpdates`), receives new messages, and handles them. Outbound HTTPS is enough; **you do not need to expose an HTTP port**.

The alternative is a **webhook**: Telegram **POSTs** updates to your **HTTPS** URL. That needs a certificate, an HTTP route (Express/Fastify, etc.), and `bot.api.setWebhook(...)`. For a small private bot, **long polling** (as with grammY `bot.start()`) is usually simpler.

## Docker

The image includes **ffmpeg**, **yt-dlp** (via `pip`), and **ca-certificates**. Node dependencies are installed with **pnpm** (`pnpm install --frozen-lockfile --prod` after `corepack enable`).

1. Create `.env` with `BOT_TOKEN` (as above).
2. Build and run:

```bash
docker compose up -d --build
```

Logs:

```bash
docker compose logs -f reelrelay
```

Stop:

```bash
docker compose down
```

To refresh **yt-dlp** inside the image, rebuild the apt/pip layer or run `pip install -U yt-dlp` in the container; for a clean refresh use `docker compose build --no-cache` and `up -d`.

## Supported links

The bot scans message text and keeps URLs whose host matches, for example:

- `instagram.com` (including subdomains)
- `tiktok.com`, `vm.tiktok.com`, `vt.tiktok.com`
- `facebook.com`, `m.facebook.com`, `fb.watch`

Other sites are ignored.

## Limits and behavior

- **Upload size** for the standard Bot API is about **50 MB**. Larger files are not sent; the bot explains that in chat.
- Only **one** download pipeline per **chat** at a time; if you send another link while busy, you get a short “please wait” reply.
- Multiple supported links in one message are processed **one after another**.
- Temp files live under the system temp dir (`os.tmpdir()`); the folder is removed after send or on error.
- Restricted Instagram/Facebook: set **`YT_DLP_COOKIES_FILE`** if needed.

## Troubleshooting

- **`corepack enable` permission errors** (symlink into global `bin`) — use `npx pnpm@9.15.9 install` for a one-off, or fix permissions / update Node.
- **`yt-dlp` not found** — install [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation) and ensure it is on `PATH`.
- **Facebook / Instagram** — update `yt-dlp`; “unreachable” / auth → **`YT_DLP_COOKIES_FILE`** (Netscape `cookies.txt`).
- **Slow runs or high CPU** — normal when the **ffmpeg** transcode path runs (e.g. non-MP4 container).

## Legal

Downloading and redistributing content may violate platform terms and copyright law. Use **ReelRelay** only for content you are allowed to handle, and follow local regulations.

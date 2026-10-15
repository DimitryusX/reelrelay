import "dotenv/config";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Bot, InputFile } from "grammy";
import { SHUTDOWN_GRACE_MS, TELEGRAM_PHOTO_LIMIT } from "./constants.js";
import { classifyMediaUrl, collectMessageUrls } from "./tools.js";
import { downloadFacebookPhoto, downloadWithYtDlp } from "./ydl.js";

const DEFAULT_TELEGRAM_FILE_LIMIT_MB = 50;
const parsedLimitMb = Number.parseFloat(process.env.TELEGRAM_FILE_LIMIT ?? "");
const limitMb =
  Number.isFinite(parsedLimitMb) && parsedLimitMb > 0
    ? parsedLimitMb
    : DEFAULT_TELEGRAM_FILE_LIMIT_MB;
const TELEGRAM_FILE_LIMIT = Math.floor(limitMb * 1024 * 1024);

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("Set BOT_TOKEN in .env (see .env.example)");
  process.exit(1);
}

const bot = new Bot(token);

/** Chats with an active download job (one pipeline per chat). */
const busyChats = new Set();
/** Running download jobs, awaited briefly on shutdown. */
const jobs = new Set();

// grammY's bot.start() handles updates one by one, so the download runs in the
// background; awaiting it here would stall every other chat.
bot.on(["message:text", "message:caption"], (ctx, next) => {
  const job = relayLinks(ctx, next)
    .catch((err) => console.error("Relay failed:", err))
    .finally(() => jobs.delete(job));
  jobs.add(job);
});

/**
 * @param {import("grammy").Context & { message: any, chat: any }} ctx
 * @param {() => Promise<void>} next
 */
async function relayLinks(ctx, next) {
  const urls = collectMessageUrls(ctx.message);
  if (urls.length === 0) return next();

  const chatId = ctx.chat.id;
  if (busyChats.has(chatId)) {
    await ctx.reply("Already processing a link in this chat. Please wait.");
    return;
  }

  busyChats.add(chatId);
  try {
    for (const url of urls) {
      let workDir = "";
      try {
        const kind = classifyMediaUrl(url);
        if (!kind) continue;

        // No chat reply until media is ready. Missing / failed downloads are
        // logged only (silent ignore in the chat).
        await ctx
          .replyWithChatAction(kind === "photo" ? "upload_photo" : "upload_video")
          .catch(() => {});
        workDir = await mkdtemp(path.join(os.tmpdir(), "reelrelay-"));
        const filePath =
          kind === "photo"
            ? await downloadFacebookPhoto(url, workDir)
            : await downloadWithYtDlp(url, workDir);
        const { size } = await stat(filePath);
        if (size > TELEGRAM_FILE_LIMIT) {
          await ctx.reply(
            `File too large (${(size / 1024 / 1024).toFixed(1)} MB). Limit is ~${limitMb % 1 === 0 ? limitMb : limitMb.toFixed(1)} MB.`,
            { reply_parameters: { message_id: ctx.message.message_id } },
          );
          continue;
        }
        const media = {
          caption: url,
          reply_parameters: { message_id: ctx.message.message_id },
        };
        if (kind === "photo") {
          if (size > TELEGRAM_PHOTO_LIMIT) {
            await ctx.replyWithDocument(new InputFile(filePath), media);
          } else {
            await ctx.replyWithPhoto(new InputFile(filePath), media);
          }
        } else {
          await ctx.replyWithVideo(new InputFile(filePath), media);
        }
      } catch (e) {
        console.error(`Failed to relay ${url}:`, e);
      } finally {
        if (workDir) {
          await rm(workDir, { recursive: true, force: true }).catch(() => {});
        }
      }
    }
  } finally {
    busyChats.delete(chatId);
  }
}

bot.catch((err) => {
  console.error("grammY error:", err);
});

// Stop polling on `docker stop` / Ctrl+C, let running jobs finish briefly, exit.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await bot.stop().catch(() => {});
    await Promise.race([
      Promise.all(jobs),
      new Promise((r) => setTimeout(r, SHUTDOWN_GRACE_MS)),
    ]);
    process.exit(0);
  });
}

bot.start({
  onStart: (me) => {
    console.log(`Bot @${me.username} started`);
  },
});

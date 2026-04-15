import "dotenv/config";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Bot, InputFile } from "grammy";
import { extractSupportedUrls } from "./tools.js";
import { downloadWithYtDlp } from "./ydl.js";

const TELEGRAM_FILE_LIMIT = 50 * 1024 * 1024;

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("Set BOT_TOKEN in .env (see .env.example)");
  process.exit(1);
}

const bot = new Bot(token);

/** Chats with an active download job (one pipeline per chat). */
const busyChats = new Set();

bot.on("message:text", async (ctx, next) => {
  const text = ctx.message.text;
  const urls = extractSupportedUrls(text);
  if (urls.length === 0) return next();

  const chatId = ctx.chat.id;
  if (busyChats.has(chatId)) {
    await ctx.reply("Already processing a link in this chat. Please wait.");
    return;
  }

  busyChats.add(chatId);
  try {
    for (const url of urls) {
      const status = await ctx.reply("Downloading and converting to MP4…", {
        reply_parameters: { message_id: ctx.message.message_id },
      });
      let workDir = "";
      try {
        workDir = await mkdtemp(path.join(os.tmpdir(), "reelrelay-"));
        const filePath = await downloadWithYtDlp(url, workDir);
        const { size } = await stat(filePath);
        if (size > TELEGRAM_FILE_LIMIT) {
          await ctx.api.editMessageText(
            chatId,
            status.message_id,
            `File too large (${(size / 1024 / 1024).toFixed(1)} MB). Telegram bot upload limit is ~50 MB.`,
          );
          continue;
        }
        await ctx.replyWithVideo(new InputFile(filePath), {
          caption: url,
          reply_parameters: { message_id: ctx.message.message_id },
        });
        await ctx.api.deleteMessage(chatId, status.message_id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await ctx.api.editMessageText(
          chatId,
          status.message_id,
          `Failed: ${msg.slice(0, 3500)}`,
        );
      } finally {
        if (workDir) {
          await rm(workDir, { recursive: true, force: true }).catch(() => {});
        }
      }
    }
  } finally {
    busyChats.delete(chatId);
  }
});

bot.catch((err) => {
  console.error("grammY error:", err);
});

bot.start({
  onStart: (me) => {
    console.log(`Bot @${me.username} started`);
  },
});

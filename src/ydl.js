import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  FFMPEG_TIMEOUT_MS,
  FFPROBE_TIMEOUT_MS,
  YT_DLP_FORMAT_SORT,
  YT_DLP_TIMEOUT_MS,
} from "./constants.js";

const VIDEO_EXT = new Set([".mp4", ".mkv", ".webm", ".mov", ".m4v"]);

/** yt-dlp found a URL but there is no video to download (e.g. photo-only post). */
export class NoVideoContentError extends Error {
  constructor() {
    super("No video content");
    this.name = "NoVideoContentError";
  }
}

function isNoVideoContentMessage(message) {
  return /No video formats found/i.test(message);
}

/**
 * Download media with yt-dlp, merge to MP4 when possible, and transcode when
 * the result is not H.264/AAC MP4 (Telegram does not play other codecs inline).
 * @param {string} url
 * @param {string} workDir Absolute path to an empty temp directory.
 * @returns {Promise<string>} Path to the final video file (preferably .mp4).
 */
export async function downloadWithYtDlp(url, workDir) {
  const outTemplate = path.join(workDir, "video.%(ext)s");
  const args = [
    "--no-warnings",
    "--no-playlist",
    "--newline",
  ];

  const cookiesRaw = process.env.YT_DLP_COOKIES_FILE?.trim();
  if (cookiesRaw) {
    const cookiesPath = path.isAbsolute(cookiesRaw)
      ? cookiesRaw
      : path.resolve(process.cwd(), cookiesRaw);
    await access(cookiesPath, constants.R_OK).catch(() => {
      throw new Error(
        `YT_DLP_COOKIES_FILE is not a readable file: ${cookiesPath}`,
      );
    });
    args.push("--cookies", cookiesPath);
  }

  args.push(
    "-o",
    outTemplate,
    // Best video+audio, mux into a single MP4 container
    "-f",
    "bv*+ba/b",
    "-S",
    YT_DLP_FORMAT_SORT,
    "--merge-output-format",
    "mp4",
    url,
  );

  try {
    await runProcess("yt-dlp", args, {
      cwd: workDir,
      timeoutMs: YT_DLP_TIMEOUT_MS,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isNoVideoContentMessage(msg)) {
      throw new NoVideoContentError();
    }
    throw e;
  }

  const file = await pickLatestVideoFile(workDir);
  if (!file) {
    throw new Error("yt-dlp finished without a video file in the work directory");
  }

  const ext = path.extname(file).toLowerCase();

  if (isTelegramCompatible(ext, await probeVideo(file))) {
    return file;
  }

  const mp4Path = path.join(workDir, "video.final.mp4");
  await transcodeToMp4(file, mp4Path);
  return mp4Path;
}

/**
 * @param {string} inputPath
 * @param {string} outputPath
 */
function transcodeToMp4(inputPath, outputPath) {
  const args = [
    "-y",
    "-i",
    inputPath,
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-level",
    "4.0",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-crf",
    "23",
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    outputPath,
  ];
  return runProcess("ffmpeg", args, { timeoutMs: FFMPEG_TIMEOUT_MS });
}

/**
 * Run a command and resolve with its stdout. stdout must always be read: an
 * unread pipe blocks the child once its buffer (~64 KB) fills up. With
 * `timeoutMs`, the command and everything it started is killed when time is up.
 * @param {string} cmd
 * @param {string[]} args
 * @param {import('node:child_process').SpawnOptions & { timeoutMs?: number }} opts
 * @returns {Promise<string>}
 */
function runProcess(cmd, args, { timeoutMs = 0, ...opts }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      // Own process group, so a timeout also kills e.g. yt-dlp's ffmpeg.
      detached: true,
      ...opts,
    });
    let timedOut = false;
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            killProcessGroup(child);
          }, timeoutMs)
        : undefined;
    let stdout = "";
    child.stdout?.on("data", (c) => {
      stdout += c.toString();
    });
    let stderr = "";
    child.stderr?.on("data", (c) => {
      stderr += c.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `${cmd} could not be spawned (${err.message}). Make sure ${cmd} is on PATH.`,
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut)
        reject(new Error(`${cmd} timed out after ${timeoutMs / 1000} s`));
      else if (code === 0) resolve(stdout);
      else
        reject(
          new Error(
            `${cmd} exited with code ${code}\n${stderr.slice(-4000)}`,
          ),
        );
    });
  });
}

/**
 * Pick the newest video-like file in a directory (yt-dlp output).
 * @param {string} dir
 */
async function pickLatestVideoFile(dir) {
  const names = await readdir(dir);
  let best = /** @type {{ p: string, m: number } | null} */ (null);
  for (const name of names) {
    const ext = path.extname(name).toLowerCase();
    if (!VIDEO_EXT.has(ext)) continue;
    const p = path.join(dir, name);
    const st = await stat(p);
    if (!st.isFile()) continue;
    if (!best || st.mtimeMs > best.m) best = { p, m: st.mtimeMs };
  }
  return best?.p ?? null;
}

/** @param {import('node:child_process').ChildProcess} child */
function killProcessGroup(child) {
  try {
    if (child.pid) process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

/**
 * Telegram clients play MP4 with 8-bit H.264 and AAC (or no audio) inline.
 * @param {string} ext Lowercase extension, e.g. ".mp4".
 * @param {{ vcodec: string | null, pixFmt: string | null, acodec: string | null }} probe
 */
function isTelegramCompatible(ext, { vcodec, pixFmt, acodec }) {
  return (
    ext === ".mp4" &&
    vcodec === "h264" &&
    (pixFmt === "yuv420p" || pixFmt === "yuvj420p") &&
    (acodec === null || acodec === "aac")
  );
}

/**
 * Codecs of the first video and audio streams.
 * @param {string} file
 */
async function probeVideo(file) {
  const out = await runProcess(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,pix_fmt",
      "-of",
      "json",
      file,
    ],
    { timeoutMs: FFPROBE_TIMEOUT_MS },
  );
  /** @type {{ codec_type?: string, codec_name?: string, pix_fmt?: string }[]} */
  const streams = JSON.parse(out).streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  return {
    vcodec: video?.codec_name ?? null,
    pixFmt: video?.pix_fmt ?? null,
    acodec: audio?.codec_name ?? null,
  };
}

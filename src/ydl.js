import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";

const VIDEO_EXT = new Set([".mp4", ".mkv", ".webm", ".mov", ".m4v"]);

/**
 * Download media with yt-dlp, merge to MP4 when possible, otherwise transcode.
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
    "--merge-output-format",
    "mp4",
    url,
  );

  await runProcess("yt-dlp", args, { cwd: workDir });

  const file = await pickLatestVideoFile(workDir);
  if (!file) {
    throw new Error("yt-dlp finished without a video file in the work directory");
  }

  const ext = path.extname(file).toLowerCase();

  if (ext === ".mp4") {
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
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputPath,
  ];
  return runProcess("ffmpeg", args, {});
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {import('node:child_process').SpawnOptions} opts
 */
function runProcess(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });
    let stderr = "";
    child.stderr?.on("data", (c) => {
      stderr += c.toString();
    });
    child.on("error", (err) => {
      reject(
        new Error(
          `${cmd} could not be spawned (${err.message}). Make sure ${cmd} is on PATH.`,
        ),
      );
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
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

/** yt-dlp run per link; it is killed (with the ffmpeg it started) after this. */
export const YT_DLP_TIMEOUT_MS = 10 * 60_000;
/** ffmpeg transcode to MP4. */
export const FFMPEG_TIMEOUT_MS = 20 * 60_000;
/** ffprobe codec check. */
export const FFPROBE_TIMEOUT_MS = 60_000;

/**
 * yt-dlp format sort: prefer H.264/AAC, which Telegram plays inline
 * (by default yt-dlp ranks AV1/VP9/H.265 above H.264).
 */
export const YT_DLP_FORMAT_SORT = "vcodec:h264,acodec:aac";

/** Max length of an error message shown in chat. */
export const ERROR_TEXT_LIMIT = 3500;

/** On SIGTERM/SIGINT, running downloads get this long to finish. */
export const SHUTDOWN_GRACE_MS = 5_000;

/** Telegram caps media captions at 1024 characters. */
export const CAPTION_LIMIT = 1024;

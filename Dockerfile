FROM node:20-bookworm-slim

# ffmpeg: mux audio/video and transcode to MP4 when needed
# python3 + pip: yt-dlp (videos; curl_cffi for TikTok) and gallery-dl (FB photos)
# ca-certificates: HTTPS to Telegram and social platforms
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    python3 \
    python3-pip \
  && pip3 install --no-cache-dir --break-system-packages \
    'yt-dlp[default,curl-cffi]' \
    gallery-dl \
  && rm -rf /var/lib/apt/lists/*

# TikTok (yt-dlp >= 2026.06) only passes its challenge with impersonation
RUN yt-dlp --list-impersonate-targets | grep -qE 'curl_cffi$'

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY src ./src

ENV NODE_ENV=production

COPY docker-entrypoint.sh ./
ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
CMD ["node", "src/index.js"]

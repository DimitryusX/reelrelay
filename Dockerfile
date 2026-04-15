FROM node:20-bookworm-slim

# ffmpeg: mux audio/video and transcode to MP4 when needed
# python3 + pip: install/update yt-dlp from PyPI
# ca-certificates: HTTPS to Telegram and social platforms
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    python3 \
    python3-pip \
  && pip3 install --no-cache-dir --break-system-packages yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY src ./src

ENV NODE_ENV=production

CMD ["node", "src/index.js"]

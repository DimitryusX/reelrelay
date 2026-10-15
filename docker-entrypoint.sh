#!/bin/sh
set -e

# Instagram/Facebook/TikTok extractors break often; refresh yt-dlp on every
# start (set YT_DLP_AUTO_UPDATE=0 to keep the version baked into the image).
if [ "${YT_DLP_AUTO_UPDATE:-1}" != "0" ]; then
  pip3 install --no-cache-dir --break-system-packages --root-user-action=ignore \
    --quiet --upgrade 'yt-dlp[default,curl-cffi]' \
    || echo "yt-dlp update failed, keeping $(yt-dlp --version)" >&2
fi

exec "$@"

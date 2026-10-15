#!/bin/sh
set -e

# Social extractors break often; refresh on every start
# (set YT_DLP_AUTO_UPDATE=0 to keep the versions baked into the image).
if [ "${YT_DLP_AUTO_UPDATE:-1}" != "0" ]; then
  pip3 install --no-cache-dir --break-system-packages --root-user-action=ignore \
    --quiet --upgrade 'yt-dlp[default,curl-cffi]' gallery-dl \
    || echo "extractor update failed, keeping baked-in versions" >&2
fi

exec "$@"

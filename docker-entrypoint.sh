#!/bin/sh
set -e

# Simple entrypoint - proxy is handled by undici ProxyAgent
if [ -n "$HTTP_PROXY" ]; then
    echo "[Entrypoint] HTTP_PROXY configured: $HTTP_PROXY"
    echo "[Entrypoint] Proxy will be handled by undici ProxyAgent"
fi

echo "[Entrypoint] Starting: $@"

# Run as worker user (Alpine uses su-exec instead of gosu)
exec su-exec worker "$@"

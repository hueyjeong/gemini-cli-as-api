# syntax=docker/dockerfile:1.4
# Dockerfile for Gemini CLI with Bun Runtime
# Multi-stage build for minimal production image
# BuildKit enabled for parallel layer building and cache optimization

# ========== Build Stage ==========
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install all dependencies (including dev dependencies for TypeScript)
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# ========== Production Stage ==========
FROM oven/bun:1-alpine

# Install required packages (removed redsocks/iptables - proxy handled by undici)
RUN apk add --no-cache wget ca-certificates su-exec && \
    update-ca-certificates

# Create a non-root user for security
RUN addgroup -g 1001 nodejs && \
    adduser -D -u 1001 -G nodejs worker && \
    mkdir -p /home/worker

WORKDIR /app

# Copy package.json and install production dependencies only
COPY package.json ./
RUN bun install --production

# Copy source code from builder (Bun runs TypeScript natively)
COPY --from=builder --chown=worker:nodejs /app/src ./src

# Copy entrypoint script from builder
COPY --from=builder /app/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create data directory for token caching
RUN mkdir -p /app/data && \
    chown -R worker:nodejs /app/data

# Expose the port the server will run on
EXPOSE 8787

# Health check
HEALTHCHECK --interval=120s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8787/health || exit 1

# Use entrypoint script to configure proxy
ENTRYPOINT ["/docker-entrypoint.sh"]

# Run Bun server (native TypeScript support)
CMD ["bun", "run", "src/node-server.ts"]

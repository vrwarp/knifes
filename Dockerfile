# syntax=docker/dockerfile:1

# ---------- build the player + GM front-end ----------
FROM node:22-bookworm-slim AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---------- build the server ----------
FROM node:22-bookworm-slim AS server
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
# Keep optional deps: that is how the Claude Agent SDK ships its native binary.
RUN npm ci
COPY server/ ./
RUN npm run build \
 && npm prune --omit=dev \
 && rm -rf node_modules/@anthropic-ai/claude-agent-sdk-*-musl

# ---------- runtime ----------
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    CLIENT_DIST=/app/client/dist
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 1001 section30 \
 && mkdir -p /data && chown section30:section30 /data
WORKDIR /app/server
COPY --from=server --chown=section30:section30 /app/server/package.json ./
COPY --from=server --chown=section30:section30 /app/server/node_modules ./node_modules
COPY --from=server --chown=section30:section30 /app/server/dist ./dist
COPY --from=client --chown=section30:section30 /app/client/dist /app/client/dist
USER section30
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/index.js"]

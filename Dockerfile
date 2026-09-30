# syntax=docker/dockerfile:1

# ---- build -----------------------------------------------------------------
# The output is plain JavaScript, so it is built once on the build machine's own
# architecture (fast, no emulation) and then copied into each target image.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

# ---- runtime ---------------------------------------------------------------
FROM node:24-alpine
RUN apk add --no-cache su-exec tini
WORKDIR /app
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION \
    NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--", "docker-entrypoint.sh"]
CMD ["node", "--disable-warning=ExperimentalWarning", "build/server/src/index.js"]

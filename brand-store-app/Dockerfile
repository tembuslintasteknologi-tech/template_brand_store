FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install dependencies into temp directory
FROM base AS install
RUN mkdir -p /temp/dev
COPY brand-store-app/package.json brand-store-app/bun.lockb* brand-store-app/package-lock.json* /temp/dev/
RUN cd /temp/dev && npm install --frozen-lockfile || bun install --frozen-lockfile

# Copy node_modules from temp directory
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules /app/node_modules
COPY brand-store-app/ .

# Production image
FROM base AS release
COPY --from=prerelease /app /app

EXPOSE 3000
USER bun
ENTRYPOINT [ "bun", "run", "src/index.ts" ]

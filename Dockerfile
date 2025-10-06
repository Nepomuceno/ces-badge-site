# syntax=docker/dockerfile:1.7

FROM oven/bun:1 AS builder
WORKDIR /app

# Install dependencies first for better layer caching
COPY bun.lock package.json ./
RUN bun install --frozen-lockfile

# Bring in the rest of the source
COPY . ./

# Build the production bundle
RUN bun run build

# Re-install only production dependencies for the runtime image
RUN rm -rf node_modules && bun install --frozen-lockfile --production

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy production dependencies and build output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/server ./server

EXPOSE 80
ENV PORT=80

CMD ["node", "server/start.js"]

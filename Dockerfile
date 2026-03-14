# Multi-stage Dockerfile for Next.js (app router)
FROM node:20-slim AS builder

WORKDIR /app

# Install build deps for native modules (sharp, etc.)
RUN apt-get update && \
    apt-get install -y python3 build-essential libvips-dev && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Copy package manifest and install
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

### Runtime image
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Minimal runtime deps for image processing and proper signal handling
RUN apt-get update && \
    apt-get install -y libvips42 ca-certificates dumb-init && \
    rm -rf /var/lib/apt/lists/*

# Copy required files from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Create non-root user
RUN useradd -m nextjs && chown -R nextjs:nextjs /app
USER nextjs

EXPOSE 3000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["npm", "start"]

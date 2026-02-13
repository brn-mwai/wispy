# ── Wispy AI Agent - Multi-stage Docker build ──────────────────
#
# Build:  docker build -t wispy .
# Run:    docker run -it --env-file .env wispy
# Deploy: Railway / Render / Fly.io one-click

# ── Stage 1: Build ─────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for tsc)
RUN npm ci --ignore-scripts

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/
COPY wispy/ ./wispy/
COPY bin/ ./bin/

# Build TypeScript
RUN npx tsc

# ── Stage 2: Runtime ──────────────────────────────────────────
FROM node:22-slim AS runtime

WORKDIR /app

# System deps for native modules (better-sqlite3, sharp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy built JS + assets from builder
COPY --from=builder /app/dist/ ./dist/
COPY --from=builder /app/bin/ ./bin/
COPY --from=builder /app/wispy/ ./wispy/

# Copy optional config files
COPY .env.example ./.env.example

# Create runtime directories
RUN mkdir -p /app/wispy/runtime

# Default port for gateway mode
ENV PORT=3000
EXPOSE 3000

# Health check for gateway mode
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Entry point - gateway mode by default (headless, API-driven)
ENTRYPOINT ["node", "dist/cli/program.js"]
CMD ["gateway"]

# ── Stage 1: Build React client ──────────────────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /build/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ── Stage 2: Production runtime ───────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Install server deps only
COPY server/package*.json ./
RUN npm ci --omit=dev

# Copy server source
COPY server/ ./

# Copy built React app → Express will serve it as static files
COPY --from=frontend /build/client/dist ./public

# SQLite data lives on a mounted volume; create the directory
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

EXPOSE 3000

CMD ["node", "index.js"]

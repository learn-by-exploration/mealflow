# ─── Stage 1: Install production dependencies ───
FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ─── Stage 2: Production image ───
FROM node:22-slim
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/
COPY public/ ./public/
COPY data/ ./data/
COPY scripts/ ./scripts/
RUN mkdir -p /app/data /app/backups && chown -R node:node /app
ENV DB_DIR=/app/data NODE_ENV=production PORT=3458 HOST=0.0.0.0
USER node
EXPOSE 3458
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3458)+'/api/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"
STOPSIGNAL SIGTERM
CMD ["node", "src/server.js"]

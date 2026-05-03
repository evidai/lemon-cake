# Dockerfile for lemon-cake-mcp (Glama deploy + general container use)
#
# Build:  docker build -t lemon-cake-mcp .
# Run:    docker run --rm -i \
#           -e LEMONCAKE_BUYER_JWT=eyJhbGci... \
#           lemon-cake-mcp
#
# This image is also used by Glama (https://glama.ai) to score and
# preview the MCP server in-browser via the Inspector.

FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifest first for better layer caching
COPY package.json package-lock.json* ./
RUN npm ci --include=dev

# Copy sources and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime stage ----
FROM node:22-alpine

WORKDIR /app

# Production deps only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Built JS from builder stage
COPY --from=builder /app/dist ./dist

# Drop to non-root for security
RUN addgroup -S mcp && adduser -S mcp -G mcp \
    && chown -R mcp:mcp /app
USER mcp

# MCP servers communicate over stdio — no port to expose.
# The MCP client (Claude Desktop, Cursor, Cline, etc.) launches this
# container and pipes JSON-RPC over stdin/stdout.

ENTRYPOINT ["node", "dist/index.js"]

FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev && npm install --save-dev typescript tsx @types/node

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
COPY tsconfig.json ./
COPY src ./src/
RUN npx tsc -p tsconfig.json

# Remove dev dependencies
RUN npm prune --omit=dev

# Production image
FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/prisma ./prisma
COPY package*.json ./

# Run Prisma migrations on start then launch server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]

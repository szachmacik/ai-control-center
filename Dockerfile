FROM node:22-alpine AS base
WORKDIR /app
RUN npm install -g pnpm

# Install ALL dependencies (including devDeps for build)
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
# Do NOT set NODE_ENV=production here - we need devDependencies for build
RUN pnpm install --frozen-lockfile

# Build the application
FROM deps AS builder
COPY . .
# Build frontend and backend
RUN pnpm run build

# Production image - only runtime deps
FROM node:22-alpine AS runner
WORKDIR /app
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
# Install only production dependencies
RUN NODE_ENV=production pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/shared ./shared

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]

FROM node:22-alpine AS base
WORKDIR /app
RUN npm install -g pnpm

# Install ALL dependencies (including devDeps needed for both build and runtime vite imports)
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN pnpm install --frozen-lockfile

# Build the application
FROM deps AS builder
COPY . .
RUN pnpm run build

# Production image - keep all deps since server imports vite at runtime
FROM node:22-alpine AS runner
WORKDIR /app
RUN npm install -g pnpm

# Copy package files and install all deps (vite is imported even in production)
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN pnpm install --frozen-lockfile

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/shared ./shared

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]

# --- Build stage ---
FROM node:22-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.9.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build

# --- Runtime stage ---
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g pnpm@11.9.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
RUN pnpm install --production --frozen-lockfile
COPY --from=build /app/dist ./dist
USER node

# Render sets $PORT for you; the app reads it at runtime.
EXPOSE 3000
CMD ["node", "dist/index.js"]


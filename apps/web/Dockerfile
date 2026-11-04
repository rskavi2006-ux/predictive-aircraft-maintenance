# Multi-stage Dockerfile for @aeroguard/web using Node 22 LTS
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

RUN npm ci
RUN npm run build --workspace=@aeroguard/shared
RUN npm run build --workspace=@aeroguard/web

# Development / Preview Stage
FROM node:22-alpine AS runner

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

RUN npm ci
RUN npm run build --workspace=@aeroguard/shared

USER node

EXPOSE 5173

CMD ["npm", "run", "dev", "--workspace=@aeroguard/web", "--", "--host", "0.0.0.0"]

# --- Stage 1: Install dependencies + generate Prisma client ---
FROM node:24-alpine AS deps

WORKDIR /app

COPY package.json yarn.lock ./
COPY prisma ./prisma/

RUN yarn install --frozen-lockfile --production=false \
 && npx prisma generate --config prisma/prisma.config.ts \
 && yarn cache clean

# --- Stage 2: Build TypeScript ---
FROM node:24-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY tsconfig.json package.json ./
COPY src ./src

RUN npx tsc -p tsconfig.json || true \
 && test -f dist/bot/main.js && test -f dist/sub/main.js \
 && find dist -name '*.d.ts' -o -name '*.d.ts.map' -o -name '*.js.map' | xargs rm -f

# --- Stage 3: Production dependencies only ---
FROM node:24-alpine AS prod-deps

WORKDIR /app

COPY package.json yarn.lock ./
COPY prisma ./prisma/

RUN yarn install --frozen-lockfile --production \
 && npx prisma generate --config prisma/prisma.config.ts \
 && yarn cache clean

# --- Stage 4: Final minimal image ---
FROM node:24-alpine

WORKDIR /app

RUN addgroup -S doves && adduser -S doves -G doves

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY prisma ./prisma/
COPY package.json ./

USER doves

ENV NODE_ENV=production

CMD ["node", "dist/bot/main.js"]

# SOONOT — one Node process serving the API, the sockets and the built client.
# Multi-stage: build the client, then run the host with tsx (spec §12).

FROM node:20-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 is a native module — build tools for the (rare) source build.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY master/package.json master/
COPY bingo/package.json bingo/
COPY yutnori/package.json yutnori/
RUN npm ci
COPY . .
RUN npm run build            # builds all four client surfaces into master/dist/client

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/soonot.db
# node_modules (incl. the compiled better-sqlite3 + tsx) and the built client.
COPY --from=build /app /app
RUN mkdir -p /data
EXPOSE 3000
# `npm start` = tsx master/src/index.server.ts (spec §12).
CMD ["npm", "start"]

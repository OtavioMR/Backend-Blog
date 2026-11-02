FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY nest-cli.json tsconfig*.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir -p uploads && chown node:node uploads
USER node
EXPOSE 3000
CMD ["sh", "-c", "node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js && exec node dist/main.js"]

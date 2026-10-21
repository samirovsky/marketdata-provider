# One image, two Fly apps: REST + GraphQL (fly.toml) and gRPC (fly.grpc.toml).
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
COPY openapi ./openapi
COPY graphql ./graphql
COPY proto ./proto
USER node
CMD ["node", "--experimental-strip-types", "src/server.ts"]

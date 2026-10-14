# Build from the repository root. The lockfile's native-package overrides
# currently support Linux x86-64/glibc only (not ARM or Alpine).
FROM node:24-bookworm-slim AS build
ARG TARGETARCH=amd64
RUN test "$TARGETARCH" = amd64 && test "$(uname -m)" = x86_64
RUN npm install --global pnpm@10.26.1
WORKDIR /build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig*.json ./
COPY lib/api-zod ./lib/api-zod
COPY lib/api-client-react ./lib/api-client-react
COPY lib/db ./lib/db
COPY artifacts/api-server ./artifacts/api-server
COPY artifacts/bitcoin-vault ./artifacts/bitcoin-vault
RUN pnpm install --frozen-lockfile --filter @workspace/api-server... --filter @workspace/bitcoin-vault...
RUN pnpm --filter @workspace/api-server run build
RUN NODE_ENV=production PORT=3000 BASE_PATH=/ pnpm --filter @workspace/bitcoin-vault run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000 BITCOIN_NETWORK=signet \
    VAULT_STATIC_DIR=/app/public
WORKDIR /app
COPY --from=build --chown=node:node /build/artifacts/api-server/dist ./dist
COPY --from=build --chown=node:node /build/artifacts/bitcoin-vault/dist/public ./public
RUN rm -f /app/public/offline-keygen.html /app/public/signet-setup.html
COPY --chown=node:node deploy/app-entrypoint.mjs deploy/app-config.mjs ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/healthz',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "app-entrypoint.mjs"]

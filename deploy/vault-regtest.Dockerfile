# Disposable regression environment, never a production service.
# Build Core first:
# docker build -f deploy/bitcoin-mainnet.Dockerfile -t vault-core-regtest:local .
# docker build -f deploy/vault-regtest.Dockerfile -t vault-regtest:local .
# docker run --rm --network none vault-regtest:local
ARG BITCOIN_TEST_IMAGE=vault-core-regtest:local
FROM ${BITCOIN_TEST_IMAGE} AS core
FROM golang:1.26.9-bookworm
COPY --from=core /usr/local/bin/bitcoind /usr/local/bin/bitcoin-cli /usr/local/bin/
WORKDIR /src
COPY services/vault-engine/ ./
ENV VAULT_REGTEST=1 CGO_ENABLED=1
# Tests use disposable regtest wallets and loopback RPC, not production volumes.
CMD ["sh", "-c", "test \"$(find . -name '*_test.go' | wc -l)\" -gt 0 && go test -race -count=1 ./... && go vet ./..."]

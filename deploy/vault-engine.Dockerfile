# Separate private signer image; build context is the repository root.
FROM golang:1.26.9-bookworm AS build
WORKDIR /src
COPY services/vault-engine/go.mod ./
COPY services/vault-engine/*.go ./
RUN CGO_ENABLED=0 go build -trimpath -o /vault-engine .

FROM debian:bookworm-slim
RUN groupadd --gid 10001 vault && useradd --uid 10001 --gid vault --no-create-home vault \
    && mkdir -p /var/lib/personal-vault && chown vault:vault /var/lib/personal-vault
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /vault-engine /usr/local/bin/vault-engine
ENV BITCOIN_NETWORK=signet ENGINE_DATA_DIR=/var/lib/personal-vault ENGINE_LISTEN=0.0.0.0:9090
USER 10001:10001
# EXPOSE is container-only documentation. NEVER publish this port to the host.
EXPOSE 9090
ENTRYPOINT ["/usr/local/bin/vault-engine"]

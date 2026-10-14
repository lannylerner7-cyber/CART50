# Maintenance release verified against the official 29.4 SHA256SUMS.
FROM debian:bookworm-slim AS download
ARG TARGETARCH=amd64
RUN test "$TARGETARCH" = amd64 && test "$(uname -m)" = x86_64
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /download
RUN curl --fail --show-error --location --proto '=https' --tlsv1.2 \
    https://bitcoincore.org/bin/bitcoin-core-29.4/bitcoin-29.4-x86_64-linux-gnu.tar.gz -o core.tar.gz \
    && echo 'e15bff6f6d21a315c4af25d2e8ae933a22bd51e924e0e90ab0474e1e11516331  core.tar.gz' | sha256sum --check --strict \
    && tar -xzf core.tar.gz
FROM debian:bookworm-slim
RUN groupadd --gid 10001 bitcoin && useradd --uid 10001 --gid bitcoin --no-create-home bitcoin \
    && mkdir -p /var/lib/bitcoin /run/bitcoin \
    && chown bitcoin:bitcoin /var/lib/bitcoin /run/bitcoin \
    && chmod 700 /var/lib/bitcoin /run/bitcoin
COPY --from=download /download/bitcoin-29.4/bin/bitcoind /download/bitcoin-29.4/bin/bitcoin-cli /usr/local/bin/
COPY deploy/bitcoin-mainnet.conf /etc/bitcoin/bitcoin.conf
USER 10001:10001
STOPSIGNAL SIGTERM
ENTRYPOINT ["bitcoind", "-conf=/etc/bitcoin/bitcoin.conf"]

# Test-network baseline matching the existing Core 29.0 regression suite.
# Source/checksum: https://bitcoincore.org/bin/bitcoin-core-29.0/SHA256SUMS
FROM debian:bookworm-slim AS download
ARG TARGETARCH=amd64
RUN test "$TARGETARCH" = amd64 && test "$(uname -m)" = x86_64
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /download
RUN curl --fail --show-error --location --proto '=https' --tlsv1.2 \
      https://bitcoincore.org/bin/bitcoin-core-29.0/bitcoin-29.0-x86_64-linux-gnu.tar.gz -o core.tar.gz \
    && echo 'a681e4f6ce524c338a105f214613605bac6c33d58c31dc5135bbc02bc458bb6c  core.tar.gz' | sha256sum --check --strict \
    && tar -xzf core.tar.gz

FROM debian:bookworm-slim
RUN groupadd --gid 10001 bitcoin && useradd --uid 10001 --gid bitcoin --no-create-home bitcoin \
    && mkdir -p /var/lib/bitcoin /run/bitcoin \
    && chown bitcoin:bitcoin /var/lib/bitcoin /run/bitcoin \
    && chmod 700 /var/lib/bitcoin /run/bitcoin
COPY --from=download /download/bitcoin-29.0/bin/bitcoind /download/bitcoin-29.0/bin/bitcoin-cli /usr/local/bin/
COPY deploy/bitcoin-signet.conf /etc/bitcoin/bitcoin.conf
USER 10001:10001
STOPSIGNAL SIGTERM
ENTRYPOINT ["bitcoind", "-conf=/etc/bitcoin/bitcoin.conf"]

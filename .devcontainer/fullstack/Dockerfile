FROM mcr.microsoft.com/devcontainers/javascript-node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ git ca-certificates curl pkg-config libssl-dev \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

ENV RUSTUP_HOME=/usr/local/rustup \
  CARGO_HOME=/usr/local/cargo \
  PATH=/usr/local/cargo/bin:/usr/local/solana/bin:$PATH

RUN curl https://sh.rustup.rs -sSf | sh -s -- -y --profile minimal --default-toolchain stable \
  && chmod -R a+w /usr/local/cargo /usr/local/rustup

RUN mkdir -p /usr/local/solana \
  && curl -L https://github.com/solana-labs/solana/releases/download/v1.18.18/solana-release-x86_64-unknown-linux-gnu.tar.bz2 -o /tmp/solana.tar.bz2 \
  && tar -xjf /tmp/solana.tar.bz2 -C /usr/local/solana --strip-components=1 \
  && rm -f /tmp/solana.tar.bz2

RUN npm install -g @coral-xyz/anchor-cli@0.29.0

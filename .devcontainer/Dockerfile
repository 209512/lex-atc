FROM mcr.microsoft.com/devcontainers/javascript-node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable


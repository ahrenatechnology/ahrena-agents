FROM node:20-slim

# python3 (route-review.py) e git (diff/show) são usados pelo roteamento.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependências primeiro (camada cacheável).
COPY package.json package-lock.json ./
RUN npm ci

# Código do runtime.
COPY tsconfig.json ./
COPY bin ./bin
COPY src ./src

# Framework pinado, BAKED na imagem — substitui o submodule na distribuição.
# O cliente não precisa de submodule, Node, nem conhecer nosso stack.
COPY ahrena/ahrena-framework ./ahrena/ahrena-framework

# A CLI roda contra o checkout do cliente (cwd montado pelo pipeline).
# Os argumentos (--pr, --changed) vêm do wrapper/pipeline.
ENTRYPOINT ["node", "/app/bin/cli.mjs"]

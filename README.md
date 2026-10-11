# ahrena-agents

**Stack de agentes de desenvolvimento da Ahrena** — um squad de agentes de dev no
seu pipeline, orquestrado com LangGraph + Claude Agent SDK. O **primeiro agente do
squad** é o **code review** (Argos): revisa um pull request contra as regras de
engenharia do
[`ahrena-framework`](https://github.com/ahrenatechnology/ahrena-framework).

A review é **sobre como o código foi implementado** — estática, de leitura. Ela
**não** sobe a aplicação, não builda imagem, não roda testes. Isso é do pipeline;
a review só consome os resultados. O Argos roda **read-only** (lê o código, julga
contra as regras) e os prompts/skills vêm do framework — nada é duplicado aqui.

## Pré-requisito: token do Claude

```bash
claude setup-token        # gera um token OAuth de longa duração
```
Guarde o valor em `CLAUDE_CODE_OAUTH_TOKEN` (ou use `ANTHROPIC_API_KEY`).

---

## Três formas de rodar

Todas chamam o mesmo núcleo com os mesmos argumentos:
`--pr <n> --changed <base>...<head>`.

### 1. npx (pacote publicado)

Pacote no GitHub Packages: `@ahrenatechnology/ahrena-agents`. O framework já vai
**baked** no pacote (sem submodule). O GitHub Packages npm exige autenticação para
instalar (mesmo público), então configure o registry do escopo uma vez:

```bash
# ~/.npmrc
@ahrenatechnology:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<github-token-com-read:packages>
```
```bash
export CLAUDE_CODE_OAUTH_TOKEN="<seu-token-claude>"
npx @ahrenatechnology/ahrena-agents --pr 1 --changed "origin/main...HEAD"
```

Ou a partir de um clone (dev), com o framework via submodule:
```bash
git clone --recurse-submodules https://github.com/ahrenatechnology/ahrena-agents
cd ahrena-agents && npm install
npx ahrena-review --pr 1 --changed "origin/main...HEAD"
```

### 2. Nuvem, com Docker (imagem self-contained)

A imagem leva Node, as deps e o framework **baked** (pinado) — o host não precisa
de nada além de Docker.

```bash
# build
docker build -t ghcr.io/ahrenatechnology/ahrena-agents:v1 .

# rodar contra um checkout (montado em /repo)
docker run --rm \
  -e CLAUDE_CODE_OAUTH_TOKEN="$CLAUDE_CODE_OAUTH_TOKEN" \
  -v "$PWD:/repo" -w /repo \
  ghcr.io/ahrenatechnology/ahrena-agents:v1 \
  --pr 1 --changed "origin/main...HEAD"

# publicar (para rodar como job/function na nuvem: Cloud Run Job, ECS, Lambda-container…)
docker push ghcr.io/ahrenatechnology/ahrena-agents:v1
```

Na nuvem, é um **job run-to-completion**: recebe o token por env e os SHAs por
argumento, revisa e sai.

### 3. Pipeline, com GitHub Action

No repositório do cliente, um workflow de 3 linhas úteis:

```yaml
name: Code Review
on: pull_request
jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # precisa de base e head para o diff
      - uses: ahrenatechnology/ahrena-agents@v1
        with:
          claude-token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
```

A Action ([`action.yml`](action.yml)) é um wrapper Docker que roda a imagem
publicada e deriva `--pr`/`--changed` do contexto do PR. O cliente só precisa do
secret `CLAUDE_CODE_OAUTH_TOKEN`.

> A Action aponta para `ghcr.io/ahrenatechnology/ahrena-agents:v1` — **a imagem
> precisa estar publicada** (passo 2) e o pacote acessível para o cliente puxar.

---

## Configuração (env)

| Variável | Obrigatória | O quê |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | sim (ou `ANTHROPIC_API_KEY`) | token do Claude Code |
| `GH_TOKEN` | no CI | token do GitHub (usado pelo `gh`, passo futuro de publicar o verdict) |

CLI: `ahrena-review --pr <n> [--changed <base>...<head>]`.

---

## Estrutura (por processo)

```
src/
├── cli.ts                 # entrada; cospe prévias por etapa
├── shared/                # genérico, cross-processo
│   ├── progress.ts        # spinner
│   └── paths.ts           # caminhos do framework
└── code-review/           # o processo
    ├── graph.ts           # intake → argos → (decisor|erodos|fim)
    ├── state.ts · router.ts · verdict.ts · preview.ts · agent.ts
    └── nodes/             # um nó por arquivo
        └── intake · argos · erodos · decisor
```

Processo novo = pasta nova em `src/`.

## Framework: submodule no dev, baked na distribuição

Em desenvolvimento, o `ahrena-framework` entra como **submodule** pinado em
`ahrena/ahrena-framework` (fonte única dos prompts/skills; nada é copiado para o
`src/`). Na **distribuição** (Docker), o conteúdo do framework é **copiado para
dentro da imagem** no build — o cliente não lida com submodule.

## Estado atual

- ✅ Argos real revisando read-only (mesmo prompt/skills do dev).
- ✅ Prévias por etapa + spinner; roteamento via `route-review.py` do framework.
- ⬜ Publicar o verdict no PR, Erodos (fix) e Decisor (gate de merge).

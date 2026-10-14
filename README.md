# ahrena-agents

**Stack de agentes de desenvolvimento da Ahrena** — um squad de agentes que
trabalham dentro do seu pipeline de entrega, cada um assumindo uma etapa do ciclo
de desenvolvimento. Serve a qualquer time que precisa escalar seu pipeline de
desenvolvimento sem escalar o time na mesma proporção: o trabalho que antes
dependia de uma pessoa sênior em cada etapa passa a rodar de forma consistente, em
toda entrega, sem gargalo humano.

O **primeiro agente do squad** é o **Argos**, de code review. Estudos apontam que
times gastam de 3 a 6 horas por semana, por desenvolvedor, em code review: um
estudo de 2024 reporta **3,2 h/semana no Google** e **6,4 h/semana em projetos
open source** ([Automated Code Review In Practice](https://arxiv.org/html/2412.18531v2)),
e a [Codacy](https://blog.codacy.com/10-facts-about-code-reviews-and-quality)
aponta ~5 h.
E, mesmo com essas horas investidas, uma revisão frágil ou inconsistente deixa
passar código que sai caro depois: um estudo de 2022 com 39 bases de produção
mostrou que código de baixa qualidade concentra **15× mais defeitos** e exige
**124% mais tempo** para resolver cada problema
([Tornhill & Borg](https://arxiv.org/pdf/2203.04374)). O Argos assume esse
trabalho: a cada pull request, avalia o código contra um conjunto de regras de
engenharia — por padrão as do
[`ahrena-framework`](https://github.com/ahrenatechnology/ahrena-framework) — e
devolve um parecer com o mesmo critério, aplicado da mesma forma, em toda entrega.

O Argos revisa **como o código foi escrito**: é uma análise de leitura, que não
sobe a aplicação, não builda imagem nem roda testes — isso continua sendo papel do
pipeline, e a review apenas consome esses resultados. Ele opera em **modo
read-only** (lê e julga, nunca altera o código) e herda prompts e regras direto do
framework, mantendo uma única fonte de verdade entre todos os agentes.

Orquestração em LangGraph + Claude Agent SDK.

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
publicada e deriva `--pr`/`--changed` do contexto do PR. A Action **só revisa e
comenta** — o gate e o auto-merge ficam no workflow. Para o fluxo completo
(revisar + comentar + gate + fechar sozinho) **sem copiar YAML**, use o pipeline
herdável abaixo.

> A Action aponta para `ghcr.io/ahrenatechnology/ahrena-agents:v1` — **a imagem
> precisa estar publicada** (passo 2) e o pacote acessível para o cliente puxar.

### 4. Pipeline herdável (reusable workflow) — o jeito "produto"

Para um cliente com dezenas de repositórios, não se copia YAML repo a repo. O
Ahrena publica um **reusable workflow** ([`.github/workflows/review.yml`](.github/workflows/review.yml))
com o fluxo inteiro — revisar, comentar, gate e **auto-merge**. Cada repositório
consome em ~5 linhas (veja [`examples/consumer-code-review.yml`](examples/consumer-code-review.yml)):

```yaml
name: Code Review
on:
  pull_request:
    types: [opened, synchronize, reopened]
jobs:
  review:
    uses: ahrenatechnology/ahrena-agents/.github/workflows/review.yml@v1
    permissions: { contents: write, pull-requests: write }
    secrets:
      claude-token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
      cloudflare-account-id: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      cloudflare-api-token: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

Escala de três formas, da mais explícita à mais automática:
- **Caller por repo:** cada repo tem o arquivo de ~5 linhas acima.
- **Repo DevOps central:** um repositório re-exporta/padroniza o caller, e os
  demais herdam dele.
- **Required workflow da org:** aplica o caller a todos os repos da organização
  **sem arquivo nenhum** por repo.

Ajustes (todos opcionais) vão em `with:` — `auto-merge-min`, `regression-max`,
`max-warnings`, `argos-model`, `decisor-provider` (`cloudflare`|`bedrock`),
`clef-model`/`bedrock-model`, e `gate` (`decisor` padrão, ou `verdict` para
fechar só com o approve do Argos, sem Clef).

---

## Configuração

### Credenciais (obrigatórias)

| Variável | Onde | O quê |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | env / Action `claude-token` | token do Claude Code (ou `ANTHROPIC_API_KEY`). **Sempre.** |
| `CLOUDFLARE_ACCOUNT_ID` | env / Action `cloudflare-account-id` | account id da Cloudflare — **para o Decisor (Clef)** |
| `CLOUDFLARE_API_TOKEN` | env / Action `cloudflare-api-token` | API token da Cloudflare, escopo **Workers AI** — para o Decisor |
| `GH_TOKEN` | no CI (automático na Action) | token do GitHub, usado pelo `gh` |

> Sem as credenciais da Cloudflare o Argos ainda revisa, mas o Decisor degrada
> para `hold_for_human` (não aprova o merge sozinho).

### Parâmetros ajustáveis

Todo valor/intervalo tem **default da plataforma** (o valor que a gente já
testou) e pode ser **sobrescrito** pelo cliente. **Precedência:** flag de CLI →
variável de ambiente → default. Na GitHub Action, cada um é um `input`.

| Flag (CLI/npx) | Env (CI/Docker) | Action input | Default | O que controla |
|---|---|---|---|---|
| `--model` | `ARGOS_MODEL` | `argos-model` | `claude-opus-4-8` | modelo do **Argos** (quem revisa) |
| `--clef-model` | `CLEF_MODEL` | `clef-model` | `clef` | modelo do **Decisor** (ex.: `clef-flash`, mais rápido) |
| `--auto-merge-min` | `DECISOR_AUTO_MERGE_MIN` | `auto-merge-min` | `0.85` | prob. **mínima** de `auto_merge` p/ fechar sozinho (0–1) |
| `--regression-max` | `DECISOR_REGRESSION_MAX` | `regression-max` | `0.15` | prob. **máxima** de regressão tolerada (0–1) |
| `--max-warnings` | `DECISOR_MAX_WARNINGS` | `max-warnings` | `2` | máx. de **warnings** que ainda vai ao Clef; acima disso o **pré-gate** delega (ex.: `2` ⇒ 3+ warnings = delega) |

Os dois limiares de probabilidade são **presos em [0,1]**; valor vazio ou
inválido cai no default. O `--max-warnings` é a contagem a partir dos **achados
estruturados** que o Argos entrega.

**Exemplos**

```bash
# CLI: afrouxa o gate e usa o modelo rápido do Clef
ahrena-review --pr 12 --changed "origin/main...HEAD" \
  --clef-model clef-flash --auto-merge-min 0.80 --max-warnings 3
```

```yaml
# GitHub Action: só os inputs que você quer mudar; o resto fica no default
- uses: ahrenatechnology/ahrena-agents@v1
  with:
    claude-token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
    cloudflare-account-id: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}
    cloudflare-api-token: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    auto-merge-min: "0.90"   # mais conservador que o default
    max-warnings: "1"        # 2+ warnings já delega
```

Forma completa da CLI:

```
ahrena-review --pr <n> [--changed <base>...<head>]
  [--model <id>] [--clef-model <id>]
  [--auto-merge-min <0–1>] [--regression-max <0–1>] [--max-warnings <n>]
```

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

- ✅ Argos revisa read-only (mesmo prompt/skills do dev); roteia internamente.
- ✅ Prévias por etapa + spinner.
- ✅ Verdict publicado no PR como `argos[bot]`.
- ✅ Decisor (Clef/Workers AI) no gate de merge: `approve` **e** `auto_merge`
  (hoje `≥0.85` e regressão `≤0.15`) → auto-merge (squash). Os pesos vão no
  comentário (calibração manual); Clef fora/sem credencial → segura p/ humano.
- ⬜ Erodos (fix no mesmo flow).

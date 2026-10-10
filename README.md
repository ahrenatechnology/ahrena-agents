# ahrena-agents

Runtime de orquestração dos agentes de code review da Ahrena, em LangGraph (TypeScript).
Consome os agentes do `ahrena-framework`; não os reescreve.

> **Status:** scaffold inicial. O grafo roda `intake → argos → fim`, com o nó do
> Argos ainda como *stub* (não invoca o agente real nem toca em nenhuma plataforma).

## Rodar

```bash
npm install
npm run dev -- --pr 1
```

## Próximos passos

- Ligar o nó `argos` ao agente real do `ahrena-framework` (Claude Agent SDK).
- Erodos (aplica fixes) e o loop review↔fix com guard.
- Decisor (gate de merge: determinístico + probabilístico).
- Revisores especialistas em paralelo.

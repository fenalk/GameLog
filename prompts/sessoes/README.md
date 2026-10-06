# Registro de sessões com agentes de IA

> Padrão de registro definido na [SPEC de arquitetura](../../SPEC/2026-10-05-arquitetura.md) e
> no [plano geral](../../.sdd/plan.md) (TC.03): ao final de **cada** sessão de conversa com um
> agente de IA, o diálogo completo é registrado nesta pasta.

## Formato do nome do arquivo

```
AAAA-MM-DD-HHMM-<ferramenta>.md
```

- `AAAA-MM-DD` — data da sessão;
- `HHMM` — horário de início (24h, com zeros à esquerda);
- `<ferramenta>` — nome do agente de IA utilizado, em `kebab-case`
  (ex.: `copilot`, `chatgpt`, `claude`, `gemini`).

Exemplos já registrados: [`2026-10-05-2027-chatgpt.md`](./2026-10-05-2027-chatgpt.md) e
[`2026-10-05-2123-copilot.md`](./2026-10-05-2123-copilot.md).

## Conteúdo do registro

O arquivo deve conter o diálogo da sessão (prompts e respostas), de forma que uma pessoa
consiga reconstruir o que foi discutido e decidido. Estrutura recomendada:

1. **Contexto e objetivo** — o que motivou a sessão (etapa, funcionalidade, SPEC).
2. **Sessão** — o diálogo: prompts enviados e respostas/artefatos produzidos.
3. **Decisões** — decisões tomadas durante a sessão e suas justificativas.
4. **Arquivos alterados** — lista dos arquivos criados/modificados.
5. **Próximos passos** — pendências e o que cabe à próxima sessão.

O registro faz parte dos critérios de conclusão das etapas (ver seção 7 do
[plano geral](../../.sdd/plan.md)) e é condição de encerramento de cada sessão.

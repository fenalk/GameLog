# Convenções de Git e GitHub — GameLog

> Documento de apoio da Etapa 0 (Fundação). Define como o repositório é versionado e como as
> contribuições chegam à branch principal, conforme a seção 3.5 e o critério de aceite da
> [SPEC de arquitetura](../SPEC/2026-10-05-arquitetura.md).

---

## 1. Branches

- `main` é a **branch principal e protegida** — não recebe commits diretos.
- Todo trabalho acontece em branches curtas, criadas a partir de `main` atualizada:

| Prefixo | Uso | Exemplo |
| --- | --- | --- |
| `feat/` | nova funcionalidade de uma etapa (F1–F15) | `feat/f1-cadastro-login` |
| `fix/` | correção de defeito | `fix/avaliacao-duplicada` |
| `docs/` | documentação (SPECs, `docs/`, README) | `docs/spec-f3-consulta-jogos` |
| `refactor/` | refatoração sem mudança de comportamento | `refactor/modulo-catalogo` |
| `test/` | testes | `test/f9-avaliacao` |
| `chore/` | manutenção, dependências, configuração | `chore/atualiza-dependencias` |
| `ci/` | integração contínua | `ci/cache-do-npm` |

- Nomes em `kebab-case`, curtos e descritivos, preferencialmente com o identificador da
  funcionalidade (`f1`…`f15`).
- A branch é removida após o merge do pull request.

## 2. Conventional Commits

As mensagens seguem o padrão [Conventional Commits](https://www.conventionalcommits.org/):

```
<tipo>(<escopo opcional>): <descrição>

[corpo opcional]

[rodapé(s) opcional(is)]
```

- **Tipos:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`,
  `chore`, `revert`.
- **Escopo:** opcional e curto, indicando a área (`api`, `web`, `shared`, `db`, `ci`, `spec`).
- **Descrição:** imperativa, em português, minúscula, sem ponto final, até ~72 caracteres.
- **Corpo:** explica o *porquê* da mudança quando a descrição não for suficiente.
- **Mudança incompatível:** indicar `!` na descrição e/ou `BREAKING CHANGE:` no rodapé.

Exemplos:

```
feat(api): adiciona endpoint de cadastro de usuário
fix(web): corrige estado de carregamento da lista de jogos
docs(spec): detalha critérios de aceite de F3
chore(db): adiciona migration de gêneros
```

## 3. Pull requests

1. Atualize a `main` e crie a branch de trabalho (ver seção 1).
2. Faça commits pequenos e no padrão Conventional Commits.
3. Abra o pull request para `main` com:
   - **título** no padrão Conventional Commits;
   - **descrição** com contexto/motivação, o que mudou, como testar e checklist da SPEC;
   - **referência** à SPEC e à tarefa correspondente (ex.: `T1.02`, `F1`).
4. O PR só pode ser mesclado com:
   - **CI verde** (lint, formatação, tipos, build, migrations, testes de integração e e2e);
   - **pelo menos 1 revisão aprovada**;
   - comentários de revisão resolvidos.
5. Estratégia de merge: **squash merge** (histórico linear na `main`), com a mensagem final no
   padrão Conventional Commits. A branch de trabalho é excluída em seguida.

## 4. Proteção da branch principal (`main`)

Configuração de proteção pretendida para a `main`:

- exigir pull request antes do merge (sem pushes diretos);
- exigir 1 aprovação de revisão e nova aprovação após novos commits;
- exigir que os status checks do CI (`Lint, tipos, testes e build`) estejam verdes;
- exigir resolução de todas as conversas;
- impedir force push e exclusão da branch;
- exigir histórico linear (aplicado junto com o squash merge).

> **Situação atual:** o repositório é privado no plano **GitHub Free**, que não oferece proteção
> de branch nem rulesets (a API responde `403 — Upgrade to GitHub Pro or make this repository
> public to enable this feature`). Até que o repositório seja público ou o plano seja Pro,
> a convenção vale como acordo da dupla. Com a permissão disponível, aplicar com o comando
> abaixo (e manter a contagem de aprovações em `1` quando houver dois colaboradores).

Aplicação via GitHub CLI:

```bash
gh api -X PUT repos/fenalk/GameLog/branches/main/protection \
  -H 'Accept: application/vnd.github+json' \
  -f 'required_status_checks[strict]=true' \
  -f 'required_status_checks[contexts][]=Lint, tipos, testes e build' \
  -f 'enforce_admins=true' \
  -f 'required_pull_request_reviews[required_approving_review_count]=1' \
  -f 'restrictions=' \
  -F 'allow_force_pushes=false' \
  -F 'allow_deletions=false'
```

> Observação: a proteção de branch é configurada no GitHub (não é versionada junto com o
> código) e exige permissão de administrador no repositório.

## 5. Fluxo resumido

```bash
git switch main && git pull
git switch -c feat/f1-cadastro-login
# ... desenvolvimento guiado pela SPEC ...
git add . && git commit -m "feat(api): adiciona endpoint de cadastro"
git push -u origin feat/f1-cadastro-login
gh pr create --fill   # CI roda automaticamente no PR
```

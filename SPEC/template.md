**Projeto:** GameLog · **Etapa:** `<n>` — `<nome da etapa>` · **Documento:** SPEC de `<funcionalidade>`
**Fontes:** [visao_geral.md](../docs/visao_geral.md) · [plan.md](../.sdd/plan.md) · [task.md](../.sdd/task.md) · [SPEC de arquitetura](./2026-10-05-arquitetura.md)

---

# O que e Por quê

`<Problema/necessidade que a funcionalidade resolve e por que ela existe nesta etapa.>`

`<Funcionalidade(s) F<n> cobertas, persona(s) atendida(s) — Visitante, Jogador e/ou Administrador
— e relação com as demais etapas.>`

## 1. Alinhamento com a visão geral

`<Como esta SPEC atende ao que a visão geral e o plano definem para a funcionalidade, sem
contrariar a SPEC de arquitetura.>`

## 2. Escopo

`<O que está incluído nesta SPEC.>`

- `<item incluído 1>`
- `<item incluído 2>`

## 3. Requisitos funcionais

| # | Requisito | Descrição |
| --- | --- | --- |
| RF1 | `<nome>` | `<descrição verificável do requisito>` |

## 4. Requisitos não funcionais

`<Desempenho, segurança, acessibilidade, usabilidade e demais restrições aplicáveis.>`

## 5. Contratos da API REST

`<Endpoints, métodos, payloads e respostas, descritos pelos schemas Zod de packages/shared.
Incluir códigos de erro conforme o formato padrão de erro da API.>`

| Método | Rota | Descrição | Papel exigido |
| --- | --- | --- | --- |
| `GET` | `/api/v1/...` | `<descrição>` | `<Visitante/Jogador/Administrador>` |

## 6. Modelo de dados

`<Tabelas, campos e relacionamentos necessários, a serem criados por migration do Prisma.
Deixar explícitas as restrições de integridade e os índices relevantes.>`

## 7. Regras de negócio

| # | Regra | Descrição |
| --- | --- | --- |
| RN1 | `<nome>` | `<regra>` |

## 8. Critério de aceite

`<Checklist verificável que define a funcionalidade como concluída.>`

- [ ] `<critério 1>`
- [ ] `<critério 2>`
- [ ] `<testes automatizados cobrindo os critérios acima>`

## 9. Fora do Escopo

- `<item explicitamente não contemplado por esta SPEC>`

## 10. Referências

- `<links para documentação, decisões ou SPECs relacionadas>`

# agents.md — Agentic Board

Guia para agentes que investigam ou trabalham neste repositório e nos repositórios que o board lê. Specs completas em [`specs/`](specs/00-visao-geral.md); este arquivo é o resumo operacional.

## O que é

Board kanban local. As tasks são arquivos `.md` com frontmatter YAML; o board as lê, mostra como post-its por status e, quando o humano arrasta um card, reescreve só a linha `status:` do arquivo. O disco é a fonte da verdade: não há banco de dados.

## Onde ficam as tasks

Qualquer `.md` dentro de uma pasta chamada `specs` ou `tasks` (sem diferenciar maiúsculas), em qualquer profundidade do repositório aberto. São ignorados `node_modules`, `.git`, `dist`, `build` e pastas iniciadas por ponto.

Um `.md` sem frontmatter (documentação comum) não é task e é ignorado em silêncio. Um `.md` que **tem** frontmatter mas está inválido não vira card e aparece no aviso de ignorados, com o motivo.

## Modelo de task

```markdown
---
id: T-001
title: Definir formato do header das tasks
status: Backlog
---

# Corpo da task

Qualquer markdown. O board não interpreta o corpo.
```

- O frontmatter começa na **primeira linha** com `---` e termina no próximo `---` sozinho em uma linha.
- Obrigatórios: `id`, `title`, `status`. Strings não vazias (após trim).
- `id` é único no repositório. Em duplicata, vale o primeiro arquivo (ordem alfabética do caminho) e os demais são ignorados com aviso.
- Campos extras (`priority`, `effort`, `assignee`…) são aceitos e **preservados**; o board os ignora.
- Valores com `:` ou `#` precisam de aspas (regra normal de YAML).

Motivos de invalidade que aparecem no aviso: `frontmatter com YAML inválido`, `frontmatter sem marcação de fim (---)`, `campo obrigatório ausente: <campo>`, `id duplicado (já usado em <arquivo>)`.

## Status e colunas

O `status` é texto livre. O board cria **uma coluna por status distinto**. A comparação ignora maiúsculas, acentos e espaços repetidos: `Em execução`, `em execucao` e ` EM  EXECUÇÃO ` são a mesma coluna.

Quais valores usar:

1. Os que já existem no repositório. Antes de escolher, liste os status em uso (por exemplo `grep -rh '^status:' <pastas specs/tasks>`) ou consulte `GET /api/board`, campo `columns[].name`.
2. As colunas criadas à mão ficam em `specs/.board.json` do repo (`{ "version": 1, "columns": ["Backlog", "Concluído"] }`), inclusive as vazias. Use o nome exibido de lá.
3. Um status novo cria uma coluna nova sozinha. Só faça isso se a mudança for intencional; o padrão é reaproveitar uma coluna existente.

Ao mover pelo board, o valor gravado é exatamente o nome exibido da coluna de destino.

## Como atualizar o status de uma task

**Pelo arquivo (preferido para agentes):** edite **somente** a linha `status:` do frontmatter. Não reformate o arquivo, não reordene campos, não mude quebras de linha (LF/CRLF) nem o corpo. O board percebe a mudança em até cerca de 1 s (watcher + SSE) e move o card sozinho.

```diff
-status: Backlog
+status: Em execução
```

**Pela API local** (o servidor roda em `http://localhost:4400`; só aceita `Origin`/`Host` do próprio board):

```bash
curl -X PATCH http://127.0.0.1:4400/api/tasks/T-001/status \
  -H 'Content-Type: application/json' \
  -d '{"status":"Em execução"}'
```

A API exige que a coluna de destino já exista (400 caso contrário) e reescreve só a linha `status:`. Se a linha não puder ser localizada com segurança (status em bloco `|`, chave repetida, entre aspas na chave), responde erro e não toca no arquivo. Ela atua no repositório que estiver aberto no board, que é um só por servidor.

Regras para o agente:

- Mexa em uma task por vez e **não** mude `id` nem `title` ao mover.
- Depois de editar, confirme que o card foi para a coluna esperada (`GET /api/board`) e que `ignored` não ganhou o arquivo.
- Não renomeie nem exclua colunas por conta própria: renomear reescreve o `status` de todas as tasks da coluna e só se exclui coluna vazia. Isso é decisão do humano.

## API (resumo)

Todas sob `/api`, JSON, só em `127.0.0.1` (ou no IP da rede se o servidor subiu com `HOST=0.0.0.0`).

| Rota | Função |
|---|---|
| `POST /repo` `{ path }` | Abre o repositório (caminho absoluto) e devolve o estado |
| `DELETE /repo` | Fecha o repositório |
| `GET /board` | `{ repo, tasks[], columns[], ignored[] }` |
| `GET /tasks/:id` | Conteúdo da task: `{ ...task, body, extra }` (o que o modal mostra) |
| `PATCH /tasks/:id/status` `{ status }` | Move a task |
| `POST /columns` `{ name }` · `PATCH /columns/:key` · `DELETE /columns/:key` | Colunas |
| `GET /events` | SSE: `board-changed`, `repo-unavailable`, `repo-closed` |

`tasks[]`: `{ id, title, status, file, column, enteredAt, rev }` (`file` relativo ao repo). `columns[]`: `{ key, name, count }`.

## Padrão recomendado: task em capítulos

Recomendado, não obrigatório (o parser não valida o corpo). O modal da task mostra cada `##` como um capítulo recolhível (e cada `###` como subcapítulo), tudo recolhido ao abrir, com o texto antes do primeiro `##` sempre visível. Task sem `##` abre normalmente.

- **Antes do primeiro `##`:** uma linha de contexto (repositórios, origem, esforço).
- **Seções `##` numeradas**, usando só as que fizerem sentido:
  1. Objetivo
  2. Especificação
  3. Impacto
  4. Plano
  5. Critérios de aceite
  6. Decisões em aberto
  7. Registro de execução
  8. Riscos
  9. Como testar
- **Objetivo** curto e legível sozinho (quem lê só ele entende o porquê).
- **Especificação** com requisitos de ID estável (ex.: `SPEC-XXX-NN`), para que testes e commits possam citá-los.
- Títulos dentro de bloco de código (```) não viram capítulos.
- Exemplo completo: `docs/tasks/EPC-11.md` do repositório Uptodate. Convenção também registrada em `specs/01-formato-da-task.md`.

## Ordem dos cards

Fila por coluna ([T-001](specs/tasks/T-001.md)): o card há mais tempo na coluna fica no topo; empate por `id`. O instante de entrada fica em `~/.agentic-board/queues/` (fora do repo); sem registro, usa a data do arquivo (`estimated`). Cada task traz `enteredAt`.

## Trabalhando neste repositório

- Stack: React + Vite (`web/`), Node + Express + chokidar (`server/`), Vitest.
- `npm install`, `npm start` (builda e serve em `:4400`), `npm run dev`, `npm test`, `npm run typecheck`.
- Módulos do servidor: `frontmatter` (parse e `rewriteStatus`), `scanner`, `board` (colunas), `session` (repo aberto, watcher, gravações), `writer` (gravação atômica), `app` (rotas e segurança).
- Mudou comportamento? Atualize a spec em `specs/` no mesmo commit e cubra com teste. Commits convencionais; não faça merge na `main` nem push sem o humano pedir.
- As tasks deste projeto estão em `specs/tasks/` e aparecem no próprio board.

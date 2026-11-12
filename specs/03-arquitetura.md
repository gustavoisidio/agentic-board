# Arquitetura

## Stack

- **Front:** React + TypeScript + Vite. Drag and drop com a API HTML5 nativa (ou `@dnd-kit` se a nativa atrapalhar a acessibilidade).
- **Servidor:** Node (TypeScript) com Fastify ou Express; `chokidar` para watch; `gray-matter` (ou `yaml`) para ler o frontmatter.
- **Execução:** `npm run dev` sobe servidor (porta 4400) e Vite (proxy `/api`). `npm start` serve o front buildado pelo próprio servidor. Servidor escuta **somente em `127.0.0.1`**.
- Gerenciador: npm. Testes: Vitest (unitários do parser/rewriter e da API), Playwright opcional para o fluxo de drag.

## Estrutura sugerida

```
agentic-board/
  server/        # API, scanner, writer, watcher
  web/           # React app
  specs/         # estas specs (e tasks do próprio projeto, se quiser usar o board nele)
  demo/          # mockup visual estático
```

## API (JSON, todas sob `/api`)

| Método e rota | Função |
|---|---|
| `POST /pick-folder` | Abre o seletor do Finder (`osascript -e 'POSIX path of (choose folder)'`); responde `{ path }` ou `{ cancelled: true }` |
| `GET /recent` | Repositórios recentes |
| `POST /repos` `{ path }` | Abre mais um repositório (409 se já aberto, comparando o caminho real); adiciona aos recentes; inicia scanner, fila e watcher próprios; responde o estado |
| `DELETE /repos/:repoId` | Fecha o repo no board (nada muda em disco) |
| `PUT /repos/:repoId/color` `{ color }` | Troca a cor (da paleta fixa) |
| `PUT /filter` `{ hidden: [repoId] }` | Lembra o filtro como padrão inicial das abas do conjunto (400 se ocultar todos) |
| `GET /board` | Estado: `{ repos[], tasks[], columns[], ignored[], hidden[] }` |
| `GET /repos/:repoId/tasks/:id` | Conteúdo da task para o modal: `{ ...task, body, extra }` |
| `PATCH /repos/:repoId/tasks/:id/status` `{ status }` | Reescreve o status no `.md` desse repo |
| `POST /repo` `{ path }` · `DELETE /repo` · `GET /tasks/:id` · `PATCH /tasks/:id/status` | Rotas antigas (1 repo): `POST /repo` abre se ainda não estiver aberto; `DELETE /repo` fecha o único aberto (409 com vários); as de task valem quando o id é único entre os repos abertos (409 se repetido) |
| `POST /columns` `{ name }` | Cria coluna |
| `PATCH /columns/order` `{ order }` | Reordena as colunas (nomes ou chaves); grava a ordem completa no `.board.json` |
| `PATCH /columns/:key` `{ name }` | Renomeia (reescreve status das tasks) |
| `DELETE /columns/:key` | Exclui coluna vazia (409 se tiver tasks) |
| `GET /events` | SSE: `board-changed` com o estado novo (repos adicionados, removidos, indisponíveis, mudanças nos arquivos) |

`repos[]`: `{ repoId, name, path, color, count, available }` (`repoId` = hash curto do caminho real). `tasks[]`: `{ repoId, id, title, status, file, column, enteredAt, rev }` (`file` relativo ao repo; um card é identificado por `(repoId, id)`). `columns[]`: `{ key, name, count }`. `ignored[]`: `{ repoId, file, reason }`.

## Segurança

- Bind em loopback; checar `Host`/`Origin` para bloquear requisições de outras origens (evita que um site aberto no browser escreva nos seus arquivos).
- Só ler/gravar arquivos `.md` dentro de pastas `specs`/`tasks` do repo aberto e `specs/.board.json`. Resolver caminhos reais e rejeitar qualquer um fora do repo (path traversal, symlinks para fora).
- `/pick-folder` só funciona em macOS; em outros sistemas responde 501 e o front esconde o botão (campo de colar continua).
- Recentes e config do app ficam em `~/.agentic-board/config.json`, que também guarda os repos abertos e suas cores (reabertos ao iniciar), a ordem das colunas e o filtro padrão por conjunto de repos (modo multi-repo). A fila (instante de entrada de cada card na coluna) fica em `~/.agentic-board/queues/<hash do repo>.json`, fora do repositório.

## Módulos do servidor

- `scanner`: percorre o repo, devolve tasks válidas e ignoradas.
- `frontmatter`: parse + extração do bloco; `rewriteStatus(content, newStatus)` linha-a-linha, preservando o resto.
- `writer`: gravação atômica.
- `queue`: lê/grava a fila por repositório (arquivo ilegível vale como vazio).
- `repoSession`: um repo aberto (scanner, fila, watcher, leitura/gravação de tasks). `workspace`: todos os repos abertos, estado unificado, colunas, cores, filtro e eventos.
- `board`: monta colunas (ordem, chaves normalizadas) a partir de tasks + `.board.json`.
- `watcher`: chokidar + debounce + supressão do eco das próprias gravações.

## Critérios de aceite do MVP

1. Abrir um repo com 3 tasks (2 Backlog, 1 Em execução) mostra "3 tasks · 2 colunas" com as tasks distribuídas.
2. Criar a coluna "Concluído" sem tasks a mantém visível após recarregar a página e reabrir o repo.
3. Arrastar um post-it troca o `status` no `.md` e mais nada no arquivo (verificável por `git diff`).
4. Editar o `status` de um `.md` por fora move o card sozinho em até ~1 s.
5. `.md` com frontmatter sem `status` não aparece como card e aparece no aviso com o motivo.
6. Renomear uma coluna com 2 tasks pede confirmação e altera exatamente 2 arquivos.
7. Excluir coluna com tasks é impossível; vazia, funciona.
8. Requisição à API com `Origin` externo é rejeitada.
9. Testes unitários cobrem: parser (válido/inválido/CRLF/campos extras), normalização de status, `rewriteStatus`, scanner (ignorados, duplicatas) e `board`.

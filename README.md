# Agentic Board

Board kanban local para coordenar o trabalho de múltiplos agentes. Lê tasks em `.md` (frontmatter YAML) de um repositório e as exibe como post-its por status; arrastar um post-it reescreve só a linha `status:` do arquivo.

- Specs: [`specs/`](specs/00-visao-geral.md)
- Demo visual: abra `demo/index.html` no browser

## Como rodar

Requer Node 20+ e npm.

```bash
npm install
npm start        # builda o front e serve tudo em http://localhost:4400
npm run dev      # desenvolvimento: API em :4400 e Vite em :5173 (com proxy /api)
npm test         # Vitest (parser, rewriter, scanner, board, API, watcher)
npm run typecheck
```

`PORT` muda a porta da API (padrão 4400). O servidor escuta só em `127.0.0.1` e recusa `Origin`/`Host` externos.

## Uso

1. Na tela inicial, **Escolher pasta** (Finder, só macOS) ou cole o caminho absoluto e **Abrir**. Os repositórios recentes ficam em `~/.agentic-board/config.json`.
2. O board cria uma coluna por status; colunas criadas à mão e a ordem ficam em `specs/.board.json` do repo.
3. Arraste os post-its entre colunas. Edições externas nos `.md` aparecem sozinhas (watcher + SSE).

Observação: ao criar, renomear ou excluir uma coluna, a lista completa de colunas (inclusive as vindas só das tasks) é gravada em `specs/.board.json`, para fixar a ordem.

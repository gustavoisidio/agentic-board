# Agentic Board — Visão geral

Board kanban local para um humano visualizar e coordenar o trabalho de múltiplos agentes. As tasks são arquivos `.md` dentro de um repositório; o board as lê, mostra como post-its em colunas por status e grava de volta no arquivo quando o humano move um card.

## Escopo do MVP

1. Escolher o repositório (Finder nativo ou caminho colado).
2. Encontrar e validar os `.md` de tasks.
3. Mostrar a contagem de tasks e criar uma coluna por status existente.
4. Permitir criar, renomear e excluir colunas, inclusive sem tasks.
5. Mostrar cada task como post-it (id pequeno + título).
6. Mover post-it entre colunas (drag and drop), reescrevendo o `status` no `.md`.
7. Acompanhar mudanças externas nos arquivos em tempo real.

Fora do MVP: criar/editar tasks pela UI, editar o corpo, filtros, busca, múltiplos repositórios abertos ao mesmo tempo, autenticação, deploy remoto.

## Decisões fechadas

| Tema | Decisão |
|---|---|
| Execução | Aplicação web local (`localhost`), front React + servidor Node |
| Seleção do repo | Botão "Escolher pasta" abre o Finder via `osascript`; campo para colar o caminho como alternativa; repos recentes lembrados |
| Header da task | YAML frontmatter (ver `01-formato-da-task.md`) |
| Onde buscar | Qualquer pasta chamada `specs` ou `tasks`, recursivamente |
| Arquivo inválido | Ignorado, com aviso listando arquivo e motivo |
| Atualização | Tempo real via file watcher (SSE) |
| Colunas extras e ordem | `specs/.board.json` dentro do repo escolhido |
| Status | Texto livre, comparado sem diferenciar maiúsculas e acentos |
| Mover task | Drag and drop; reescreve só o campo `status` |
| Renomear coluna com tasks | Reescreve o `status` em todos os `.md` dela, com confirmação |
| Excluir coluna | Só quando estiver vazia |
| Post-it | Mostra id (pequeno) e título |

## Visual

Paleta azul sóbria (claro e escuro via `prefers-color-scheme`). Referência viva: `demo/index.html`. Tokens principais:

| Token | Claro | Escuro |
|---|---|---|
| bg | `#e4e9f0` | `#0e1726` |
| surface (coluna) | `#d3dbe7` | `#16233a` |
| ink | `#14233a` | `#e3e9f3` |
| muted | `#5a6b84` | `#8fa0ba` |
| line | `#b9c4d6` | `#263a5a` |
| accent | `#1e3a8a` | `#5b82d6` |
| note (post-it) | `#f4f7fb` | `#22385c` |
| note-line | `#9fb1cc` | `#3c5a8a` |

Post-it: raio 8px, borda de 1px, faixa de 4px do accent na esquerda, sombra leve, cursor `grab`.

# Comportamento da aplicação

## 1. Tela inicial (sem repositório)

- Botão **Escolher pasta** (abre o seletor nativo do Finder), campo para colar caminho absoluto com botão **Abrir**, e lista de **repositórios recentes** (clique abre).
- Caminho inexistente, sem permissão ou que não é diretório: erro inline claro, sem trocar de tela.
- Repositório sem nenhuma task válida: abre o board vazio com mensagem "Nenhuma task encontrada em pastas `specs` ou `tasks`", mantendo a criação de colunas disponível.

## 2. Board

**Topo:** nome/caminho do repo, contagem (`N tasks · M colunas`), botão "Trocar repositório…" e campo "+ Nova coluna".

**Aviso de ignorados:** faixa abaixo do topo, só se houver arquivos inválidos com frontmatter. Ex.: `1 arquivo ignorado: specs/tasks/rascunho.md — campo obrigatório ausente: status`. Expansível quando houver mais de um.

**Colunas:**
- Uma por status distinto entre as tasks, mais as criadas manualmente (`.board.json`).
- Ordem: a de `.board.json`; colunas novas vindas de tasks entram no final, na ordem em que apareceram.
- Cabeçalho: nome, contador de tasks, e (no hover) renomear e excluir.
- Coluna vazia mostra "Nenhuma task".

**Post-it:** quadrado de bordas levemente arredondadas com `id` pequeno acima e `title`. Ordem dentro da coluna: por `id` (ordenação natural). Sem ordenação manual no MVP.

## 3. Criar coluna

Campo no topo; Enter cria. Nome vazio é rejeitado. Se a chave normalizada já existir, mostra "Essa coluna já existe" e não cria. Persistida em `specs/.board.json`.

## 4. Mover task

- Arrastar o post-it e soltar em outra coluna. Soltar na mesma coluna não faz nada.
- Atualização **otimista**: o card muda de coluna na hora; a API grava o arquivo. Se falhar, o card volta e aparece um toast de erro com o motivo.
- O watcher não deve mostrar "flicker" pelo eco da própria gravação (ignorar eventos cujo conteúdo já corresponde ao estado atual).

## 5. Renomear coluna

- Coluna vazia: renomeia direto (só `.board.json`).
- Coluna com tasks: diálogo "Isso altera o status em N arquivos. Continuar?". Ao confirmar, reescreve o `status` em todos. Se algum arquivo falhar, reporta quais falharam e quais foram alterados (sem rollback no MVP).
- Novo nome que colide com outra coluna (chave normalizada): bloqueado com mensagem.

## 6. Excluir coluna

Só colunas vazias. Em coluna com tasks, o botão fica desabilitado com tooltip "Mova as tasks antes de excluir". Uma coluna que existe só por causa de tasks desaparece sozinha quando fica vazia **e** não está no `.board.json`.

## 7. Tempo real

- O servidor observa as pastas `specs`/`tasks` do repo (chokidar) e emite eventos via SSE; o front re-sincroniza o estado (adição, remoção, edição, mudança de status por agentes).
- Debounce de ~150 ms para agrupar rajadas.
- Se o repositório deixar de existir, mostra banner "Repositório indisponível" com opção de trocar.
- Mudanças em `.board.json` feitas por fora também são refletidas.

## 8. `specs/.board.json`

```json
{
  "version": 1,
  "columns": ["Backlog", "Em execução", "Revisão", "Concluído"]
}
```

Criado sob demanda (ao criar/renomear/reordenar colunas). Se estiver corrompido, o board abre com colunas derivadas das tasks e mostra aviso; o arquivo não é sobrescrito até a próxima ação do usuário sobre colunas.

## 9. Estados e erros

Carregando (skeleton leve), vazio, erro de leitura por arquivo (vai para o aviso de ignorados), erro de gravação (toast), repo indisponível (banner). Textos em português.

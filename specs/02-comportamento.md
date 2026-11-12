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

**Post-it:** quadrado de bordas levemente arredondadas com `id` pequeno acima e `title`. Ordem dentro da coluna: **fila** — o card há mais tempo na coluna fica no topo e o mais recente na base; empate por `id` (ordenação natural); sem instante conhecido, no fim. Mover um card (ou mudar o `status` por fora) o coloca no fim da fila da coluna de destino; renomear a coluna não altera a fila. Sem ordenação manual no MVP. Detalhes em `tasks/T-001.md`.

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

## 10. Modal da task

- Abre ao clicar no post-it (ou Enter/Espaço com o card focado). Arrastar não abre: o clique que termina um arrasto é ignorado.
- Cabeçalho: `id`, título e status atual. Corpo: markdown renderizado (títulos, listas, código, tabelas, links). A saída é sanitizada: sem HTML cru perigoso (script, handlers, estilos, iframes, imagens, formulários) e só links `http(s)`, `mailto` e âncoras; links abrem em outra aba com `rel="noopener noreferrer"`. Campos extras do frontmatter (ex.: `priority`) numa área discreta no fim.
- Somente leitura: o corpo não é editado pelo board.
- Troca de status: seletor com as colunas existentes; escolher outra move a task pela mesma API (`PATCH /api/tasks/:id/status`) e pela mesma regra da fila (grava o instante de entrada na nova coluna). Mesma coluna não faz nada. Erro mostra toast, sem fechar o modal.
- Fecha com Esc, clique fora ou botão fechar. O foco fica preso dentro e volta ao card ao fechar; `role="dialog"`, `aria-modal` e rótulo pelo título.
- Tempo real: se o arquivo mudar por fora com o modal aberto (status, título ou corpo), o conteúdo e o status se atualizam sozinhos; se a task for removida, o modal fecha com aviso.
- Servidor: `GET /api/tasks/:id` devolve a task com `body` e `extra`. Lê só o `.md` da task encontrada pelo scanner, dentro do repo aberto e das pastas `specs`/`tasks`, com as mesmas proteções de caminho (o `id` nunca vira caminho; symlink para fora é recusado). Cada task do estado traz `rev` (tamanho + data do arquivo) para que edições só do corpo gerem `board-changed`.
- Visual: mesma paleta azul sóbria, claro e escuro.

### 10.1 Capítulos recolhíveis

- O corpo da task vira capítulos: cada título `##` é um capítulo e cada `###` dentro dele, um subcapítulo aninhado, também recolhível. O texto antes do primeiro `##` (título `#`, linha de contexto com repositórios, origem etc.) fica sempre visível no topo, fora dos capítulos. Um `###` antes do primeiro `##` é texto de abertura.
- Estado inicial: tudo recolhido, mostrando só a lista de títulos (com o número, se o markdown tiver). Clicar abre/fecha aquele capítulo; abrir um capítulo não abre os subcapítulos (que aparecem, recolhidos, dentro dele).
- Botão **Expandir tudo / Recolher tudo** acima dos capítulos.
- Atualização por fora com o modal aberto: os capítulos abertos continuam abertos, identificados por posição + texto do título; se o título sumiu ou mudou, o capítulo recolhe.
- Task sem nenhum `##` abre normalmente, sem capítulos nem botão.
- Cada título é um botão com `aria-expanded` e `aria-controls`; Enter e Espaço alternam. O estado não é guardado entre aberturas do modal.
- Títulos `#`, `##` ou `###` dentro de bloco de código (``` ou ~~~) não contam como capítulo. A sanitização do markdown (10) vale para cada trecho.


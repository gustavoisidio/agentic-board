# Comportamento da aplicação

## 1. Tela inicial (sem repositório)

- Botão **Escolher pasta** (abre o seletor nativo do Finder), campo para colar caminho absoluto com botão **Abrir**, e lista de **repositórios recentes** (clique abre).
- Caminho inexistente, sem permissão ou que não é diretório: erro inline claro, sem trocar de tela.
- Repositório sem nenhuma task válida: abre o board vazio com mensagem "Nenhuma task encontrada em pastas `specs` ou `tasks`", mantendo a criação de colunas disponível.

## 2. Board

**Topo:** nome/caminho do repo, contagem (`N tasks · M colunas`), e campo "+ Nova coluna". Logo abaixo, a barra de chips dos repositórios (seção 13).

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

## 11. Reordenar colunas

Vale para qualquer coluna, inclusive as que existem só por causa das tasks e as vazias.

- **Alça:** cada coluna tem uma alça de arrasto (ícone de grip, cursor `grab`) no cabeçalho. Só a alça inicia o arrasto da coluna, sem conflito com o arrasto dos post-its nem com o clique em renomear/excluir. Os dois arrastos são distinguidos pelo tipo de dado (`application/x-agentic-column` para coluna, `text/plain` para post-it): soltar uma coluna sobre outra nunca move task, e soltar um post-it sobre o cabeçalho (ou qualquer parte da coluna) move a task e nunca reordena.
- **Durante o arrasto:** linha vertical na cor de destaque entre as colunas mostra onde a coluna cairá (metade esquerda da coluna alvo: antes; metade direita: depois); a coluna arrastada fica esmaecida. Soltar fora de uma coluna ou Esc cancela.
- **Otimista:** a ordem muda na hora; a API grava; se falhar, volta à ordem anterior com toast de erro.
- **Persistência:** a ordem completa (todas as colunas visíveis, inclusive as derivadas de tasks) vai para `specs/.board.json`, campo `columns`, em gravação atômica, sem tocar em nenhum `.md`. Soltar na posição original não grava nada.
- **API:** `PATCH /api/columns/order` `{ order: [nomes exibidos ou chaves] }`. Entrada desconhecida, repetida ou lista vazia: 400. Colunas que existem mas não vieram na lista (ex.: criadas por fora durante o arrasto) são acrescentadas ao final, mantendo a ordem pedida. Mesma ordem que a atual: responde o estado sem gravar.
- **Tempo real:** a mudança emite `board-changed` e as outras abas refletem; mudanças em `.board.json` feitas por fora também reordenam. O eco da própria gravação não gera novo evento (sem flicker).
- **Teclado:** com foco na alça, Alt+seta esquerda/direita move a coluna uma posição; a nova posição é anunciada (`aria-live`: "Coluna X movida para a posição N de M"). O foco volta à alça.
- **Rolagem horizontal:** ao arrastar perto das bordas do board, ele rola sozinho.
- **Interação:** renomear mantém a posição; criar coluna continua entrando no final; a fila dos cards (seção 2) não muda ao reordenar colunas.

## 13. Vários repositórios

- **Repos abertos:** o servidor mantém uma lista de repositórios, cada um com scanner, watcher e fila próprios (`~/.agentic-board/queues/<hash>.json` por repo). A lista e a cor de cada repo ficam em `~/.agentic-board/config.json` e são reabertas ao iniciar; um repo que sumiu aparece como chip "indisponível", sem derrubar os outros, e volta sozinho quando reaparece.
- **Adicionar e remover:** o chip "+" no fim da barra abre o seletor (Finder ou caminho colado). Repo já aberto (mesmo caminho real) não duplica: avisa. O "✕" do chip remove só do board (nada muda em disco), sem confirmação. Remover o último volta à tela inicial. Com um único repo a tela é a de sempre, sem faixa colorida nem nome nos cards; os chips aparecem sempre.
- **Identidade:** um card é `(repo, id)`. O mesmo `id` em repos diferentes é permitido e não gera aviso de duplicata (que continua valendo dentro do mesmo repo). O repo é identificado por um `repoId` (hash curto do caminho real). Nome curto: a pasta; se dois repos têm o mesmo nome, `app (pasta-pai)`.
- **Colunas unificadas:** uma coluna por status normalizado, juntando os cards de todos os repos; o nome exibido é o da primeira ocorrência na ordem salva. Ordem e colunas vazias criadas à mão: com 1 repo, no `specs/.board.json` dele (como antes); com 2 ou mais, em `config.json`, por conjunto de repos (chave = hash dos caminhos reais ordenados), semeada pelos `.board.json` dos repos quando o conjunto é novo. No modo multi-repo nenhum `.board.json` é escrito.
- **Mover:** grava o status só no `.md` daquele card (reescrita segura) e a fila daquele repo; o status de destino pode ainda não existir naquele repo (é só texto). **Renomear** reescreve todos os cards da coluna em todos os repos abertos; a confirmação traz a contagem por repo ("2 arquivos em app, 1 em api"). **Excluir** só se a coluna estiver vazia em todos os repos abertos (o filtro não conta).
- **Cores:** paleta fixa de 8 cores sóbrias com versão clara e escura (`--repo-azul`, `teal`, `indigo`, `ambar`, `musgo`, `vinho`, `ardosia`, `cobre`). Cada repo novo recebe a primeira livre; a cor fica gravada e não muda ao reabrir. Para trocar, clique no ponto colorido do chip e escolha na paleta. A cor aparece como faixa lateral do card e ponto no chip; não é a única pista: o card mostra o nome curto do repo ao lado do id e o tooltip traz o caminho.
- **Chips e filtro:** um chip por repo (ponto de cor, nome, contador, "só este", "✕"), todos ativos por padrão. Clicar no nome alterna mostrar/ocultar; duplo clique ou o botão "só este" isola um; "Todos" restaura. O último ativo não alterna (dica no lugar). O filtro afeta só a visualização: as colunas continuam existindo sem cards visíveis, seus contadores refletem o filtro, e o topo mostra "N tasks (de M)" quando filtrado. Chips são botões com `aria-pressed`; remover e trocar a cor funcionam por teclado.
- **Filtro por aba:** cada aba tem o seu filtro; o último escolhido é lembrado em `config.json`, por conjunto de repos, só como padrão inicial de abas novas. Repo recém-adicionado entra ativo. Adicionar, remover, repo indisponível, cor e ordem de colunas sincronizam entre abas (evento `board-changed`).
- **Modal e arrasto:** o modal mostra o repo (chip pequeno) no cabeçalho; a troca de status usa a API com `repoId`. Reordenar colunas continua como na seção 11, agora gravando no config do conjunto.

Decisões onde a spec original se contradizia: clicar no chip alterna a visibilidade (não abre a paleta); a paleta abre pelo ponto de cor. As rotas antigas sem `repoId` continuam funcionando (ver `03-arquitetura.md`); `POST /repo` não substitui os repos abertos, apenas abre se ainda não estiver aberto.


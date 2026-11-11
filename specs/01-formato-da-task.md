# Formato da task

Cada task é um arquivo `.md` com **YAML frontmatter** no topo, seguido do corpo livre.

```markdown
---
id: T-001
title: Definir formato do header das tasks
status: Backlog
---

# Corpo da task

Qualquer markdown. O board não interpreta o corpo no MVP.
```

## Regras do header

- Começa na **primeira linha** do arquivo com `---` e termina no próximo `---` sozinho em uma linha. Marcação de início e fim obrigatória.
- Campos obrigatórios: `id`, `title`, `status`. Todos strings não vazias (após trim).
- Campos extras são aceitos e **preservados** na reescrita (ex.: `assignee`, `priority`). O board ignora no MVP.
- `id` único no repositório. Em caso de duplicata, a primeira (ordem alfabética do caminho) vale e as demais são ignoradas com aviso.
- Aspas opcionais; valores com `:` ou `#` devem usar aspas (regra normal de YAML).

## Descoberta

- Raiz: caminho do repositório escolhido.
- Considera todo `.md` dentro de qualquer diretório chamado `specs` ou `tasks`, em qualquer profundidade (não diferencia maiúsculas no nome da pasta).
- Ignora `node_modules`, `.git`, `dist`, `build` e pastas iniciadas por ponto.
- Um arquivo dentro de `specs/` sem frontmatter válido (ex.: esta própria documentação) não é task: é ignorado.
- Para evitar ruído, o aviso de ignorados lista apenas arquivos que **têm** frontmatter (`---` na primeira linha) mas estão inválidos. Arquivos sem frontmatter nenhum são ignorados em silêncio.

## Motivos de invalidade (mensagens do aviso)

| Motivo | Mensagem |
|---|---|
| YAML quebrado | `frontmatter com YAML inválido` |
| Sem fechamento | `frontmatter sem marcação de fim (---)` |
| Campo ausente/vazio | `campo obrigatório ausente: status` |
| id repetido | `id duplicado (já usado em specs/tasks/a.md)` |

## Normalização de status

- Chave de comparação: trim, minúsculas, sem acentos, espaços internos colapsados. `Em execução`, `em execucao` e ` EM  EXECUÇÃO ` caem na mesma coluna.
- O nome exibido da coluna é o da **primeira ocorrência** no `.board.json`; se a coluna só existe por causa das tasks, o da primeira task lida.
- Ao mover uma task, o valor gravado é **exatamente o nome exibido da coluna de destino**.

## Reescrita segura

Mover uma task altera **apenas a linha `status:`** do frontmatter. Corpo, outros campos, ordem, comentários e quebras de linha (LF/CRLF) permanecem intactos. Se a linha `status:` não puder ser localizada com segurança, a operação falha com erro e o arquivo não é tocado. A gravação é atômica (arquivo temporário + rename).

/** Normaliza como o servidor (`statusKey`): trim, minúsculas, sem acentos, espaços colapsados. */
export function normalizeStatus(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Único lugar que define quais colunas contam como concluídas: para ampliar (ex.: "done"), acrescente a chave aqui.
const DONE_KEYS = new Set(['concluido']);

/** A coluna (nome ou chave) é a de tarefas concluídas? Só "concluido" normalizado; "Concluída" e "Done" não pegam. */
export const isDoneColumn = (nameOrKey: string): boolean => DONE_KEYS.has(normalizeStatus(nameOrKey));

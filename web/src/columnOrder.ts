/** Tipo de dado do arrasto de coluna: separa o arrasto de coluna do arrasto de post-it (text/plain). */
export const COLUMN_DRAG_TYPE = 'application/x-agentic-column';

export type Side = 'before' | 'after';

/** Move `key` para antes/depois de `target`. Devolve a mesma lista (mesma referência) se a posição não muda. */
export function moveColumn(keys: string[], key: string, target: string, side: Side): string[] {
  if (key === target) return keys;
  const rest = keys.filter((k) => k !== key);
  const at = rest.indexOf(target);
  if (at === -1 || !keys.includes(key)) return keys;
  const next = [...rest.slice(0, side === 'before' ? at : at + 1), key, ...rest.slice(side === 'before' ? at : at + 1)];
  return next.every((k, i) => k === keys[i]) ? keys : next;
}

/** Move `key` uma posição (ou mais) para a esquerda (-1) ou direita (+1). Nas pontas, devolve a mesma lista. */
export function moveBy(keys: string[], key: string, delta: number): string[] {
  const from = keys.indexOf(key);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= keys.length) return keys;
  const next = keys.filter((k) => k !== key);
  next.splice(to, 0, key);
  return next;
}

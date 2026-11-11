/** Chave de comparação de status: trim, minúsculas, sem acentos, espaços internos colapsados. */
export function statusKey(status: string): string {
  return status
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
/** Ordenação natural (T-2 antes de T-10). */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b);
}

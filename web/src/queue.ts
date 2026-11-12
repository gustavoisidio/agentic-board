const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/** Fila da coluna (igual ao servidor): o mais antigo primeiro; empate por id; sem instante conhecido, no fim. */
export function compareQueue(a: { id: string; enteredAt: string | null }, b: { id: string; enteredAt: string | null }): number {
  const ta = a.enteredAt ? Date.parse(a.enteredAt) : Infinity;
  const tb = b.enteredAt ? Date.parse(b.enteredAt) : Infinity;
  if (ta !== tb) return ta < tb ? -1 : 1;
  return collator.compare(a.id, b.id);
}

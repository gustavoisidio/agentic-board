import { describe, expect, it } from 'vitest';
import { compareQueue } from './queue';

describe('compareQueue (front)', () => {
  const t = (id: string, enteredAt: string | null) => ({ id, enteredAt });
  it('mais antigo primeiro, empate por id, desconhecido no fim', () => {
    const list = [t('T-2', null), t('T-10', '2026-01-02T00:00:00Z'), t('T-3', '2026-01-02T00:00:00Z'), t('T-1', '2026-01-03T00:00:00Z')];
    expect(list.sort(compareQueue).map((x) => x.id)).toEqual(['T-3', 'T-10', 'T-1', 'T-2']);
  });
});

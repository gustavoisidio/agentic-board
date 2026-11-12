import { describe, expect, it } from 'vitest';
import { isDoneColumn } from './doneColumn';

describe('isDoneColumn', () => {
  it.each(['Concluído', 'concluido', 'CONCLUÍDO', '  concluído  ', 'Concluído', 'ConcluIDO'])('pega %j', (name) => {
    expect(isDoneColumn(name)).toBe(true);
  });

  it('aceita a chave normalizada do servidor', () => {
    expect(isDoneColumn('concluido')).toBe(true);
  });

  it.each(['Concluída', 'Done', 'Concluídos', 'Não concluído', 'Concluído hoje', 'Em execução', '', 'Concluí do'])('não pega %j', (name) => {
    expect(isDoneColumn(name)).toBe(false);
  });
});

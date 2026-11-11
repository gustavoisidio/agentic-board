import { describe, expect, it } from 'vitest';
import { naturalCompare, statusKey } from './normalize.js';

describe('statusKey', () => {
  it('ignora maiúsculas, acentos e espaços extras', () => {
    expect(statusKey('Em execução')).toBe('em execucao');
    expect(statusKey('em execucao')).toBe('em execucao');
    expect(statusKey(' EM  EXECUÇÃO ')).toBe('em execucao');
  });
  it('mantém status diferentes separados', () => {
    expect(statusKey('Revisão')).not.toBe(statusKey('Backlog'));
  });
});

describe('naturalCompare', () => {
  it('ordena números dentro do id', () => {
    expect(['T-10', 'T-2', 'T-1'].sort(naturalCompare)).toEqual(['T-1', 'T-2', 'T-10']);
  });
});

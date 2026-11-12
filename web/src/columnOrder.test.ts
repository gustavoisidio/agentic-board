import { describe, expect, it } from 'vitest';
import { moveBy, moveColumn } from './columnOrder';

const keys = ['a', 'b', 'c', 'd'];

describe('moveColumn', () => {
  it('antes e depois de outra coluna', () => {
    expect(moveColumn(keys, 'd', 'b', 'before')).toEqual(['a', 'd', 'b', 'c']);
    expect(moveColumn(keys, 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd']);
  });
  it('soltar na posição original devolve a mesma lista (nada a gravar)', () => {
    expect(moveColumn(keys, 'b', 'a', 'after')).toBe(keys);
    expect(moveColumn(keys, 'b', 'c', 'before')).toBe(keys);
    expect(moveColumn(keys, 'b', 'b', 'after')).toBe(keys);
  });
});

describe('moveBy', () => {
  it('uma posição para cada lado, parando nas pontas', () => {
    expect(moveBy(keys, 'b', -1)).toEqual(['b', 'a', 'c', 'd']);
    expect(moveBy(keys, 'b', 1)).toEqual(['a', 'c', 'b', 'd']);
    expect(moveBy(keys, 'a', -1)).toBe(keys);
    expect(moveBy(keys, 'd', 1)).toBe(keys);
  });
});

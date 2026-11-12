// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Board } from './Board';
import type { BoardState } from './api';

const base: BoardState = {
  repo: { path: '/r/repo', name: 'repo' },
  columns: [{ key: 'a fazer', name: 'A fazer', count: 1 }, { key: 'concluido', name: 'Concluído', count: 1 }, { key: 'vazia', name: 'CONCLUIDO ', count: 0 }],
  tasks: [
    { id: 'T-1', title: 'Aberta', status: 'A fazer', file: 'specs/tasks/a.md', column: 'a fazer', enteredAt: null },
    { id: 'T-2', title: 'Feita', status: 'Concluído', file: 'specs/tasks/b.md', column: 'concluido', enteredAt: null },
  ],
  ignored: [],
};

const ui = (board: BoardState) => (
  <Board board={board} unavailable={false} onLeave={() => undefined} onMove={() => undefined} onApply={() => undefined} onReorder={() => undefined} notify={() => undefined} />
);
const col = (name: string) => document.querySelector<HTMLElement>(`section[aria-label="${name}"]`)!;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...base.tasks[1], body: 'texto', extra: {} }), { status: 200 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('coluna Concluído esmaecida', () => {
  it('marca só as colunas cuja chave normalizada é "concluido" (inclusive vazia, com caixa e espaço)', () => {
    render(ui(base));
    expect(col('A fazer').getAttribute('data-done')).toBeNull();
    expect(col('Concluído').getAttribute('data-done')).toBe('true');
    expect(col('CONCLUIDO ').getAttribute('data-done')).toBe('true');
  });

  it('o atributo fica no contêiner da coluna, não em cada card (sem apagar duas vezes)', () => {
    render(ui(base));
    const card = screen.getByRole('button', { name: /T-2: Feita/ });
    expect(card.getAttribute('data-done')).toBeNull();
    expect(card.closest('[data-done]')).toBe(col('Concluído'));
  });

  it('renomear para outro nome volta ao normal, e outra coluna renomeada para Concluído passa a esmaecer', () => {
    const { rerender } = render(ui(base));
    rerender(ui({ ...base, columns: [base.columns[0]!, { ...base.columns[1]!, name: 'Revisão', key: 'revisao' }, base.columns[2]!] }));
    expect(col('Revisão').getAttribute('data-done')).toBeNull();
    rerender(ui({ ...base, columns: [{ ...base.columns[0]!, name: 'Concluído', key: 'concluido' }, base.columns[1]!] }));
    expect(col('Concluído').getAttribute('data-done')).toBe('true');
  });

  it('continua funcional: o card abre o modal e o modal não é esmaecido', async () => {
    render(ui(base));
    fireEvent.click(screen.getByRole('button', { name: /T-2: Feita/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.closest('[data-done]')).toBeNull();
  });
});

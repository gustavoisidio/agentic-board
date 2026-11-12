// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Board } from './Board';
import type { BoardState } from './api';
import { boardProps, makeView } from './testBoard';

const board: BoardState = {
  repos: [{ repoId: 'r1', name: 'repo', path: '/r/repo', color: 'azul', count: 1, available: true }],
  hidden: [],
  columns: [{ key: 'backlog', name: 'Backlog', count: 1 }, { key: 'feito', name: 'Feito', count: 0 }],
  tasks: [{ repoId: 'r1', id: 'T-1', title: 'Primeira', status: 'Backlog', file: 'specs/tasks/a.md', column: 'backlog', enteredAt: null }],
  ignored: [],
};

function setup(overrides: Partial<BoardState> = {}, onMove = vi.fn()) {
  const state = { ...board, ...overrides };
  const notify = vi.fn();
  const utils = render(<Board board={makeView(state)} {...boardProps({ onMove, notify })} />);
  return { ...utils, state, onMove, notify };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...board.tasks[0], body: '# Corpo\n\ntexto <script>alert(1)</script>', extra: { priority: 'alta' } }), { status: 200 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('modal da task', () => {
  it('clique abre o modal com cabeçalho, markdown sanitizado e campos extras', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /T-1: Primeira/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('T-1');
    await waitFor(() => expect(screen.getByTestId('task-intro').innerHTML).toContain('<h1>Corpo</h1>'));
    expect(screen.getByTestId('task-intro').innerHTML).not.toContain('<script');
    expect(dialog.textContent).toContain('priority');
  });

  it('arrastar não abre; clique depois do arrasto volta a abrir', async () => {
    setup();
    const card = screen.getByRole('button', { name: /T-1: Primeira/ });
    fireEvent.dragStart(card, { dataTransfer: { setData: () => undefined } });
    fireEvent.click(card);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.dragEnd(card);
    await new Promise((r) => setTimeout(r, 5));
    fireEvent.click(card);
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('trocar o status no seletor move a task; escolher a mesma coluna não faz nada', async () => {
    const { onMove } = setup();
    fireEvent.click(screen.getByRole('button', { name: /T-1: Primeira/ }));
    const select = (await screen.findByLabelText('Status')) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'backlog' } });
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.change(select, { target: { value: 'feito' } });
    expect(onMove).toHaveBeenCalledWith('r1', 'T-1', 'feito', 'Feito');
  });

  it('Esc e clique fora fecham, e o foco volta ao card', async () => {
    setup();
    const card = screen.getByRole('button', { name: /T-1: Primeira/ });
    card.focus();
    fireEvent.click(card);
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(card);
    fireEvent.click(card);
    await screen.findByRole('dialog');
    fireEvent.mouseDown(document.querySelector('.modal-backdrop')!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('task removida por fora fecha o modal com aviso', async () => {
    const { rerender, notify, state } = setup();
    fireEvent.click(screen.getByRole('button', { name: /T-1: Primeira/ }));
    await screen.findByRole('dialog');
    rerender(<Board board={makeView({ ...state, tasks: [] })} {...boardProps({ notify })} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(notify).toHaveBeenCalledWith('A task T-1 foi removida.');
  });
});

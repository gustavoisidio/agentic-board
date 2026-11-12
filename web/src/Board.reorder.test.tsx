// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Board } from './Board';
import type { BoardState } from './api';
import { COLUMN_DRAG_TYPE } from './columnOrder';

const board: BoardState = {
  repo: { path: '/r/repo', name: 'repo' },
  columns: [{ key: 'a', name: 'A', count: 1 }, { key: 'b', name: 'B', count: 0 }, { key: 'c', name: 'C', count: 0 }],
  tasks: [{ id: 'T-1', title: 'Primeira', status: 'A', file: 'specs/tasks/a.md', column: 'a', enteredAt: null }],
  ignored: [],
};

function setup() {
  const onMove = vi.fn();
  const onReorder = vi.fn();
  render(<Board board={board} unavailable={false} onLeave={() => undefined} onMove={onMove} onApply={() => undefined} onReorder={onReorder} notify={() => undefined} />);
  return { onMove, onReorder };
}

const section = (name: string) => document.querySelector<HTMLElement>(`section[aria-label="${name}"]`)!;
const grip = (name: string) => screen.getByRole('button', { name: `Mover coluna ${name}` });

// jsdom não calcula layout: força a largura para a metade esquerda/direita
function stubRect(el: HTMLElement) {
  el.getBoundingClientRect = () => ({ left: 0, width: 100, right: 100, top: 0, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) });
}
const columnDt = (key: string) => ({ types: [COLUMN_DRAG_TYPE], getData: (t: string) => (t === COLUMN_DRAG_TYPE ? key : ''), setData: () => undefined });
const taskDt = { types: ['text/plain'], getData: () => 'T-1', setData: () => undefined };

afterEach(cleanup);

// jsdom não repassa clientX em eventos de arrasto: define na mão
function dragAt(type: 'dragOver' | 'drop', el: HTMLElement, dataTransfer: object, clientX: number) {
  const event = createEvent[type](el, { dataTransfer });
  Object.defineProperty(event, 'clientX', { value: clientX });
  fireEvent(el, event);
}

describe('reordenar colunas', () => {
  it('arrastar pela alça e soltar na metade direita de outra coluna reordena e não move task', () => {
    const { onMove, onReorder } = setup();
    fireEvent.dragStart(grip('A'), { dataTransfer: columnDt('a') });
    const target = section('B');
    stubRect(target);
    dragAt('dragOver', target, columnDt('a'), 80);
    expect(target.className).toContain('ind-after');
    expect(section('A').className).toContain('col-dragging');
    dragAt('drop', target, columnDt('a'), 80);
    expect(onReorder).toHaveBeenCalledWith(['b', 'a', 'c']);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('metade esquerda insere antes', () => {
    const { onReorder } = setup();
    fireEvent.dragStart(grip('C'), { dataTransfer: columnDt('c') });
    const target = section('A');
    stubRect(target);
    dragAt('dragOver', target, columnDt('c'), 10);
    expect(target.className).toContain('ind-before');
    dragAt('drop', target, columnDt('c'), 10);
    expect(onReorder).toHaveBeenCalledWith(['c', 'a', 'b']);
  });

  it('soltar na posição original não reordena; cancelar (dragend/Esc) limpa o indicador', () => {
    const { onReorder } = setup();
    fireEvent.dragStart(grip('A'), { dataTransfer: columnDt('a') });
    const target = section('B');
    stubRect(target);
    dragAt('dragOver', target, columnDt('a'), 10);
    dragAt('drop', target, columnDt('a'), 10);
    expect(onReorder).not.toHaveBeenCalled();

    fireEvent.dragStart(grip('A'), { dataTransfer: columnDt('a') });
    dragAt('dragOver', target, columnDt('a'), 80);
    expect(target.className).toContain('ind-after');
    fireEvent.dragEnd(grip('A')); // Esc ou soltar fora dispara dragend sem drop
    expect(target.className).not.toContain('ind-after');
    expect(section('A').className).not.toContain('col-dragging');
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('arrastar um post-it sobre outra coluna move a task e nunca reordena', () => {
    const { onMove, onReorder } = setup();
    const card = screen.getByRole('button', { name: /T-1: Primeira/ });
    fireEvent.dragStart(card, { dataTransfer: taskDt });
    const target = section('B');
    stubRect(target);
    dragAt('dragOver', target, taskDt, 80);
    expect(target.className).not.toContain('ind-');
    dragAt('drop', target, taskDt, 0);
    expect(onMove).toHaveBeenCalledWith('T-1', 'b', 'B');
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('teclado: Alt+seta move uma posição e anuncia; sem Alt ou na ponta não faz nada', () => {
    const { onReorder } = setup();
    fireEvent.keyDown(grip('B'), { key: 'ArrowLeft' });
    expect(onReorder).not.toHaveBeenCalled();
    fireEvent.keyDown(grip('A'), { key: 'ArrowLeft', altKey: true });
    expect(onReorder).not.toHaveBeenCalled();
    fireEvent.keyDown(grip('B'), { key: 'ArrowRight', altKey: true });
    expect(onReorder).toHaveBeenCalledWith(['a', 'c', 'b']);
    expect(document.body.textContent).toContain('Coluna B movida para a posição 3 de 3');
  });
});

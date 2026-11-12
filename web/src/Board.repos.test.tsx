// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Board, confirmText } from './Board';
import type { BoardState, Task } from './api';
import { boardProps, makeView, repo } from './testBoard';
import { useBoard } from './useBoard';

const t = (repoId: string, id: string, column: string, title = id): Task => ({ repoId, id, title, status: column, file: `specs/tasks/${id}.md`, column, enteredAt: null });
const state: BoardState = {
  repos: [repo('r1', 'app', 'azul', { count: 2 }), repo('r2', 'api', 'vinho', { count: 1 })],
  columns: [{ key: 'a', name: 'A', count: 0 }, { key: 'b', name: 'B', count: 0 }],
  tasks: [t('r1', 'T-1', 'a', 'Do app'), t('r1', 'T-2', 'b'), t('r2', 'T-1', 'a', 'Da api')],
  ignored: [],
  hidden: [],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('cards e cores', () => {
  it('com mais de um repo: faixa na cor do repo, nome curto ao lado do id e caminho no tooltip; o mesmo id aparece duas vezes', () => {
    render(<Board board={makeView(state)} {...boardProps()} />);
    const cards = screen.getAllByRole('button', { name: /T-1/ });
    expect(cards).toHaveLength(2);
    expect(cards[0]!.style.borderLeftColor).toBe('var(--repo-azul)');
    expect(cards[1]!.style.borderLeftColor).toBe('var(--repo-vinho)');
    expect(cards[0]!.textContent).toContain('app');
    expect(cards[1]!.getAttribute('title')).toBe('/x/api/specs/tasks/T-1.md');
  });

  it('com um único repo: sem faixa colorida nem nome no card', () => {
    render(<Board board={makeView({ ...state, repos: [state.repos[0]!], tasks: [t('r1', 'T-1', 'a')] })} {...boardProps()} />);
    const card = screen.getByRole('button', { name: /T-1/ });
    expect(card.style.borderLeftColor).toBe('');
    expect(card.textContent).toBe('T-1T-1');
  });
});

describe('chips', () => {
  it('um chip por repo, com contador e aria-pressed; sempre aparecem (inclusive com um só repo)', () => {
    render(<Board board={makeView(state)} {...boardProps()} />);
    const group = screen.getByRole('group', { name: 'Repositórios' });
    const app = within(group).getByRole('button', { name: /app2/ });
    expect(app.getAttribute('aria-pressed')).toBe('true');
    cleanup();
    render(<Board board={makeView({ ...state, repos: [state.repos[0]!], tasks: [t('r1', 'T-1', 'a')] })} {...boardProps()} />);
    expect(screen.getByRole('button', { name: 'Abrir outro repositório' })).toBeTruthy();
  });

  it('filtro oculta os cards do repo; contador mostra "N tasks (de M)" e as colunas continuam', () => {
    render(<Board board={makeView({ ...state, hidden: ['r2'] })} {...boardProps()} />);
    expect(screen.getAllByRole('button', { name: /T-1/ })).toHaveLength(1);
    expect(screen.getByText(/2 tasks \(de 3\)/)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'B' }) ?? null).toBeTruthy();
    expect(screen.getByRole('button', { name: /api1/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Todos' })).toBeTruthy();
  });

  it('clique alterna, "Só este" isola e o último ativo não alterna (com dica)', async () => {
    const onToggle = vi.fn().mockReturnValue(false);
    const onOnly = vi.fn();
    render(<Board board={makeView(state)} {...boardProps({ onToggleRepo: onToggle, onOnlyRepo: onOnly })} />);
    fireEvent.click(screen.getByRole('button', { name: /app2/ }));
    await waitFor(() => expect(onToggle).toHaveBeenCalledWith('r1'));
    expect(await screen.findAllByText('Mantenha ao menos um repositório visível.')).not.toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar só api' }));
    expect(onOnly).toHaveBeenCalledWith('r2');
    fireEvent.doubleClick(screen.getByRole('button', { name: /app2/ }));
    fireEvent.click(screen.getByRole('button', { name: /app2/ }));
    fireEvent.click(screen.getByRole('button', { name: /app2/ }));
    await waitFor(() => expect(onOnly).toHaveBeenCalledWith('r1'));
  });

  it('trocar a cor pelo seletor e remover pelo x', () => {
    const onColor = vi.fn();
    const onRemove = vi.fn();
    render(<Board board={makeView(state)} {...boardProps({ onColor, onRemoveRepo: onRemove })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Trocar a cor de api' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Cor de api' })).getByRole('button', { name: 'teal' }));
    expect(onColor).toHaveBeenCalledWith('r2', 'teal');
    fireEvent.click(screen.getByRole('button', { name: 'Remover app do board' }));
    expect(onRemove).toHaveBeenCalledWith('r1');
  });

  it('repo indisponível aparece no chip e no aviso, sem derrubar os outros', () => {
    const repos = [state.repos[0]!, repo('r2', 'api', 'vinho', { available: false })];
    render(<Board board={makeView({ ...state, repos, tasks: [t('r1', 'T-1', 'a')] })} {...boardProps()} />);
    expect(screen.getAllByText(/indisponível/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /T-1/ })).toBeTruthy();
  });

  it('"+" abre o seletor de repositório e envia o caminho', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ pickFolder: false }), { status: 200 })));
    const onAdd = vi.fn(async () => undefined);
    render(<Board board={makeView(state)} {...boardProps({ onAddRepo: onAdd })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir outro repositório' }));
    fireEvent.change(await screen.findByLabelText('Caminho do repositório'), { target: { value: '/tmp/novo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('/tmp/novo'));
  });
});

describe('renomear e modal', () => {
  it('confirmação traz a contagem por repo', () => {
    const tasks = state.tasks.filter((x) => x.column === 'a');
    expect(confirmText(2, tasks, state.repos)).toBe('Isso altera o status em 2 arquivos (1 arquivo em app, 1 arquivo em api). Continuar?');
    expect(confirmText(1, [tasks[0]!], [state.repos[0]!])).toBe('Isso altera o status em 1 arquivo. Continuar?');
  });

  it('excluir considera todos os repos, mesmo ocultos pelo filtro', () => {
    render(<Board board={makeView({ ...state, hidden: ['r2'], tasks: [t('r2', 'T-9', 'b')] })} {...boardProps()} />);
    expect((screen.getByRole('button', { name: 'Excluir B' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('o modal mostra o repo e move pela API com o repoId', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...state.tasks[2], body: 'oi', extra: {} }), { status: 200 })));
    const onMove = vi.fn();
    render(<Board board={makeView(state)} {...boardProps({ onMove })} />);
    fireEvent.click(screen.getByRole('button', { name: /api, T-1/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('api')).toBeTruthy();
    fireEvent.change(await screen.findByLabelText('Status'), { target: { value: 'b' } });
    expect(onMove).toHaveBeenCalledWith('r2', 'T-1', 'b', 'B');
  });
});

describe('useBoard: filtro por aba', () => {
  class FakeSource {
    addEventListener() {}
    close() {}
    onopen: (() => void) | null = null;
  }
  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeSource);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(String(url).includes('/filter') ? { hidden: [] } : state), { status: 200 })));
  });

  it('não deixa ocultar o último repo ativo e "Todos" restaura', async () => {
    const { result } = renderHook(() => useBoard(() => undefined));
    await waitFor(() => expect(result.current.board).not.toBeNull());
    let ok = true;
    act(() => { ok = result.current.toggleRepo('r1'); });
    expect(ok).toBe(true);
    expect(result.current.board!.hidden).toEqual(['r1']);
    act(() => { ok = result.current.toggleRepo('r2'); });
    expect(ok).toBe(false);
    expect(result.current.board!.hidden).toEqual(['r1']);
    act(() => result.current.onlyRepo('r1'));
    expect(result.current.board!.hidden).toEqual(['r2']);
    act(() => result.current.showAll());
    expect(result.current.board!.hidden).toEqual([]);
  });

  it('o filtro padrão lembrado vira o estado inicial da aba', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...state, hidden: ['r2'] }), { status: 200 })));
    const { result } = renderHook(() => useBoard(() => undefined));
    await waitFor(() => expect(result.current.board?.hidden).toEqual(['r2']));
    expect(result.current.board!.tasks.every((x) => x.repoId === 'r1')).toBe(true);
  });
});

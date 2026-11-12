import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, taskKey, type BoardState, type Column, type Task } from './api';
import { compareQueue } from './queue';

export type Phase = 'loading' | 'home' | 'board';

/** O que a tela mostra: tasks já filtradas por repo (`tasks`) e a lista completa (`allTasks`). */
export interface BoardView extends Omit<BoardState, 'hidden'> {
  hidden: string[]; // filtro desta aba
  allTasks: Task[];
  totalTasks: number;
  columns: (Column & { total: number })[];
}

/** Estado do board: carga inicial, SSE em tempo real, filtro de repos por aba e movimentação otimista. */
export function useBoard(notify: (message: string) => void) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [board, setBoard] = useState<BoardState | null>(null);
  const [hidden, setHidden] = useState<string[] | null>(null); // filtro desta aba (começa no padrão lembrado)
  const [order, setOrder] = useState<string[] | null>(null); // ordem otimista das colunas (chaves) enquanto a API grava
  const [moves, setMoves] = useState<Record<string, { column: string; at: string }>>({}); // otimista: coluna e instante de entrada
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const apply = useCallback((state: BoardState) => {
    setBoard(state);
    setHidden((current) => (current === null ? state.hidden : current.filter((id) => state.repos.some((r) => r.repoId === id))));
    setPhase(state.repos.length === 0 ? 'home' : 'board');
  }, []);

  useEffect(() => {
    api.board().then(apply).catch(() => setPhase('home'));
  }, [apply]);

  useEffect(() => {
    if (phase !== 'board') return;
    const source = new EventSource('/api/events');
    source.addEventListener('board-changed', (e) => apply(JSON.parse((e as MessageEvent<string>).data) as BoardState));
    // ao reconectar (servidor reiniciado, aba voltou), ressincroniza
    source.onopen = () => void api.board().then(apply).catch(() => undefined);
    // aba que volta ao primeiro plano (ou o aparelho que acordou) ressincroniza com o disco
    const resync = () => {
      if (!document.hidden) void api.board().then(apply).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('focus', resync);
    return () => {
      source.close();
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('focus', resync);
    };
  }, [phase, apply]);

  const fail = (what: string, error: unknown) =>
    notifyRef.current(`${what}: ${error instanceof ApiError ? error.message : 'erro desconhecido'}`);

  async function addRepo(path: string) {
    apply(await api.addRepo(path));
  }

  async function removeRepo(repoId: string) {
    try {
      apply(await api.removeRepo(repoId));
    } catch (error) {
      fail('Não foi possível remover o repositório', error);
    }
  }

  async function setColor(repoId: string, color: string) {
    try {
      apply(await api.setColor(repoId, color));
    } catch (error) {
      fail('Não foi possível trocar a cor', error);
    }
  }

  // ---- filtro de repos (por aba; o último ativo não alterna) ----
  const saveFilter = (next: string[]) => void api.setFilter(next).catch(() => undefined);
  const visibleIds = board && hidden ? board.repos.filter((r) => !hidden.includes(r.repoId)).map((r) => r.repoId) : [];

  /** Alterna um repo; devolve false quando seria ocultar o último ativo (nada muda). */
  function toggleRepo(repoId: string): boolean {
    if (!board || !hidden) return false;
    const isHidden = hidden.includes(repoId);
    if (!isHidden && visibleIds.length <= 1) return false;
    const next = isHidden ? hidden.filter((id) => id !== repoId) : [...hidden, repoId];
    setHidden(next);
    saveFilter(next);
    return true;
  }
  function onlyRepo(repoId: string) {
    if (!board) return;
    const next = board.repos.filter((r) => r.repoId !== repoId).map((r) => r.repoId);
    setHidden(next);
    saveFilter(next);
  }
  function showAll() {
    setHidden([]);
    saveFilter([]);
  }

  async function move(repoId: string, id: string, columnKey: string, columnName: string) {
    const key = taskKey({ repoId, id });
    setMoves((m) => ({ ...m, [key]: { column: columnKey, at: new Date().toISOString() } }));
    try {
      apply(await api.moveTask(repoId, id, columnName));
    } catch (error) {
      fail(`Não foi possível mover ${id}`, error);
    } finally {
      setMoves((m) => {
        const { [key]: _done, ...rest } = m;
        return rest;
      });
    }
  }

  async function reorder(keys: string[]) {
    setOrder(keys);
    try {
      apply(await api.reorderColumns(keys));
    } catch (error) {
      fail('Não foi possível reordenar as colunas', error);
    } finally {
      setOrder(null);
    }
  }

  // movimentos otimistas aplicados; o card movido entra no fim da fila da coluna de destino
  const view: BoardView | null = board && hidden && (() => {
    const all = board.tasks
      .map((t) => (moves[taskKey(t)] ? { ...t, column: moves[taskKey(t)]!.column, enteredAt: moves[taskKey(t)]!.at } : t))
      .sort(compareQueue);
    const shown = all.filter((t) => !hidden.includes(t.repoId));
    return {
      ...board,
      hidden,
      tasks: shown,
      allTasks: all,
      totalTasks: all.length,
      columns: board.columns
        .map((c) => ({
          ...c,
          count: shown.reduce((n, t) => n + (t.column === c.key ? 1 : 0), 0), // contador reflete o filtro
          total: all.reduce((n, t) => n + (t.column === c.key ? 1 : 0), 0), // renomear/excluir consideram todos os repos
        }))
        .sort((a, b) => (order ? order.indexOf(a.key) - order.indexOf(b.key) : 0)),
    };
  })();

  return { phase, board: view, addRepo, removeRepo, setColor, toggleRepo, onlyRepo, showAll, move, reorder, apply };
}

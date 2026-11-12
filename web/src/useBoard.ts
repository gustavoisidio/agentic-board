import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type BoardState } from './api';
import { compareQueue } from './queue';

export type Phase = 'loading' | 'home' | 'board';

/** Estado do board: carga inicial, SSE em tempo real e movimentação otimista. */
export function useBoard(notify: (message: string) => void) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [board, setBoard] = useState<BoardState | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [moves, setMoves] = useState<Record<string, { column: string; at: string }>>({}); // otimista: coluna e instante de entrada
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const apply = useCallback((state: BoardState) => {
    setBoard(state);
    setUnavailable(false);
    setPhase('board');
  }, []);

  useEffect(() => {
    api.board().then(apply).catch(() => setPhase('home'));
  }, [apply]);

  useEffect(() => {
    if (phase !== 'board') return;
    const source = new EventSource('/api/events');
    source.addEventListener('board-changed', (e) => apply(JSON.parse((e as MessageEvent<string>).data) as BoardState));
    source.addEventListener('repo-unavailable', () => setUnavailable(true));
    source.addEventListener('repo-closed', () => {
      setBoard(null);
      setMoves({});
      setPhase('home');
    });
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

  async function open(path: string) {
    apply(await api.openRepo(path));
  }

  async function leave() {
    await api.closeRepo().catch(() => undefined);
    setBoard(null);
    setMoves({});
    setUnavailable(false);
    setPhase('home');
  }

  async function move(id: string, columnKey: string, columnName: string) {
    setMoves((m) => ({ ...m, [id]: { column: columnKey, at: new Date().toISOString() } }));
    try {
      apply(await api.moveTask(id, columnName));
    } catch (error) {
      notifyRef.current(`Não foi possível mover ${id}: ${error instanceof ApiError ? error.message : 'erro desconhecido'}`);
    } finally {
      setMoves((m) => {
        const { [id]: _done, ...rest } = m;
        return rest;
      });
    }
  }

  // tasks e contagens já com os movimentos otimistas aplicados
  // movimentos otimistas aplicados; o card movido entra no fim da fila da coluna de destino
  const view = board && (() => {
    const tasks = board.tasks
      .map((t) => (moves[t.id] ? { ...t, column: moves[t.id]!.column, enteredAt: moves[t.id]!.at } : t))
      .sort(compareQueue);
    return {
      ...board,
      tasks,
      columns: board.columns.map((c) => ({ ...c, count: tasks.reduce((n, t) => n + (t.column === c.key ? 1 : 0), 0) })),
    };
  })();

  return { phase, board: view, unavailable, open, leave, move, apply };
}

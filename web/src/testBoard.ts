import type { BoardState, Repo, Task } from './api';
import type { BoardView } from './useBoard';

export const repo = (repoId = 'r1', name = 'repo', color = 'azul', extra: Partial<Repo> = {}): Repo => ({ repoId, name, path: `/x/${name}`, color, count: 0, available: true, ...extra });

/** Monta o BoardView que o Board recebe (tasks filtradas por `hidden`, contadores e totais calculados). */
export function makeView(state: Partial<BoardState> & { tasks: Task[]; columns: { key: string; name: string; count: number }[] }): BoardView {
  const hidden = state.hidden ?? [];
  const shown = state.tasks.filter((t) => !hidden.includes(t.repoId));
  return {
    repos: state.repos ?? [repo()],
    ignored: state.ignored ?? [],
    configError: state.configError,
    hidden,
    allTasks: state.tasks,
    totalTasks: state.tasks.length,
    tasks: shown,
    columns: state.columns.map((c) => ({
      ...c,
      count: shown.filter((t) => t.column === c.key).length,
      total: state.tasks.filter((t) => t.column === c.key).length,
    })),
  };
}

export const boardProps = (over: Record<string, unknown> = {}) => ({
  onMove: () => undefined,
  onApply: () => undefined,
  onReorder: () => undefined,
  onToggleRepo: () => true,
  onOnlyRepo: () => undefined,
  onShowAll: () => undefined,
  onAddRepo: async () => undefined,
  onRemoveRepo: () => undefined,
  onColor: () => undefined,
  notify: () => undefined,
  ...over,
});

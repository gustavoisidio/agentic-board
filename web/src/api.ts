export interface Column { key: string; name: string; count: number; total?: number }
export interface Repo { repoId: string; name: string; path: string; color: string; count: number; available: boolean }
export interface Task { id: string; repoId: string; title: string; status: string; file: string; column: string; enteredAt: string | null; estimated?: true; rev?: string }
export interface TaskDetail extends Task { body: string; extra: Record<string, unknown> }
export interface Ignored { file: string; reason: string; repoId?: string }
export interface BoardState {
  repos: Repo[];
  tasks: Task[];
  columns: Column[];
  ignored: Ignored[];
  hidden: string[]; // repoIds ocultos por padrão (filtro lembrado do conjunto)
  configError?: string;
}
/** Identidade de um card: (repo, id). O mesmo id pode existir em repos diferentes. */
export const taskKey = (t: { repoId: string; id: string }) => `${t.repoId}/${t.id}`;
export const PALETTE = ['azul', 'teal', 'indigo', 'ambar', 'musgo', 'vinho', 'ardosia', 'cobre'] as const;
export interface RenameResult { state: BoardState; changed: string[]; failed: { file: string; repoId: string; reason: string }[] }
export interface Recent { path: string; name: string }

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${url}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Não foi possível falar com o servidor do board');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Erro ${res.status}`);
  return data as T;
}

export const api = {
  capabilities: () => request<{ pickFolder: boolean }>('GET', '/capabilities'),
  pickFolder: () => request<{ path?: string; cancelled?: boolean }>('POST', '/pick-folder'),
  recent: () => request<Recent[]>('GET', '/recent'),
  addRepo: (path: string) => request<BoardState>('POST', '/repos', { path }),
  removeRepo: (repoId: string) => request<BoardState>('DELETE', `/repos/${encodeURIComponent(repoId)}`),
  setColor: (repoId: string, color: string) => request<BoardState>('PUT', `/repos/${encodeURIComponent(repoId)}/color`, { color }),
  setFilter: (hidden: string[]) => request<{ hidden: string[] }>('PUT', '/filter', { hidden }),
  board: () => request<BoardState>('GET', '/board'),
  task: (repoId: string, id: string) => request<TaskDetail>('GET', `/repos/${encodeURIComponent(repoId)}/tasks/${encodeURIComponent(id)}`),
  moveTask: (repoId: string, id: string, status: string) =>
    request<BoardState>('PATCH', `/repos/${encodeURIComponent(repoId)}/tasks/${encodeURIComponent(id)}/status`, { status }),
  createColumn: (name: string) => request<BoardState>('POST', '/columns', { name }),
  reorderColumns: (order: string[]) => request<BoardState>('PATCH', '/columns/order', { order }),
  renameColumn: (key: string, name: string) => request<RenameResult>('PATCH', `/columns/${encodeURIComponent(key)}`, { name }),
  deleteColumn: (key: string) => request<BoardState>('DELETE', `/columns/${encodeURIComponent(key)}`),
};

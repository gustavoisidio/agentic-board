export interface Column { key: string; name: string; count: number }
export interface Task { id: string; title: string; status: string; file: string; column: string; enteredAt: string | null; estimated?: true; rev?: string }
export interface TaskDetail extends Task { body: string; extra: Record<string, unknown> }
export interface Ignored { file: string; reason: string }
export interface BoardState {
  repo: { path: string; name: string };
  tasks: Task[];
  columns: Column[];
  ignored: Ignored[];
  configError?: string;
  unavailable?: boolean;
}
export interface RenameResult { state: BoardState; changed: string[]; failed: { file: string; reason: string }[] }
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
  openRepo: (path: string) => request<BoardState>('POST', '/repo', { path }),
  closeRepo: () => request<void>('DELETE', '/repo'),
  board: () => request<BoardState>('GET', '/board'),
  task: (id: string) => request<TaskDetail>('GET', `/tasks/${encodeURIComponent(id)}`),
  moveTask: (id: string, status: string) => request<BoardState>('PATCH', `/tasks/${encodeURIComponent(id)}/status`, { status }),
  createColumn: (name: string) => request<BoardState>('POST', '/columns', { name }),
  reorderColumns: (order: string[]) => request<BoardState>('PATCH', '/columns/order', { order }),
  renameColumn: (key: string, name: string) => request<RenameResult>('PATCH', `/columns/${encodeURIComponent(key)}`, { name }),
  deleteColumn: (key: string) => request<BoardState>('DELETE', `/columns/${encodeURIComponent(key)}`),
};

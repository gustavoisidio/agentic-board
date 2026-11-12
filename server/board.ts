import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWrite } from './writer.js';
import { naturalCompare, statusKey } from './normalize.js';
import type { Entered } from './queue.js';
import type { Ignored, ScanResult, Task } from './scanner.js';

export interface Column {
  key: string;
  name: string;
  count: number; // cards da coluna em todos os repos abertos (o filtro é só visual, no front)
}
export interface RepoInfo {
  repoId: string; // hash curto do caminho real
  name: string; // nome curto (pasta; desambiguado pela pasta pai quando há nomes iguais)
  path: string;
  color: string;
  count: number;
  available: boolean;
}
export interface BoardTask extends Task {
  repoId: string;
  column: string; // chave normalizada da coluna
  enteredAt: string | null; // quando entrou na coluna atual (fila); null se não se sabe
  estimated?: true; // o instante veio da data do arquivo, não de um movimento visto pelo board
}
export interface BoardState {
  repos: RepoInfo[];
  tasks: BoardTask[];
  columns: Column[];
  ignored: (Ignored & { repoId: string })[];
  hidden: string[]; // repoIds ocultos por padrão (filtro lembrado do conjunto)
  configError?: string;
}

export interface BoardConfig {
  columns: string[];
  error?: string;
}

export const CONFIG_REL = 'specs/.board.json';

export async function readConfig(root: string): Promise<BoardConfig> {
  const file = path.join(root, CONFIG_REL);
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { columns: [] };
    return { columns: [], error: `não foi possível ler ${CONFIG_REL}` };
  }
  try {
    const data = JSON.parse(raw) as { columns?: unknown };
    if (!data || !Array.isArray(data.columns) || !data.columns.every((c) => typeof c === 'string')) throw new Error();
    return { columns: (data.columns as string[]).map((c) => c.trim()).filter(Boolean) };
  } catch {
    return { columns: [], error: `${CONFIG_REL} corrompido: colunas derivadas das tasks` };
  }
}

export async function writeConfig(root: string, columns: string[]): Promise<void> {
  const dir = path.join(root, 'specs');
  await fs.mkdir(dir, { recursive: true });
  await atomicWrite(path.join(root, CONFIG_REL), JSON.stringify({ version: 1, columns }, null, 2) + '\n');
}

/** Fila: o mais antigo na coluna primeiro; empate por id natural, depois repo e arquivo; sem instante conhecido, no fim. */
export function compareQueue(
  a: { id: string; repoId?: string; file?: string; enteredAt: string | null },
  b: { id: string; repoId?: string; file?: string; enteredAt: string | null },
): number {
  const ta = a.enteredAt ? Date.parse(a.enteredAt) : Infinity;
  const tb = b.enteredAt ? Date.parse(b.enteredAt) : Infinity;
  if (ta !== tb) return ta < tb ? -1 : 1;
  return naturalCompare(a.id, b.id) || naturalCompare(a.repoId ?? '', b.repoId ?? '') || naturalCompare(a.file ?? '', b.file ?? '');
}

export interface RepoData {
  info: Omit<RepoInfo, 'count'>;
  scan: ScanResult;
  entered: Entered;
}

/** Monta o board de todos os repos abertos: uma coluna por status normalizado (ordem salva, depois as das tasks). */
export function buildBoard(repos: RepoData[], config: BoardConfig, hidden: string[] = []): BoardState {
  const names = new Map<string, string>(); // key -> nome exibido (primeira ocorrência)
  for (const name of config.columns) {
    const key = statusKey(name);
    if (key && !names.has(key)) names.set(key, name);
  }
  for (const repo of repos) {
    for (const task of repo.scan.tasks) {
      const key = statusKey(task.status);
      if (!names.has(key)) names.set(key, task.status);
    }
  }
  const counts = new Map<string, number>();
  const tasks: BoardTask[] = [];
  const perRepo = new Map<string, number>();
  for (const repo of repos) {
    for (const t of repo.scan.tasks) {
      const column = statusKey(t.status);
      counts.set(column, (counts.get(column) ?? 0) + 1);
      perRepo.set(repo.info.repoId, (perRepo.get(repo.info.repoId) ?? 0) + 1);
      const entry = repo.entered[t.id];
      const known = entry && entry.column === column ? entry : null;
      tasks.push({ ...t, repoId: repo.info.repoId, column, enteredAt: known?.at ?? null, ...(known?.estimated ? { estimated: true as const } : {}) });
    }
  }
  tasks.sort(compareQueue);
  return {
    repos: repos.map((r) => ({ ...r.info, count: perRepo.get(r.info.repoId) ?? 0 })),
    tasks,
    columns: [...names].map(([key, name]) => ({ key, name, count: counts.get(key) ?? 0 })),
    ignored: repos.flatMap((r) => r.scan.ignored.map((i) => ({ ...i, repoId: r.info.repoId }))),
    hidden,
    ...(config.error ? { configError: config.error } : {}),
  };
}

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWrite } from './writer.js';
import { naturalCompare, statusKey } from './normalize.js';
import type { Entered } from './queue.js';
import type { Ignored, ScanResult, Task } from './scanner.js';

export interface Column {
  key: string;
  name: string;
  count: number;
}
export interface BoardTask extends Task {
  column: string; // chave normalizada da coluna
  enteredAt: string | null; // quando entrou na coluna atual (fila); null se não se sabe
  estimated?: true; // o instante veio da data do arquivo, não de um movimento visto pelo board
}
export interface BoardState {
  repo: { path: string; name: string };
  tasks: BoardTask[];
  columns: Column[];
  ignored: Ignored[];
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

/** Fila: o mais antigo na coluna primeiro; empate por id natural; sem instante conhecido, no fim. */
export function compareQueue(a: { id: string; file?: string; enteredAt: string | null }, b: { id: string; file?: string; enteredAt: string | null }): number {
  const ta = a.enteredAt ? Date.parse(a.enteredAt) : Infinity;
  const tb = b.enteredAt ? Date.parse(b.enteredAt) : Infinity;
  if (ta !== tb) return ta < tb ? -1 : 1;
  return naturalCompare(a.id, b.id) || naturalCompare(a.file ?? '', b.file ?? '');
}

/** Monta as colunas (ordem do .board.json, depois as vindas das tasks na ordem em que apareceram). */
export function buildBoard(repoPath: string, scan: ScanResult, config: BoardConfig, entered: Entered = {}): BoardState {
  const names = new Map<string, string>(); // key -> nome exibido (primeira ocorrência)
  for (const name of config.columns) {
    const key = statusKey(name);
    if (key && !names.has(key)) names.set(key, name);
  }
  for (const task of scan.tasks) {
    const key = statusKey(task.status);
    if (!names.has(key)) names.set(key, task.status);
  }
  const counts = new Map<string, number>();
  const tasks: BoardTask[] = scan.tasks.map((t) => {
    const column = statusKey(t.status);
    counts.set(column, (counts.get(column) ?? 0) + 1);
    const entry = entered[t.id];
    const known = entry && entry.column === column ? entry : null;
    return { ...t, column, enteredAt: known?.at ?? null, ...(known?.estimated ? { estimated: true as const } : {}) };
  });
  tasks.sort(compareQueue);
  const columns = [...names].map(([key, name]) => ({ key, name, count: counts.get(key) ?? 0 }));
  return {
    repo: { path: repoPath, name: path.basename(repoPath) || repoPath },
    tasks,
    columns,
    ignored: scan.ignored,
    ...(config.error ? { configError: config.error } : {}),
  };
}

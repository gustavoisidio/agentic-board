import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicWrite } from './writer.js';

const MAX_RECENT = 10;
export const appDir = () => process.env.AGENTIC_BOARD_HOME ?? path.join(os.homedir(), '.agentic-board');
const file = () => path.join(appDir(), 'config.json');

/** `~/.agentic-board/config.json`: repos abertos e cores, recentes, ordem das colunas e filtro por conjunto de repos. */
export interface AppConfig {
  recent: string[];
  repos: { path: string; color: string }[]; // repos abertos, na ordem, com a cor de cada um
  columns: Record<string, string[]>; // por conjunto de repos (modo multi-repo): ordem e colunas criadas à mão
  filters: Record<string, string[]>; // por conjunto: repoIds ocultos (padrão inicial de cada aba)
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const mapOfStrings = (v: unknown): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  if (v && typeof v === 'object') for (const [k, list] of Object.entries(v)) out[k] = strings(list);
  return out;
};

export async function readAppConfig(): Promise<AppConfig> {
  try {
    const data = JSON.parse(await fs.readFile(file(), 'utf8')) as Record<string, unknown>;
    const repos = Array.isArray(data.repos)
      ? data.repos.filter((r): r is { path: string; color: string } => !!r && typeof (r as { path?: unknown }).path === 'string')
          .map((r) => ({ path: r.path, color: typeof r.color === 'string' ? r.color : '' }))
      : [];
    return { recent: strings(data.recent), repos, columns: mapOfStrings(data.columns), filters: mapOfStrings(data.filters) };
  } catch {
    return { recent: [], repos: [], columns: {}, filters: {} };
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** Lê, altera e grava o config de forma serializada (várias gravações ao mesmo tempo não se perdem). */
export function updateAppConfig(change: (config: AppConfig) => void): Promise<void> {
  const run = queue.then(async () => {
    const config = await readAppConfig();
    change(config);
    try {
      await fs.mkdir(appDir(), { recursive: true });
      await atomicWrite(file(), JSON.stringify(config, null, 2) + '\n');
    } catch {
      /* config é conveniência: falha em gravar não impede o board */
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

export const readRecent = async () => (await readAppConfig()).recent;
export const addRecent = (repoPath: string) =>
  updateAppConfig((c) => {
    c.recent = [repoPath, ...c.recent.filter((p) => p !== repoPath)].slice(0, MAX_RECENT);
  });

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);
const TASK_DIRS = new Set(['specs', 'tasks']);

export const isTaskDirName = (name: string) => TASK_DIRS.has(name.toLowerCase());
export const isSkippedDir = (name: string) => IGNORED_DIRS.has(name) || name.startsWith('.');

export function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** O arquivo (resolvido, seguindo symlinks) precisa estar dentro do repo real. Devolve o caminho real. */
export async function assertInsideRepo(realRoot: string, file: string): Promise<string> {
  const real = await fs.realpath(file);
  if (!isInside(realRoot, real)) throw new Error('caminho fora do repositório');
  return real;
}

/** Caminho relativo ao repo contém uma pasta `specs` ou `tasks` (o arquivo é elegível para task)? */
export function inTaskDir(relFile: string): boolean {
  const parts = relFile.split(path.sep).slice(0, -1);
  return parts.some(isTaskDirName) && !parts.some(isSkippedDir);
}

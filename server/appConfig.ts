import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicWrite } from './writer.js';

const MAX_RECENT = 10;
const dir = () => process.env.AGENTIC_BOARD_HOME ?? path.join(os.homedir(), '.agentic-board');
const file = () => path.join(dir(), 'config.json');

export async function readRecent(): Promise<string[]> {
  try {
    const data = JSON.parse(await fs.readFile(file(), 'utf8')) as { recent?: unknown };
    return Array.isArray(data.recent) ? data.recent.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

export async function addRecent(repoPath: string): Promise<void> {
  const recent = [repoPath, ...(await readRecent()).filter((p) => p !== repoPath)].slice(0, MAX_RECENT);
  try {
    await fs.mkdir(dir(), { recursive: true });
    await atomicWrite(file(), JSON.stringify({ recent }, null, 2) + '\n');
  } catch {
    /* recentes são conveniência: falha em gravar não impede abrir o repo */
  }
}

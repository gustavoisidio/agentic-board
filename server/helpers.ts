import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function tmpDir(prefix = 'board-'): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function put(root: string, rel: string, content: string): Promise<void> {
  const file = path.join(root, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

export const task = (id: string, status: string, title = `Task ${id}`, extra = '') =>
  `---\nid: ${id}\ntitle: ${title}\nstatus: ${status}\n${extra}---\n\n# ${id}\n`;

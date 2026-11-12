import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseTask } from './frontmatter.js';
import { isInside, isSkippedDir, isTaskDirName } from './paths.js';

export interface Task {
  id: string;
  title: string;
  status: string;
  file: string; // relativo ao repo, com "/"
  rev?: string; // muda quando o arquivo muda (tamanho + data): faz o board avisar edições do corpo
}
export interface Ignored {
  file: string;
  reason: string;
}
export interface ScanResult {
  tasks: Task[]; // ordem alfabética do caminho
  ignored: Ignored[];
}

async function walk(dir: string, inTaskDir: boolean, out: string[], realRoot: string): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      // só segue symlinks que continuam dentro do repo
      try {
        const real = await fs.realpath(full);
        if (!isInside(realRoot, real)) continue;
        const stat = await fs.stat(real);
        if (stat.isDirectory()) continue; // evita ciclos: diretórios por symlink não são percorridos
        if (stat.isFile() && inTaskDir && entry.name.toLowerCase().endsWith('.md')) out.push(full);
      } catch {
        /* link quebrado */
      }
    } else if (entry.isDirectory()) {
      if (isSkippedDir(entry.name)) continue;
      await walk(full, inTaskDir || isTaskDirName(entry.name), out, realRoot);
    } else if (entry.isFile() && inTaskDir && entry.name.toLowerCase().endsWith('.md')) {
      out.push(full);
    }
  }
}

export async function scanRepo(root: string): Promise<ScanResult> {
  const realRoot = await fs.realpath(root);
  const files: string[] = [];
  await walk(realRoot, false, files, realRoot);
  const rel = files.map((f) => path.relative(realRoot, f).split(path.sep).join('/')).sort();

  const tasks: Task[] = [];
  const ignored: Ignored[] = [];
  const seen = new Map<string, string>();
  for (const file of rel) {
    let content: string;
    try {
      content = await fs.readFile(path.join(realRoot, file), 'utf8');
    } catch (error) {
      ignored.push({ file, reason: `erro de leitura: ${(error as NodeJS.ErrnoException).code ?? 'desconhecido'}` });
      continue;
    }
    const parsed = parseTask(content);
    if (parsed.kind === 'none') continue;
    if (parsed.kind === 'invalid') {
      ignored.push({ file, reason: parsed.reason });
      continue;
    }
    const { id, title, status } = parsed.fields;
    const first = seen.get(id);
    if (first) {
      ignored.push({ file, reason: `id duplicado (já usado em ${first})` });
      continue;
    }
    seen.set(id, file);
    const stat = await fs.stat(path.join(realRoot, file)).catch(() => null);
    tasks.push({ id, title, status, file, ...(stat ? { rev: `${stat.size}-${Math.round(stat.mtimeMs)}` } : {}) });
  }
  return { tasks, ignored };
}

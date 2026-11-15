import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { readTaskDetail, rewriteStatus, RewriteError } from './frontmatter.js';
import { statusKey } from './normalize.js';
import { assertInsideRepo, inTaskDir, isSkippedDir } from './paths.js';
import { readQueue, writeQueue, type Entered } from './queue.js';
import { scanRepo, type ScanResult } from './scanner.js';
import { atomicWrite } from './writer.js';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function toHttp(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if ((error as Error).message === 'caminho fora do repositório') return new HttpError(403, 'Arquivo fora do repositório');
  if (error instanceof RewriteError) return new HttpError(422, error.message);
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'EACCES' || code === 'EPERM') return new HttpError(500, 'Sem permissão para gravar o arquivo');
  if (code === 'ENOENT') return new HttpError(404, 'Arquivo não encontrado');
  return new HttpError(500, (error as Error).message || 'Erro ao gravar o arquivo');
}

export const repoIdOf = (realPath: string) => createHash('sha1').update(realPath).digest('hex').slice(0, 8);

const DEBOUNCE_MS = 150;
const AVAILABILITY_MS = 2000;

/** Um repositório aberto: scanner, fila e watcher próprios. Avisa o workspace quando algo muda no disco. */
export class RepoSession {
  readonly id: string;
  available = true;
  scan: ScanResult = { tasks: [], ignored: [] };
  entered: Entered = {};
  private watcher: FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;
  private poll: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    readonly path: string, // caminho real
    private onEvent: (id: string) => void,
    private clock: () => Date = () => new Date(),
  ) {
    this.id = repoIdOf(path);
  }

  async start(): Promise<void> {
    this.entered = await readQueue(this.path);
    await this.rescan();
    this.poll = setInterval(() => this.onEvent(this.id), AVAILABILITY_MS);
    this.poll.unref();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.poll) clearInterval(this.poll);
    const w = this.watcher;
    this.watcher = null;
    if (w) await w.close();
  }

  /** Relê o disco (tasks e fila). Repo que sumiu fica indisponível, sem tasks, e volta sozinho quando reaparecer. */
  async rescan(): Promise<void> {
    try {
      await fs.access(this.path);
    } catch {
      this.available = false;
      this.scan = { tasks: [], ignored: [] };
      if (this.watcher) {
        const w = this.watcher;
        this.watcher = null;
        await w.close();
      }
      return;
    }
    this.available = true;
    this.scan = await scanRepo(this.path);
    await this.updateQueue();
    this.ensureWatching();
  }

  /**
   * Fila (T-001): sem registro, estima pela data do arquivo; se a task mudou de coluna desde o registro,
   * a entrada é agora (movimento pela tela ou edição externa). Registros de tasks ausentes são mantidos.
   */
  private async updateQueue(): Promise<void> {
    let dirty = false;
    for (const task of this.scan.tasks) {
      const column = statusKey(task.status);
      const current = this.entered[task.id];
      if (current?.column === column) continue;
      dirty = true;
      if (current) {
        this.entered[task.id] = { column, at: this.clock().toISOString() };
        continue;
      }
      try {
        const stat = await fs.stat(path.join(this.path, task.file));
        const when = Number.isNaN(stat.mtimeMs) || stat.mtimeMs <= 0 ? stat.birthtime : stat.mtime;
        this.entered[task.id] = { column, at: when.toISOString(), estimated: true };
      } catch {
        /* sem data legível: sem registro, o card fica no fim da fila */
      }
    }
    if (dirty) await writeQueue(this.path, this.entered);
  }

  private ensureWatching() {
    if (this.watcher || this.stopped) return;
    const root = this.path;
    const watcher = chokidar.watch(root, {
      ignoreInitial: true,
      ignored: (p, stats) => {
        const rel = path.relative(root, p);
        if (!rel) return false;
        const parts = rel.split(path.sep);
        const base = parts[parts.length - 1]!;
        if (parts.slice(0, -1).some(isSkippedDir)) return true;
        if (stats?.isDirectory()) return isSkippedDir(base);
        if (stats?.isFile()) return !(inTaskDir(rel) && (base.toLowerCase().endsWith('.md') || base === '.board.json'));
        return false;
      },
    });
    const schedule = () => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.onEvent(this.id), DEBOUNCE_MS);
    };
    watcher.on('all', schedule).on('error', schedule);
    this.watcher = watcher;
  }

  // ---- leitura e gravação de tasks (sempre dentro do repo e das pastas specs/tasks) -----------

  private async realTaskFile(file: string): Promise<string> {
    const real = await assertInsideRepo(this.path, path.join(this.path, file));
    if (!inTaskDir(path.relative(this.path, real)) || !real.toLowerCase().endsWith('.md')) {
      throw new HttpError(403, 'Arquivo fora das pastas specs/tasks');
    }
    return real;
  }

  async writeTaskStatus(file: string, status: string): Promise<void> {
    try {
      const real = await this.realTaskFile(file);
      await atomicWrite(real, rewriteStatus(await fs.readFile(real, 'utf8'), status));
    } catch (error) {
      throw toHttp(error);
    }
  }

  async taskDetail(id: string) {
    const task = this.scan.tasks.find((t) => t.id === id);
    if (!task) throw new HttpError(404, 'Task não encontrada');
    let content: string;
    try {
      content = await fs.readFile(await this.realTaskFile(task.file), 'utf8');
    } catch (error) {
      throw toHttp(error);
    }
    const detail = readTaskDetail(content);
    if (!detail) throw new HttpError(422, 'Frontmatter da task não encontrado');
    return { ...task, ...detail };
  }

  /** Renomear coluna não é entrar nela: troca a chave do registro (antes de gravar, para o watcher não ver "movimento"). */
  setEnteredColumn(taskId: string, column: string) {
    const entry = this.entered[taskId];
    if (entry) entry.column = column;
  }
  saveQueue() {
    return writeQueue(this.path, this.entered);
  }
}

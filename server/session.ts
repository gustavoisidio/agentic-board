import { promises as fs } from 'node:fs';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { buildBoard, readConfig, writeConfig, type BoardState } from './board.js';
import { readTaskDetail, rewriteStatus, RewriteError } from './frontmatter.js';
import { statusKey } from './normalize.js';
import { readQueue, writeQueue, type Entered } from './queue.js';
import { assertInsideRepo, inTaskDir, isSkippedDir } from './paths.js';
import { scanRepo } from './scanner.js';
import { atomicWrite } from './writer.js';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type SessionEvent = { type: 'board-changed'; state: BoardState } | { type: 'repo-unavailable' } | { type: 'repo-closed' };
type Listener = (event: SessionEvent) => void;

const DEBOUNCE_MS = 150;
const AVAILABILITY_MS = 2000;

/** Repositório aberto: estado do board, watcher e assinantes do SSE. */
export class Session {
  constructor(private clock: () => Date = () => new Date()) {}

  private state: BoardState | null = null;
  private watcher: FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;
  private poll: NodeJS.Timeout | null = null;
  private refreshing: Promise<void> | null = null;
  private dirty = false;
  private unavailable = false;
  private listeners = new Set<Listener>();
  private entered: Entered = {};
  private realRoot = '';
  private root = '';

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private emit(event: SessionEvent) {
    for (const l of this.listeners) l(event);
  }

  isOpen = () => this.state !== null;
  isUnavailable = () => this.unavailable;
  current(): BoardState {
    if (!this.state) throw new HttpError(409, 'Nenhum repositório aberto');
    return this.state;
  }

  async open(input: string): Promise<BoardState> {
    let real: string;
    try {
      real = await fs.realpath(input);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EACCES') throw new HttpError(400, 'Sem permissão para acessar esse caminho');
      throw new HttpError(400, 'Esse caminho não existe');
    }
    const stat = await fs.stat(real);
    if (!stat.isDirectory()) throw new HttpError(400, 'Esse caminho não é uma pasta');
    try {
      await fs.access(real, fs.constants.R_OK | fs.constants.X_OK);
    } catch {
      throw new HttpError(400, 'Sem permissão para ler essa pasta');
    }
    await this.close();
    this.root = input;
    this.realRoot = real;
    this.unavailable = false;
    this.entered = await readQueue(real);
    this.state = await this.compute();
    this.startWatching();
    // quem já está com o board aberto (outra aba ou aparelho) precisa saber que o repositório mudou
    this.emit({ type: 'board-changed', state: this.state });
    return this.state;
  }

  async close(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    if (this.poll) clearInterval(this.poll);
    this.timer = this.poll = null;
    const w = this.watcher;
    this.watcher = null;
    this.state = null;
    this.unavailable = false;
    if (w) await w.close();
  }

  /** Fecha o repositório avisando os clientes conectados (a tela deles volta para a inicial). */
  async closeAndNotify(): Promise<void> {
    const wasOpen = this.state !== null;
    await this.close();
    if (wasOpen) this.emit({ type: 'repo-closed' });
  }

  private async compute(): Promise<BoardState> {
    const [scan, config] = await Promise.all([scanRepo(this.realRoot), readConfig(this.realRoot)]);
    await this.updateQueue(scan.tasks);
    return buildBoard(this.realRoot, scan, config, this.entered);
  }

  /**
   * Fila (T-001): sem registro, estima pela data do arquivo; se a task mudou de coluna desde o registro,
   * a entrada é agora (movimento pela tela ou edição externa). Registros de tasks ausentes são mantidos.
   */
  private async updateQueue(tasks: { id: string; status: string; file: string }[]): Promise<void> {
    let dirty = false;
    for (const task of tasks) {
      const column = statusKey(task.status);
      const current = this.entered[task.id];
      if (current?.column === column) continue;
      dirty = true;
      if (current) {
        this.entered[task.id] = { column, at: this.clock().toISOString() };
        continue;
      }
      try {
        const stat = await fs.stat(path.join(this.realRoot, task.file));
        const when = Number.isNaN(stat.mtimeMs) || stat.mtimeMs <= 0 ? stat.birthtime : stat.mtime;
        this.entered[task.id] = { column, at: when.toISOString(), estimated: true };
      } catch {
        /* sem data legível: sem registro, o card fica no fim da fila */
      }
    }
    if (dirty) await writeQueue(this.realRoot, this.entered);
  }

  /** Relê o disco; emite só se o estado realmente mudou (isso suprime o eco das próprias gravações). */
  async refresh(): Promise<BoardState> {
    if (this.refreshing) {
      this.dirty = true;
      await this.refreshing;
      if (!this.dirty) return this.current();
    }
    this.dirty = false;
    const run = (async () => {
      try {
        await fs.access(this.realRoot);
      } catch {
        if (!this.unavailable) {
          this.unavailable = true;
          this.emit({ type: 'repo-unavailable' });
        }
        return;
      }
      const next = await this.compute();
      const changed = JSON.stringify(next) !== JSON.stringify(this.state);
      const recovered = this.unavailable;
      this.unavailable = false;
      if (changed || recovered) {
        this.state = next;
        this.emit({ type: 'board-changed', state: next });
      }
    })();
    this.refreshing = run;
    try {
      await run;
    } finally {
      this.refreshing = null;
    }
    return this.current();
  }

  private startWatching() {
    const root = this.realRoot;
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
      this.timer = setTimeout(() => void this.refresh().catch(() => undefined), DEBOUNCE_MS);
    };
    watcher.on('all', schedule).on('error', schedule);
    this.watcher = watcher;
    this.poll = setInterval(() => void this.refresh().catch(() => undefined), AVAILABILITY_MS);
    this.poll.unref();
  }

  // ---- gravações ---------------------------------------------------------------------------

  private async writeTaskStatus(file: string, status: string): Promise<void> {
    const real = await assertInsideRepo(this.realRoot, path.join(this.realRoot, file));
    if (!inTaskDir(path.relative(this.realRoot, real)) || !real.toLowerCase().endsWith('.md')) {
      throw new HttpError(403, 'Arquivo fora das pastas specs/tasks');
    }
    const content = await fs.readFile(real, 'utf8');
    await atomicWrite(real, rewriteStatus(content, status));
  }

  /** Conteúdo da task para o modal: lê só o .md dessa task, dentro do repo aberto e das pastas specs/tasks. */
  async taskDetail(id: string) {
    const task = this.current().tasks.find((t) => t.id === id);
    if (!task) throw new HttpError(404, 'Task não encontrada');
    let content: string;
    try {
      const real = await assertInsideRepo(this.realRoot, path.join(this.realRoot, task.file));
      if (!inTaskDir(path.relative(this.realRoot, real)) || !real.toLowerCase().endsWith('.md')) {
        throw new HttpError(403, 'Arquivo fora das pastas specs/tasks');
      }
      content = await fs.readFile(real, 'utf8');
    } catch (error) {
      throw toHttp(error);
    }
    const detail = readTaskDetail(content);
    if (!detail) throw new HttpError(422, 'Frontmatter da task não encontrado');
    return { ...task, ...detail };
  }

  async moveTask(id: string, status: string): Promise<BoardState> {
    const state = this.current();
    const task = state.tasks.find((t) => t.id === id);
    if (!task) throw new HttpError(404, 'Task não encontrada');
    const column = state.columns.find((c) => c.key === statusKey(String(status ?? '')));
    if (!column) throw new HttpError(400, 'Coluna de destino não existe');
    if (task.column === column.key && task.status === column.name) return state;
    try {
      await this.writeTaskStatus(task.file, column.name);
    } catch (error) {
      throw toHttp(error);
    }
    return this.refresh();
  }

  private async persistColumns(names: string[]) {
    await writeConfig(this.realRoot, names);
  }

  async createColumn(rawName: string): Promise<BoardState> {
    const name = String(rawName ?? '').trim();
    if (!name) throw new HttpError(400, 'Informe o nome da coluna');
    const state = this.current();
    if (state.columns.some((c) => c.key === statusKey(name))) throw new HttpError(409, 'Essa coluna já existe');
    await this.persistColumns([...state.columns.map((c) => c.name), name]);
    return this.refresh();
  }

  async renameColumn(key: string, rawName: string): Promise<{ state: BoardState; changed: string[]; failed: { file: string; reason: string }[] }> {
    const name = String(rawName ?? '').trim();
    if (!name) throw new HttpError(400, 'Informe o nome da coluna');
    const state = this.current();
    const column = state.columns.find((c) => c.key === key);
    if (!column) throw new HttpError(404, 'Coluna não encontrada');
    const newKey = statusKey(name);
    if (state.columns.some((c) => c.key === newKey && c.key !== key)) throw new HttpError(409, 'Já existe uma coluna com esse nome');

    const changed: string[] = [];
    const failed: { file: string; reason: string }[] = [];
    for (const task of state.tasks.filter((t) => t.column === key)) {
      // renomear não é entrar na coluna: a chave do registro muda antes da gravação, para o watcher não ver "movimento"
      const entry = this.entered[task.id];
      if (entry && newKey !== key) entry.column = newKey;
      try {
        await this.writeTaskStatus(task.file, name);
        changed.push(task.file);
      } catch (error) {
        if (entry && newKey !== key) entry.column = key;
        failed.push({ file: task.file, reason: toHttp(error).message });
      }
    }
    await this.persistColumns(state.columns.map((c) => (c.key === key ? name : c.name)));
    await writeQueue(this.realRoot, this.entered);
    return { state: await this.refresh(), changed, failed };
  }

  async deleteColumn(key: string): Promise<BoardState> {
    const state = this.current();
    const column = state.columns.find((c) => c.key === key);
    if (!column) throw new HttpError(404, 'Coluna não encontrada');
    if (column.count > 0) throw new HttpError(409, 'Mova as tasks antes de excluir');
    await this.persistColumns(state.columns.filter((c) => c.key !== key).map((c) => c.name));
    return this.refresh();
  }
}

function toHttp(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if ((error as Error).message === 'caminho fora do repositório') return new HttpError(403, 'Arquivo fora do repositório');
  if (error instanceof RewriteError) return new HttpError(422, error.message);
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'EACCES' || code === 'EPERM') return new HttpError(500, 'Sem permissão para gravar o arquivo');
  if (code === 'ENOENT') return new HttpError(404, 'Arquivo não encontrado');
  return new HttpError(500, (error as Error).message || 'Erro ao gravar o arquivo');
}

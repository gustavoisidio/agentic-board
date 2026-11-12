import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildBoard, readConfig, writeConfig, type BoardConfig, type BoardState } from './board.js';
import { readAppConfig, addRecent, updateAppConfig, type AppConfig } from './appConfig.js';
import { statusKey } from './normalize.js';
import { isColor, nextColor } from './palette.js';
import { HttpError, RepoSession, repoIdOf } from './repoSession.js';

export { HttpError };
export type WorkspaceEvent = { type: 'board-changed'; state: BoardState };
type Listener = (event: WorkspaceEvent) => void;

/** Repos abertos ao mesmo tempo: estado unificado do board, colunas por status, cores, filtro e eventos em tempo real. */
export class Workspace {
  private repos: RepoSession[] = [];
  private cfg: AppConfig = { recent: [], repos: [], columns: {}, filters: {}, };
  private state: BoardState = { repos: [], tasks: [], columns: [], ignored: [], hidden: [] };
  private listeners = new Set<Listener>();
  private chain: Promise<unknown> = Promise.resolve();
  private ready: Promise<void> | null = null;

  constructor(private clock: () => Date = () => new Date()) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private emit(state: BoardState) {
    for (const l of this.listeners) l({ type: 'board-changed', state });
  }

  /** Reabre os repos lembrados no config (repo que sumiu fica como indisponível, sem derrubar os outros). */
  init(): Promise<void> {
    this.ready ??= (async () => {
      this.cfg = await readAppConfig();
      for (const saved of this.cfg.repos) {
        if (this.repos.some((r) => r.id === repoIdOf(saved.path))) continue;
        const repo = new RepoSession(saved.path, (id) => void this.refresh(id).catch(() => undefined), this.clock);
        this.repos.push(repo);
        await repo.start();
      }
      this.state = await this.compute();
    })();
    return this.ready;
  }

  isOpen = () => this.repos.length > 0;
  current(): BoardState {
    return this.state;
  }

  async close(): Promise<void> {
    await Promise.all(this.repos.map((r) => r.stop()));
    this.repos = [];
    this.state = { repos: [], tasks: [], columns: [], ignored: [], hidden: [] };
  }

  // ---- estado ------------------------------------------------------------------------------

  private setKey(): string {
    const paths = this.repos.map((r) => r.path).sort();
    return createHash('sha1').update(paths.join('\n')).digest('hex').slice(0, 12);
  }

  /** Nome curto: pasta; se dois repos tiverem o mesmo nome, desambigua com a pasta pai. */
  private names(): Map<string, string> {
    const base = (p: string) => path.basename(p) || p;
    const count = new Map<string, number>();
    for (const r of this.repos) count.set(base(r.path), (count.get(base(r.path)) ?? 0) + 1);
    return new Map(this.repos.map((r) => [r.id, count.get(base(r.path))! > 1 ? `${base(r.path)} (${base(path.dirname(r.path))})` : base(r.path)]));
  }

  private colorOf(repo: RepoSession): string {
    return this.cfg.repos.find((c) => repoIdOf(c.path) === repo.id)?.color || 'azul';
  }

  /** Ordem das colunas: 1 repo usa o `specs/.board.json` dele; 2 ou mais usam o config do app, por conjunto de repos. */
  private async columnConfig(): Promise<BoardConfig> {
    if (this.repos.length === 0) return { columns: [] };
    if (this.repos.length === 1) return readConfig(this.repos[0]!.path);
    const saved = this.cfg.columns[this.setKey()];
    if (saved) return { columns: saved };
    // conjunto novo: semeia com as colunas dos .board.json dos repos (sem gravar nada neles)
    const seen = new Set<string>();
    const columns: string[] = [];
    for (const repo of this.repos) {
      for (const name of (await readConfig(repo.path)).columns) {
        if (!seen.has(statusKey(name))) {
          seen.add(statusKey(name));
          columns.push(name);
        }
      }
    }
    return { columns };
  }

  private async saveColumns(names: string[]): Promise<void> {
    if (this.repos.length === 1) return writeConfig(this.repos[0]!.path, names);
    const key = this.setKey();
    this.cfg.columns[key] = names;
    await updateAppConfig((c) => {
      c.columns[key] = names;
    });
  }

  private async compute(): Promise<BoardState> {
    const names = this.names();
    const hidden = (this.cfg.filters[this.setKey()] ?? []).filter((id) => this.repos.some((r) => r.id === id));
    return buildBoard(
      this.repos.map((r) => ({
        info: { repoId: r.id, name: names.get(r.id)!, path: r.path, color: this.colorOf(r), available: r.available },
        scan: r.scan,
        entered: r.entered,
      })),
      await this.columnConfig(),
      hidden,
    );
  }

  /** Relê o disco (um repo ou todos) e emite só se o estado mudou: isso suprime o eco das próprias gravações. */
  refresh(repoId?: string): Promise<BoardState> {
    const run = this.chain.then(async () => {
      const targets = repoId ? this.repos.filter((r) => r.id === repoId) : this.repos;
      await Promise.all(targets.map((r) => r.rescan()));
      return this.publish();
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async publish(): Promise<BoardState> {
    const next = await this.compute();
    if (JSON.stringify(next) !== JSON.stringify(this.state)) {
      this.state = next;
      this.emit(next);
    }
    return this.state;
  }

  // ---- repositórios ------------------------------------------------------------------------

  async addRepo(input: string): Promise<BoardState> {
    await this.init();
    let real: string;
    try {
      real = await fs.realpath(input);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EACCES') throw new HttpError(400, 'Sem permissão para acessar esse caminho');
      throw new HttpError(400, 'Esse caminho não existe');
    }
    if (!(await fs.stat(real)).isDirectory()) throw new HttpError(400, 'Esse caminho não é uma pasta');
    try {
      await fs.access(real, fs.constants.R_OK | fs.constants.X_OK);
    } catch {
      throw new HttpError(400, 'Sem permissão para ler essa pasta');
    }
    if (this.repos.some((r) => r.path === real)) throw new HttpError(409, 'Esse repositório já está aberto');

    const color = nextColor(this.repos.map((r) => this.colorOf(r)));
    const repo = new RepoSession(real, (id) => void this.refresh(id).catch(() => undefined), this.clock);
    await repo.start();
    this.repos.push(repo);
    this.cfg.repos.push({ path: real, color });
    await updateAppConfig((c) => {
      if (!c.repos.some((r) => r.path === real)) c.repos.push({ path: real, color });
    });
    await addRecent(real);
    return this.refresh();
  }

  /** Abre o repo só se ainda não estiver aberto (usado pela rota antiga POST /repo). */
  async ensureRepo(input: string): Promise<BoardState> {
    try {
      return await this.addRepo(input);
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) return this.current();
      throw error;
    }
  }

  private find(repoId: string): RepoSession {
    const repo = this.repos.find((r) => r.id === repoId);
    if (!repo) throw new HttpError(404, 'Repositório não encontrado');
    return repo;
  }

  async removeRepo(repoId: string): Promise<BoardState> {
    await this.init();
    const repo = this.find(repoId);
    await repo.stop();
    this.repos = this.repos.filter((r) => r !== repo);
    this.cfg.repos = this.cfg.repos.filter((r) => repoIdOf(r.path) !== repoId);
    await updateAppConfig((c) => {
      c.repos = c.repos.filter((r) => repoIdOf(r.path) !== repoId);
    });
    return this.refresh();
  }

  async setColor(repoId: string, color: unknown): Promise<BoardState> {
    if (!isColor(color)) throw new HttpError(400, 'Cor inválida');
    const repo = this.find(repoId);
    const apply = (c: AppConfig) => {
      const saved = c.repos.find((r) => repoIdOf(r.path) === repo.id);
      if (saved) saved.color = color;
    };
    apply(this.cfg);
    await updateAppConfig(apply);
    return this.refresh();
  }

  /** Filtro de repos: padrão inicial das abas (lembrado por conjunto de repos). Não emite: o filtro é por aba. */
  async setFilter(hidden: unknown): Promise<string[]> {
    if (!Array.isArray(hidden) || !hidden.every((h) => typeof h === 'string')) throw new HttpError(400, 'Informe os repositórios ocultos');
    const ids = [...new Set(hidden as string[])].filter((id) => this.repos.some((r) => r.id === id));
    if (this.repos.length > 0 && ids.length >= this.repos.length) throw new HttpError(400, 'Mantenha ao menos um repositório visível');
    const key = this.setKey();
    this.cfg.filters[key] = ids;
    this.state = { ...this.state, hidden: ids }; // sem emitir: o filtro é por aba
    await updateAppConfig((c) => {
      c.filters[key] = ids;
    });
    return ids;
  }

  // ---- tasks ---------------------------------------------------------------------------------

  /** Busca pela rota antiga (sem repo): vale quando o id é único entre os repos abertos. */
  resolveLegacy(taskId: string): string {
    const owners = this.state.tasks.filter((t) => t.id === taskId);
    if (owners.length === 0) throw new HttpError(404, 'Task não encontrada');
    if (owners.length > 1) throw new HttpError(409, 'Id repetido em mais de um repositório: use /api/repos/:repoId/tasks/:id');
    return owners[0]!.repoId;
  }

  async taskDetail(repoId: string, id: string) {
    const repo = this.find(repoId);
    return { ...(await repo.taskDetail(id)), repoId };
  }

  async moveTask(repoId: string, id: string, status: unknown): Promise<BoardState> {
    const repo = this.find(repoId);
    const task = this.state.tasks.find((t) => t.repoId === repoId && t.id === id);
    if (!task) throw new HttpError(404, 'Task não encontrada');
    const column = this.state.columns.find((c) => c.key === statusKey(String(status ?? '')));
    if (!column) throw new HttpError(400, 'Coluna de destino não existe');
    if (task.column === column.key && task.status === column.name) return this.state;
    await repo.writeTaskStatus(task.file, column.name);
    return this.refresh(repoId);
  }

  // ---- colunas (unificadas entre os repos) -----------------------------------------------------

  async createColumn(rawName: unknown): Promise<BoardState> {
    const name = String(rawName ?? '').trim();
    if (!name) throw new HttpError(400, 'Informe o nome da coluna');
    if (this.state.columns.some((c) => c.key === statusKey(name))) throw new HttpError(409, 'Essa coluna já existe');
    await this.saveColumns([...this.state.columns.map((c) => c.name), name]);
    return this.refresh();
  }

  async reorderColumns(order: unknown): Promise<BoardState> {
    if (!Array.isArray(order) || order.length === 0 || !order.every((o) => typeof o === 'string')) {
      throw new HttpError(400, 'Informe a ordem das colunas');
    }
    const state = this.state;
    const byKey = new Map(state.columns.map((c) => [c.key, c]));
    const wanted: string[] = [];
    for (const entry of order as string[]) {
      const key = statusKey(entry);
      if (!byKey.has(key)) throw new HttpError(400, `Coluna inexistente: ${entry}`);
      if (wanted.includes(key)) throw new HttpError(400, `Coluna repetida: ${entry}`);
      wanted.push(key);
    }
    const final = [...wanted, ...state.columns.map((c) => c.key).filter((k) => !wanted.includes(k))];
    if (final.every((k, i) => k === state.columns[i]!.key)) return state;
    await this.saveColumns(final.map((k) => byKey.get(k)!.name));
    return this.refresh();
  }

  async renameColumn(key: string, rawName: unknown) {
    const name = String(rawName ?? '').trim();
    if (!name) throw new HttpError(400, 'Informe o nome da coluna');
    const state = this.state;
    if (!state.columns.some((c) => c.key === key)) throw new HttpError(404, 'Coluna não encontrada');
    const newKey = statusKey(name);
    if (state.columns.some((c) => c.key === newKey && c.key !== key)) throw new HttpError(409, 'Já existe uma coluna com esse nome');

    const changed: string[] = [];
    const failed: { file: string; repoId: string; reason: string }[] = [];
    for (const task of state.tasks.filter((t) => t.column === key)) {
      const repo = this.find(task.repoId);
      const entry = repo.entered[task.id];
      // renomear não é entrar na coluna: a chave do registro muda antes da gravação
      if (entry && newKey !== key) repo.setEnteredColumn(task.id, newKey);
      try {
        await repo.writeTaskStatus(task.file, name);
        changed.push(task.file);
      } catch (error) {
        if (entry && newKey !== key) repo.setEnteredColumn(task.id, key);
        failed.push({ file: task.file, repoId: task.repoId, reason: (error as Error).message });
      }
    }
    await this.saveColumns(state.columns.map((c) => (c.key === key ? name : c.name)));
    await Promise.all(this.repos.map((r) => r.saveQueue()));
    return { state: await this.refresh(), changed, failed };
  }

  /** Só exclui se a coluna estiver vazia em todos os repos abertos (o filtro de visualização não conta). */
  async deleteColumn(key: string): Promise<BoardState> {
    const column = this.state.columns.find((c) => c.key === key);
    if (!column) throw new HttpError(404, 'Coluna não encontrada');
    if (column.count > 0) throw new HttpError(409, 'Mova as tasks antes de excluir');
    await this.saveColumns(this.state.columns.filter((c) => c.key !== key).map((c) => c.name));
    return this.refresh();
  }
}

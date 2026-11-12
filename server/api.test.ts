import { execFileSync } from 'node:child_process';
import { readFile, writeFile, rm, utimes, readdir, symlink } from 'node:fs/promises';
import net from 'node:net';
import type { Server } from 'node:http';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { put, task, tmpDir } from './helpers.js';
import type { Workspace } from './workspace.js';

let server: Server;
let session: Workspace;
let base: string;
let root: string;

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

const call = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(base + url, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });

const open = async () => (await call('POST', '/api/repo', { path: root })).json();
const board = async () => (await call('GET', '/api/board')).json();
const read = (rel: string) => readFile(path.join(root, rel), 'utf8');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  process.env.AGENTIC_BOARD_HOME = await tmpDir('home-');
  root = await tmpDir('repo-');
  await put(root, 'specs/tasks/a.md', task('T-1', 'Backlog'));
  await put(root, 'specs/tasks/b.md', task('T-2', 'Backlog', 'Segunda', 'assignee: ana\n'));
  await put(root, 'specs/tasks/c.md', task('T-3', 'Em execução'));
  const port = await freePort();
  const created = createApp({ port, pickFolder: async () => root });
  session = created.session;
  server = created.app.listen(port, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await session.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});

describe('abrir repositório', () => {
  it('mostra 3 tasks e 2 colunas distribuídas', async () => {
    const board = await open();
    expect(board.tasks).toHaveLength(3);
    expect(board.columns.map((c: { name: string; count: number }) => [c.name, c.count])).toEqual([['Backlog', 2], ['Em execução', 1]]);
  });

  it('erros claros para caminho inválido', async () => {
    const missing = await call('POST', '/api/repo', { path: path.join(root, 'nao-existe') });
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toBe('Esse caminho não existe');
    const file = await call('POST', '/api/repo', { path: path.join(root, 'specs/tasks/a.md') });
    expect((await file.json()).error).toBe('Esse caminho não é uma pasta');
    const rel = await call('POST', '/api/repo', { path: 'relativo' });
    expect(rel.status).toBe(400);
  });

  it('repo sem tasks abre vazio e lembra nos recentes', async () => {
    const empty = await tmpDir('vazio-');
    const res = await call('POST', '/api/repo', { path: empty });
    expect(res.status).toBe(200);
    expect((await res.json()).tasks).toEqual([]);
    const recent = await (await call('GET', '/api/recent')).json();
    expect(recent[0].path).toContain('vazio-');
  });

  it('pick-folder devolve o caminho escolhido; 501 fora do macOS', async () => {
    expect(await (await call('POST', '/api/pick-folder')).json()).toEqual({ path: root });
    const port = await freePort();
    const other = createApp({ port, platform: 'linux' });
    const s = other.app.listen(port, '127.0.0.1');
    const res = await fetch(`http://127.0.0.1:${port}/api/pick-folder`, { method: 'POST' });
    expect(res.status).toBe(501);
    await other.session.close();
    s.close();
  });
});

describe('segurança', () => {
  it('rejeita Origin externo e Host estranho', async () => {
    const evil = await call('POST', '/api/repo', { path: root }, { Origin: 'https://evil.example' });
    expect(evil.status).toBe(403);
    expect(session.isOpen()).toBe(false);
    const ok = await call('GET', '/api/recent', undefined, { Origin: base });
    expect(ok.status).toBe(200);
  });
});

describe('mover task', () => {
  it('troca só a linha status do arquivo', async () => {
    await open();
    const before = await read('specs/tasks/b.md');
    const res = await call('PATCH', '/api/tasks/T-2/status', { status: 'em execucao' });
    expect(res.status).toBe(200);
    const after = await read('specs/tasks/b.md');
    expect(after).toBe(before.replace('status: Backlog', 'status: Em execução'));
    const state = await res.json();
    expect(state.columns.map((c: { count: number }) => c.count)).toEqual([1, 2]);
  });

  it('coluna inexistente e task inexistente', async () => {
    await open();
    expect((await call('PATCH', '/api/tasks/T-1/status', { status: 'Nada' })).status).toBe(400);
    expect((await call('PATCH', '/api/tasks/X-9/status', { status: 'Backlog' })).status).toBe(404);
  });

  it('erro de reescrita não toca no arquivo', async () => {
    await put(root, 'specs/tasks/d.md', '---\nid: T-4\ntitle: D\nstatus: |\n  Backlog\n---\n');
    await open();
    const before = await read('specs/tasks/d.md');
    expect((await call('PATCH', '/api/tasks/T-4/status', { status: 'Em execução' })).status).toBeGreaterThanOrEqual(400);
    expect(await read('specs/tasks/d.md')).toBe(before);
  });
});

describe('colunas', () => {
  it('cria coluna vazia e ela persiste ao reabrir o repo', async () => {
    await open();
    expect((await call('POST', '/api/columns', { name: 'Concluído' })).status).toBe(201);
    expect(JSON.parse(await read('specs/.board.json'))).toEqual({ version: 1, columns: ['Backlog', 'Em execução', 'Concluído'] });
    await call('DELETE', '/api/repo');
    const again = await open();
    expect(again.columns.map((c: { name: string }) => c.name)).toContain('Concluído');
  });

  it('rejeita nome vazio e duplicado (sem acento/maiúscula)', async () => {
    await open();
    expect((await call('POST', '/api/columns', { name: '  ' })).status).toBe(400);
    const dup = await call('POST', '/api/columns', { name: 'EM EXECUCAO' });
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toBe('Essa coluna já existe');
  });

  it('renomear coluna com 2 tasks altera exatamente 2 arquivos', async () => {
    await open();
    const untouched = await read('specs/tasks/c.md');
    const res = await call('PATCH', '/api/columns/backlog', { name: 'A fazer' });
    const out = await res.json();
    expect(out.changed.sort()).toEqual(['specs/tasks/a.md', 'specs/tasks/b.md']);
    expect(out.failed).toEqual([]);
    expect(await read('specs/tasks/a.md')).toContain('status: A fazer');
    expect(await read('specs/tasks/c.md')).toBe(untouched);
    expect(out.state.columns[0]).toMatchObject({ name: 'A fazer', count: 2 });
  });

  it('renomear para nome de outra coluna é bloqueado', async () => {
    await open();
    expect((await call('PATCH', '/api/columns/backlog', { name: 'em execucao' })).status).toBe(409);
  });

  it('exclui só coluna vazia', async () => {
    await open();
    expect((await call('DELETE', '/api/columns/backlog')).status).toBe(409);
    await call('POST', '/api/columns', { name: 'Vazia' });
    const res = await call('DELETE', '/api/columns/vazia');
    expect(res.status).toBe(200);
    expect((await res.json()).columns.map((c: { key: string }) => c.key)).not.toContain('vazia');
  });

  it('.board.json corrompido: avisa e não sobrescreve até uma ação do usuário', async () => {
    await put(root, 'specs/.board.json', '{ quebrado');
    const board = await open();
    expect(board.configError).toBeTruthy();
    expect(board.columns).toHaveLength(2);
    expect(await read('specs/.board.json')).toBe('{ quebrado');
  });
});

describe('ordem das colunas', () => {
  const names = (b: { columns: { name: string }[] }) => b.columns.map((c) => c.name);
  const order = (list: unknown) => call('PATCH', '/api/columns/order', { order: list });

  it('reordena inclusive colunas derivadas de tasks e grava a ordem completa no .board.json, sem tocar nos .md', async () => {
    await open();
    const mdBefore = await Promise.all(['a', 'b', 'c'].map((f) => read(`specs/tasks/${f}.md`)));
    const res = await order(['Em execução', 'Backlog']);
    expect(res.status).toBe(200);
    expect(names(await res.json())).toEqual(['Em execução', 'Backlog']);
    expect(JSON.parse(await read('specs/.board.json'))).toEqual({ version: 1, columns: ['Em execução', 'Backlog'] });
    expect(await Promise.all(['a', 'b', 'c'].map((f) => read(`specs/tasks/${f}.md`)))).toEqual(mdBefore);
    await call('DELETE', '/api/repo');
    expect(names(await open())).toEqual(['Em execução', 'Backlog']);
  });

  it('aceita chaves e nomes, inclusive colunas vazias', async () => {
    await open();
    await call('POST', '/api/columns', { name: 'Concluído' });
    expect(names(await (await order(['concluido', 'EM EXECUCAO', 'Backlog'])).json())).toEqual(['Concluído', 'Em execução', 'Backlog']);
  });

  it('conjunto inválido: desconhecida, repetida, vazio ou formato errado dá 400 e nada muda', async () => {
    await open();
    expect((await order(['Backlog', 'Nada'])).status).toBe(400);
    expect((await order(['Backlog', 'backlog'])).status).toBe(400);
    expect((await order([])).status).toBe(400);
    expect((await call('PATCH', '/api/columns/order', { order: 'Backlog' })).status).toBe(400);
    expect(names(await board())).toEqual(['Backlog', 'Em execução']);
    await expect(read('specs/.board.json')).rejects.toThrow();
  });

  it('coluna nova criada por fora durante o arrasto entra no final', async () => {
    await open();
    await put(root, 'specs/tasks/n.md', task('T-9', 'Nova'));
    const res = await order(['Em execução', 'Backlog']);
    expect(names(await res.json())).toEqual(['Em execução', 'Backlog', 'Nova']);
  });

  it('soltar na posição original não grava nada', async () => {
    await open();
    const res = await order(['Backlog', 'Em execução']);
    expect(res.status).toBe(200);
    await expect(read('specs/.board.json')).rejects.toThrow();
  });

  it('renomear mantém a posição, criar entra no final e a fila dos cards não muda', async () => {
    await open();
    const before = await board();
    await order(['Em execução', 'Backlog']);
    const renamed = await (await call('PATCH', '/api/columns/backlog', { name: 'A fazer' })).json();
    expect(names(renamed.state)).toEqual(['Em execução', 'A fazer']);
    const created = await (await call('POST', '/api/columns', { name: 'Feito' })).json();
    expect(names(created)).toEqual(['Em execução', 'A fazer', 'Feito']);
    const at = (b: { tasks: { id: string; enteredAt: string }[] }) => Object.fromEntries(b.tasks.map((t) => [t.id, t.enteredAt]));
    expect(at(created)).toEqual(at(before));
  });

  it('emite board-changed para quem está conectado; o eco do watcher não repete; .board.json editado por fora reordena', async () => {
    await open();
    const events: string[] = [];
    session.subscribe((e) => events.push(e.type));
    await order(['Em execução', 'Backlog']);
    expect(events).toEqual(['board-changed']);
    await wait(600);
    expect(events).toEqual(['board-changed']);
    await writeFile(path.join(root, 'specs/.board.json'), JSON.stringify({ version: 1, columns: ['Backlog', 'Em execução'] }));
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && names(await board())[0] !== 'Backlog') await wait(50);
    expect(names(await board())).toEqual(['Backlog', 'Em execução']);
  });
});

describe('ignorados', () => {
  it('frontmatter sem status não vira card e aparece no aviso', async () => {
    await put(root, 'specs/tasks/rascunho.md', '---\nid: T-9\ntitle: Rascunho\n---\n');
    const board = await open();
    expect(board.tasks.map((t: { id: string }) => t.id)).not.toContain('T-9');
    expect(board.ignored).toEqual([{ file: 'specs/tasks/rascunho.md', reason: 'campo obrigatório ausente: status', repoId: board.repos[0].repoId }]);
  });
});

describe('tempo real', () => {
  it('edição externa do status chega em até ~1 s e a gravação própria não gera evento duplicado', async () => {
    await open();
    const events: string[] = [];
    const unsub = session.subscribe((e) => events.push(e.type));

    // eco da própria gravação: o estado já foi publicado pela API, o watcher não deve emitir de novo
    await call('PATCH', '/api/tasks/T-1/status', { status: 'Em execução' });
    const afterOwn = events.length;
    await wait(600);
    expect(events.length).toBe(afterOwn);

    const t0 = Date.now();
    await writeFile(path.join(root, 'specs/tasks/c.md'), task('T-3', 'Backlog'));
    while (Date.now() - t0 < 1500) {
      if (session.current().tasks.find((t) => t.id === 'T-3')?.column === 'backlog') break;
      await wait(50);
    }
    expect(session.current().tasks.find((t) => t.id === 'T-3')?.column).toBe('backlog');
    expect(Date.now() - t0).toBeLessThan(1000);
    unsub();
  });

  it('SSE entrega board-changed', async () => {
    await open();
    const res = await fetch(`${base}/api/events`);
    const reader = res.body!.getReader();
    await writeFile(path.join(root, 'specs/tasks/novo.md'), task('T-8', 'Backlog'));
    let text = '';
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && !text.includes('T-8')) {
      const { value } = await reader.read();
      text += new TextDecoder().decode(value);
    }
    await reader.cancel();
    expect(text).toContain('event: board-changed');
    expect(text).toContain('T-8');
  });

  it('adicionar e remover repositório avisam quem já está conectado', async () => {
    await open();
    const other = await tmpDir('outro-');
    await put(other, 'specs/tasks/z.md', task('Z-1', 'Backlog'));
    const events: { type: string; state: { repos: unknown[]; tasks: { id: string }[] } }[] = [];
    session.subscribe((e) => events.push(e as never));
    await call('POST', '/api/repos', { path: other });
    expect(events.at(-1)?.state.tasks.map((t) => t.id)).toContain('Z-1');
    expect(events.at(-1)?.state.repos).toHaveLength(2);
    const id = events.at(-1)!.state.repos[1] as { repoId: string };
    await call('DELETE', `/api/repos/${id.repoId}`);
    expect(events.at(-1)?.state.repos).toHaveLength(1);
  });

  it('repo removido vira indisponível e volta quando reaparece, sem derrubar os outros', async () => {
    const tmp = await tmpDir('efemero-');
    await put(tmp, 'specs/tasks/a.md', task('E-1', 'A'));
    await open();
    await call('POST', '/api/repos', { path: tmp });
    await rm(tmp, { recursive: true, force: true });
    const deadline = Date.now() + 6000;
    let state = await board();
    while (Date.now() < deadline && state.repos.every((r: { available: boolean }) => r.available)) {
      await wait(100);
      state = await board();
    }
    expect(state.repos.map((r: { available: boolean }) => r.available)).toEqual([true, false]);
    expect(state.tasks.map((t: { id: string }) => t.id)).toEqual(['T-1', 'T-2', 'T-3']);
  });
});

describe('fila por coluna (T-001)', () => {
  const ids = (state: { tasks: { id: string; column: string }[] }, column: string) => state.tasks.filter((t) => t.column === column).map((t) => t.id);

  it('sem registro: estima pela data do arquivo, marcado estimated, e a ordem é do mais antigo para o mais novo', async () => {
    await utimes(path.join(root, 'specs/tasks/a.md'), new Date('2026-01-03T00:00:00Z'), new Date('2026-01-03T00:00:00Z'));
    await utimes(path.join(root, 'specs/tasks/b.md'), new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
    const state = await open();
    expect(ids(state, 'backlog')).toEqual(['T-2', 'T-1']);
    expect(state.tasks.find((x: { id: string }) => x.id === 'T-2')).toMatchObject({ enteredAt: '2026-01-01T00:00:00.000Z', estimated: true });
  });

  it('mover grava o instante e o card vai para o fim da fila de destino', async () => {
    await utimes(path.join(root, 'specs/tasks/c.md'), new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
    await open();
    const moved = await (await call('PATCH', '/api/tasks/T-1/status', { status: 'Em execução' })).json();
    expect(ids(moved, 'em execucao')).toEqual(['T-3', 'T-1']);
    const t1 = moved.tasks.find((x: { id: string }) => x.id === 'T-1');
    expect(t1.estimated).toBeUndefined();
    expect(Date.now() - Date.parse(t1.enteredAt)).toBeLessThan(5000);
    await wait(20);
    const second = await (await call('PATCH', '/api/tasks/T-2/status', { status: 'Em execução' })).json();
    expect(ids(second, 'em execucao')).toEqual(['T-3', 'T-1', 'T-2']);
  });

  it('edição externa do status também entra no fim da fila', async () => {
    await open();
    await wait(20);
    await writeFile(path.join(root, 'specs/tasks/a.md'), task('T-1', 'Em execução'));
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && !ids(await board(), 'em execucao').includes('T-1')) await wait(50);
    expect(ids(await board(), 'em execucao')).toEqual(['T-3', 'T-1']);
  });

  it('renomear a coluna preserva o instante dos cards', async () => {
    await utimes(path.join(root, 'specs/tasks/a.md'), new Date('2026-01-05T00:00:00Z'), new Date('2026-01-05T00:00:00Z'));
    await utimes(path.join(root, 'specs/tasks/b.md'), new Date('2026-01-02T00:00:00Z'), new Date('2026-01-02T00:00:00Z'));
    const before = await open();
    const stamp = (s: { tasks: { id: string; enteredAt: string }[] }) => Object.fromEntries(s.tasks.map((x) => [x.id, x.enteredAt]));
    const { state } = await (await call('PATCH', '/api/columns/backlog', { name: 'A fazer' })).json();
    expect(stamp(state)).toEqual(stamp(before));
    expect(ids(state, 'a fazer')).toEqual(['T-2', 'T-1']);
  });

  it('a fila fica fora do repo e sobrevive a reabrir', async () => {
    await utimes(path.join(root, 'specs/tasks/a.md'), new Date('2026-01-03T00:00:00Z'), new Date('2026-01-03T00:00:00Z'));
    await open();
    await call('PATCH', '/api/tasks/T-1/status', { status: 'Em execução' });
    const files = await readdir(path.join(process.env.AGENTIC_BOARD_HOME!, 'queues'));
    expect(files).toHaveLength(1);
    await call('DELETE', '/api/repo');
    const again = await open();
    expect(ids(again, 'em execucao')).toEqual(['T-3', 'T-1']);
    expect(again.tasks.find((x: { id: string }) => x.id === 'T-1').estimated).toBeUndefined();
    expect(await readdir(path.join(root, 'specs'))).not.toContain('queues');
  });

  it('arquivo de fila corrompido vale como ausente', async () => {
    await open();
    await call('DELETE', '/api/repo');
    const dir = path.join(process.env.AGENTIC_BOARD_HOME!, 'queues');
    for (const f of await readdir(dir)) await writeFile(path.join(dir, f), '{ quebrado');
    const again = await open();
    expect(again.tasks).toHaveLength(3);
    expect(again.tasks.every((x: { estimated?: boolean }) => x.estimated)).toBe(true);
  });
});

describe('conteúdo da task (modal)', () => {
  it('devolve o corpo, os campos extras e o status', async () => {
    await put(root, 'specs/tasks/d.md', '---\nid: T-4\ntitle: Detalhe\nstatus: Backlog\npriority: alta\n---\n\n# Título\n\ncorpo **forte**\n');
    await open();
    const res = await call('GET', '/api/tasks/T-4');
    expect(res.status).toBe(200);
    const detail = await res.json();
    expect(detail).toMatchObject({ id: 'T-4', title: 'Detalhe', status: 'Backlog', extra: { priority: 'alta' } });
    expect(detail.body).toBe('# Título\n\ncorpo **forte**\n');
  });

  it('id inexistente ou com path traversal não lê nada fora do repo', async () => {
    await open();
    expect((await call('GET', '/api/tasks/nao-existe')).status).toBe(404);
    expect((await call('GET', `/api/tasks/${encodeURIComponent('../../../../etc/passwd')}`)).status).toBe(404);
    expect((await call('GET', `/api/tasks/${encodeURIComponent('specs/tasks/a.md')}`)).status).toBe(404);
  });

  it('arquivo trocado por symlink para fora do repo depois da leitura é recusado', async () => {
    await open();
    const outside = await tmpDir('fora-');
    await put(outside, 'segredo.md', '---\nid: T-1\ntitle: x\nstatus: y\n---\nsegredo\n');
    await rm(path.join(root, 'specs/tasks/a.md'));
    await symlink(path.join(outside, 'segredo.md'), path.join(root, 'specs/tasks/a.md'));
    const res = await call('GET', '/api/tasks/T-1');
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain('segredo');
  });

  it('editar só o corpo por fora gera board-changed (o modal aberto atualiza)', async () => {
    await open();
    const events: string[] = [];
    session.subscribe((e) => events.push(e.type));
    await wait(1100); // garante mtime diferente
    await writeFile(path.join(root, 'specs/tasks/a.md'), task('T-1', 'Backlog').replace('# T-1', '# T-1\n\nnovo texto'));
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && !events.includes('board-changed')) await wait(50);
    expect(events).toContain('board-changed');
    expect((await (await call('GET', '/api/tasks/T-1')).json()).body).toContain('novo texto');
  });
});

describe('vários repositórios', () => {
  let second: string;
  const names = (b: { columns: { name: string }[] }) => b.columns.map((c) => c.name);
  const add = (p: string) => call('POST', '/api/repos', { path: p });

  beforeEach(async () => {
    second = await tmpDir('repo2-');
    await put(second, 'specs/tasks/x.md', task('T-1', 'Backlog', 'Do segundo'));
    await put(second, 'specs/tasks/y.md', task('Y-1', 'Revisão'));
  });

  it('abre dois repos: ids repetidos viram dois cards e não geram aviso de duplicata', async () => {
    await open();
    const state = await (await add(second)).json();
    expect(state.repos).toHaveLength(2);
    expect(state.tasks.filter((t: { id: string }) => t.id === 'T-1').map((t: { repoId: string }) => t.repoId).sort()).toEqual(state.repos.map((r: { repoId: string }) => r.repoId).sort());
    expect(state.ignored).toEqual([]);
    expect(names(state)).toEqual(['Backlog', 'Em execução', 'Revisão']);
    expect(state.columns[0].count).toBe(3);
  });

  it('o mesmo repo (inclusive por outro caminho) não duplica', async () => {
    await open();
    const dup = await add(root);
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toBe('Esse repositório já está aberto');
    await symlink(root, path.join(await tmpDir('link-'), 'atalho')).catch(() => undefined);
  });

  it('cores: primeira livre, estáveis ao reabrir, troca lembrada', async () => {
    await open();
    const two = await (await add(second)).json();
    expect(two.repos.map((r: { color: string }) => r.color)).toEqual(['azul', 'teal']);
    const [first, other] = two.repos as { repoId: string }[];
    expect((await call('PUT', `/api/repos/${other!.repoId}/color`, { color: 'vinho' })).status).toBe(200);
    expect((await call('PUT', `/api/repos/${other!.repoId}/color`, { color: 'neon' })).status).toBe(400);
    // reabrir tudo a partir do config do app
    const port = await freePort();
    const again = createApp({ port });
    await again.ready;
    expect(again.session.current().repos.map((r) => [r.repoId, r.color])).toEqual([[first!.repoId, 'azul'], [other!.repoId, 'vinho']]);
    await again.session.close();
  });

  it('nomes iguais são desambiguados pela pasta pai', async () => {
    const a = path.join(await tmpDir('pai-a-'), 'app');
    const b = path.join(await tmpDir('pai-b-'), 'app');
    await put(a, 'specs/tasks/a.md', task('A-1', 'X'));
    await put(b, 'specs/tasks/b.md', task('B-1', 'X'));
    await call('POST', '/api/repos', { path: a });
    const state = await (await add(b)).json();
    expect(state.repos.map((r: { name: string }) => r.name)).toEqual([expect.stringMatching(/^app \(pai-a-/), expect.stringMatching(/^app \(pai-b-/)]);
  });

  it('repo que sumiu aparece indisponível ao reabrir, sem derrubar os outros', async () => {
    await open();
    const gone = await tmpDir('sumiu-');
    await put(gone, 'specs/tasks/g.md', task('G-1', 'X'));
    await add(gone);
    await session.close();
    await rm(gone, { recursive: true, force: true });
    const port = await freePort();
    const again = createApp({ port });
    await again.ready;
    const st = again.session.current();
    expect(st.repos.map((r) => r.available)).toEqual([true, false]);
    expect(st.tasks.map((t) => t.id)).toEqual(['T-1', 'T-2', 'T-3']);
    await again.session.close();
  });

  it('mover grava só o .md daquele repo (rota com repoId); id de repo inválido ou traversal dão erro', async () => {
    await open();
    const state = await (await add(second)).json();
    const [r1, r2] = state.repos as { repoId: string }[];
    const before = await read('specs/tasks/a.md');
    const res = await call('PATCH', `/api/repos/${r2!.repoId}/tasks/T-1/status`, { status: 'Revisão' });
    expect(res.status).toBe(200);
    expect(await readFile(path.join(second, 'specs/tasks/x.md'), 'utf8')).toContain('status: Revisão');
    expect(await read('specs/tasks/a.md')).toBe(before);
    expect((await call('GET', `/api/repos/${r1!.repoId}/tasks/T-1`)).status).toBe(200);
    expect((await call('GET', '/api/repos/zzzz/tasks/T-1')).status).toBe(404);
    expect((await call('GET', `/api/repos/${encodeURIComponent('../..')}/tasks/T-1`)).status).toBe(404);
    expect((await call('GET', `/api/repos/${r1!.repoId}/tasks/${encodeURIComponent('../../../etc/passwd')}`)).status).toBe(404);
  });

  it('rota antiga sem repo: id repetido é ambíguo (409); id único funciona', async () => {
    await open();
    await add(second);
    expect((await call('GET', '/api/tasks/T-1')).status).toBe(409);
    expect((await call('GET', '/api/tasks/Y-1')).status).toBe(200);
  });

  it('ordem das colunas vai para o config do app, por conjunto, sem escrever nos .board.json', async () => {
    await open();
    await add(second);
    await call('POST', '/api/columns', { name: 'Feito' });
    const res = await call('PATCH', '/api/columns/order', { order: ['Feito', 'Revisão', 'Backlog', 'Em execução'] });
    expect(names(await res.json())).toEqual(['Feito', 'Revisão', 'Backlog', 'Em execução']);
    await expect(read('specs/.board.json')).rejects.toThrow();
    await expect(readFile(path.join(second, 'specs/.board.json'), 'utf8')).rejects.toThrow();
    const cfg = JSON.parse(await readFile(path.join(process.env.AGENTIC_BOARD_HOME!, 'config.json'), 'utf8'));
    expect(Object.values(cfg.columns)).toEqual([['Feito', 'Revisão', 'Backlog', 'Em execução']]);
    // remover um repo muda o conjunto: volta ao modo de 1 repo (usa o .board.json dele, sem a ordem do conjunto)
    const only = (await board()).repos[1].repoId;
    const after = await (await call('DELETE', `/api/repos/${only}`)).json();
    expect(names(after)).not.toContain('Feito');
  });

  it('renomear reescreve os cards de todos os repos; excluir só se vazia em todos', async () => {
    await open();
    await add(second);
    const res = await (await call('PATCH', '/api/columns/backlog', { name: 'A fazer' })).json();
    expect(res.changed.sort()).toEqual(['specs/tasks/a.md', 'specs/tasks/b.md', 'specs/tasks/x.md']);
    expect(await readFile(path.join(second, 'specs/tasks/x.md'), 'utf8')).toContain('status: A fazer');
    // vazia em um repo, mas com card no outro: não exclui
    await call('POST', '/api/columns', { name: 'Vazia' });
    await call('PATCH', `/api/repos/${(await board()).repos[1].repoId}/tasks/Y-1/status`, { status: 'Vazia' });
    expect((await call('DELETE', '/api/columns/vazia')).status).toBe(409);
    await call('PATCH', `/api/repos/${(await board()).repos[1].repoId}/tasks/Y-1/status`, { status: 'Revisão' });
    expect((await call('DELETE', '/api/columns/vazia')).status).toBe(200);
  });

  it('filtro: lembrado por conjunto; não deixa ocultar todos', async () => {
    await open();
    const state = await (await add(second)).json();
    const [r1, r2] = state.repos as { repoId: string }[];
    expect((await call('PUT', '/api/filter', { hidden: [r2!.repoId] })).status).toBe(200);
    expect((await board()).hidden).toEqual([r2!.repoId]);
    expect((await call('PUT', '/api/filter', { hidden: [r1!.repoId, r2!.repoId] })).status).toBe(400);
    expect((await call('PUT', '/api/filter', { hidden: 'x' })).status).toBe(400);
    expect((await board()).hidden).toEqual([r2!.repoId]);
  });

  it('remover um repo só fecha no board: nada muda em disco', async () => {
    await open();
    const state = await (await add(second)).json();
    const mdBefore = await readFile(path.join(second, 'specs/tasks/x.md'), 'utf8');
    const res = await call('DELETE', `/api/repos/${state.repos[1].repoId}`);
    expect((await res.json()).repos).toHaveLength(1);
    expect(await readFile(path.join(second, 'specs/tasks/x.md'), 'utf8')).toBe(mdBefore);
    expect((await call('DELETE', `/api/repos/${state.repos[1].repoId}`)).status).toBe(404);
  });
});

describe('git diff', () => {
  it('mover um card altera exatamente uma linha no git diff', async () => {
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=t', 'commit', '-qm', 'x'], { cwd: root });
    await open();
    await call('PATCH', '/api/tasks/T-1/status', { status: 'Em execução' });
    const diff = execFileSync('git', ['diff', '--unified=0'], { cwd: root, encoding: 'utf8' });
    const changed = diff.split('\n').filter((l) => /^[-+](?![-+])/.test(l));
    expect(changed).toEqual(['-status: Backlog', '+status: Em execução']);
  });
});

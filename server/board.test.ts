import { describe, expect, it } from 'vitest';
import { buildBoard } from './board.js';
import type { Entered } from './queue.js';
import type { Task } from './scanner.js';

const t = (id: string, status: string): Task => ({ id, title: id, status, file: `specs/${id}.md` });
const build = (tasks: Task[], columns: string[] = []) => buildBoard('/r/repo', { tasks, ignored: [] }, { columns });

describe('buildBoard', () => {
  it('uma coluna por status distinto, com contagem', () => {
    const b = build([t('T-1', 'Backlog'), t('T-2', 'Backlog'), t('T-3', 'Em execução')]);
    expect(b.columns).toEqual([
      { key: 'backlog', name: 'Backlog', count: 2 },
      { key: 'em execucao', name: 'Em execução', count: 1 },
    ]);
  });

  it('junta variações de status na mesma coluna, usando o nome da primeira ocorrência', () => {
    const b = build([t('T-1', 'Em execução'), t('T-2', 'em execucao'), t('T-3', ' EM  EXECUÇÃO ')]);
    expect(b.columns).toEqual([{ key: 'em execucao', name: 'Em execução', count: 3 }]);
  });

  it('colunas do .board.json vêm primeiro e na ordem do arquivo; o nome exibido é o do arquivo', () => {
    const b = build([t('T-1', 'Novo'), t('T-2', 'backlog')], ['Backlog', 'Concluído']);
    expect(b.columns.map((c) => [c.name, c.count])).toEqual([['Backlog', 1], ['Concluído', 0], ['Novo', 1]]);
  });

  it('ordena as tasks por id natural', () => {
    const b = build([t('T-10', 'A'), t('T-2', 'A'), t('T-1', 'A')]);
    expect(b.tasks.map((x) => x.id)).toEqual(['T-1', 'T-2', 'T-10']);
  });

  it('coluna derivada só das tasks some quando fica vazia; a do arquivo permanece', () => {
    expect(build([]).columns).toEqual([]);
    expect(build([], ['Concluído']).columns).toEqual([{ key: 'concluido', name: 'Concluído', count: 0 }]);
  });

  it('expõe repo, nome e ignorados', () => {
    const b = buildBoard('/r/repo', { tasks: [], ignored: [{ file: 'a.md', reason: 'x' }] }, { columns: [], error: 'ruim' });
    expect(b).toMatchObject({ repo: { path: '/r/repo', name: 'repo' }, ignored: [{ file: 'a.md', reason: 'x' }], configError: 'ruim' });
  });
});

describe('fila por coluna', () => {
  const at = (column: string, iso: string): Entered[string] => ({ column, at: iso });
  const queue = (tasks: Task[], entered: Entered) => buildBoard('/r', { tasks, ignored: [] }, { columns: [] }, entered).tasks.map((x) => x.id);

  it('o mais antigo na coluna fica no topo e o mais recente na base', () => {
    const tasks = [t('T-1', 'A'), t('T-2', 'A'), t('T-3', 'A')];
    const entered = { 'T-1': at('a', '2026-01-03T00:00:00Z'), 'T-2': at('a', '2026-01-01T00:00:00Z'), 'T-3': at('a', '2026-01-02T00:00:00Z') };
    expect(queue(tasks, entered)).toEqual(['T-2', 'T-3', 'T-1']);
  });

  it('empate no instante: id natural', () => {
    const same = '2026-01-01T00:00:00Z';
    const tasks = [t('T-10', 'A'), t('T-2', 'A')];
    expect(queue(tasks, { 'T-10': at('a', same), 'T-2': at('a', same) })).toEqual(['T-2', 'T-10']);
  });

  it('sem instante conhecido (ou de outra coluna): no fim, por id', () => {
    const tasks = [t('T-1', 'A'), t('T-2', 'A'), t('T-3', 'A')];
    expect(queue(tasks, { 'T-3': at('a', '2026-01-01T00:00:00Z'), 'T-2': at('outra', '2026-01-01T00:00:00Z') })).toEqual(['T-3', 'T-1', 'T-2']);
  });

  it('expõe enteredAt e se é estimado', () => {
    const b = buildBoard('/r', { tasks: [t('T-1', 'A')], ignored: [] }, { columns: [] }, { 'T-1': { column: 'a', at: '2026-01-01T00:00:00Z', estimated: true } });
    expect(b.tasks[0]).toMatchObject({ enteredAt: '2026-01-01T00:00:00Z', estimated: true });
  });
});

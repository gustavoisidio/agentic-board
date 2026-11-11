import { describe, expect, it } from 'vitest';
import { buildBoard } from './board.js';
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

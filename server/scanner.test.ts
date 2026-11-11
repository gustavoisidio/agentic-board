import { symlinkSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { put, task, tmpDir } from './helpers.js';
import { scanRepo } from './scanner.js';

let root: string;
beforeEach(async () => {
  root = await tmpDir();
});

describe('scanRepo', () => {
  it('encontra tasks em specs e tasks, em qualquer profundidade', async () => {
    await put(root, 'specs/tasks/a.md', task('T-1', 'Backlog'));
    await put(root, 'pkg/Tasks/b.md', task('T-2', 'Feito'));
    await put(root, 'specs/deep/er/c.md', task('T-3', 'Feito'));
    await put(root, 'docs/fora.md', task('T-4', 'Feito'));
    const { tasks, ignored } = await scanRepo(root);
    expect(tasks.map((t) => t.file)).toEqual(['pkg/Tasks/b.md', 'specs/deep/er/c.md', 'specs/tasks/a.md']);
    expect(ignored).toEqual([]);
  });

  it('ignora node_modules, .git, dist, build e pastas com ponto', async () => {
    for (const dir of ['node_modules/x/specs', '.git/specs', 'dist/specs', 'build/tasks', '.hidden/tasks']) {
      await put(root, `${dir}/t.md`, task('T-9', 'X'));
    }
    expect((await scanRepo(root)).tasks).toEqual([]);
  });

  it('arquivo sem frontmatter é silencioso; inválido com frontmatter vai para o aviso', async () => {
    await put(root, 'specs/00-visao.md', '# Documentação\n');
    await put(root, 'specs/tasks/rascunho.md', '---\nid: T-1\ntitle: A\n---\n');
    await put(root, 'specs/tasks/aberto.md', '---\nid: T-2\ntitle: A\nstatus: B\n');
    const { tasks, ignored } = await scanRepo(root);
    expect(tasks).toEqual([]);
    expect(ignored).toEqual([
      { file: 'specs/tasks/aberto.md', reason: 'frontmatter sem marcação de fim (---)' },
      { file: 'specs/tasks/rascunho.md', reason: 'campo obrigatório ausente: status' },
    ]);
  });

  it('id duplicado: vale o primeiro por ordem de caminho', async () => {
    await put(root, 'specs/tasks/b.md', task('T-1', 'Feito', 'Segunda'));
    await put(root, 'specs/tasks/a.md', task('T-1', 'Backlog', 'Primeira'));
    const { tasks, ignored } = await scanRepo(root);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ file: 'specs/tasks/a.md', title: 'Primeira' });
    expect(ignored).toEqual([{ file: 'specs/tasks/b.md', reason: 'id duplicado (já usado em specs/tasks/a.md)' }]);
  });

  it('não segue symlink para fora do repo', async () => {
    const outside = await tmpDir('fora-');
    await put(outside, 'x.md', task('T-7', 'X'));
    await put(root, 'specs/tasks/ok.md', task('T-1', 'A'));
    symlinkSync(`${outside}/x.md`, `${root}/specs/tasks/link.md`);
    const { tasks } = await scanRepo(root);
    expect(tasks.map((t) => t.id)).toEqual(['T-1']);
  });
});

import { describe, expect, it } from 'vitest';
import { parseTask, rewriteStatus } from './frontmatter.js';

const doc = (header: string, body = '# Corpo\n') => `---\n${header}\n---\n\n${body}`;

describe('parseTask', () => {
  it('lê uma task válida', () => {
    expect(parseTask(doc('id: T-001\ntitle: Definir formato\nstatus: Backlog'))).toEqual({
      kind: 'ok',
      fields: { id: 'T-001', title: 'Definir formato', status: 'Backlog' },
    });
  });

  it('aceita aspas e campos extras', () => {
    const r = parseTask(doc('id: "T-1"\ntitle: "Com: dois pontos # e cerquilha"\nstatus: \'Em execução\'\nassignee: ana\npriority: 2'));
    expect(r).toEqual({ kind: 'ok', fields: { id: 'T-1', title: 'Com: dois pontos # e cerquilha', status: 'Em execução' } });
  });

  it('aceita CRLF', () => {
    expect(parseTask('---\r\nid: T-1\r\ntitle: A\r\nstatus: Backlog\r\n---\r\ncorpo\r\n')).toMatchObject({ kind: 'ok' });
  });

  it('sem frontmatter não é task (silencioso)', () => {
    expect(parseTask('# Só um documento\n')).toEqual({ kind: 'none' });
    expect(parseTask('\n---\nid: x\n---\n')).toEqual({ kind: 'none' }); // não começa na primeira linha
  });

  it('YAML quebrado', () => {
    expect(parseTask(doc('id: T-1\ntitle: [aberto\nstatus: Backlog'))).toEqual({ kind: 'invalid', reason: 'frontmatter com YAML inválido' });
  });

  it('sem marcação de fim', () => {
    expect(parseTask('---\nid: T-1\ntitle: A\nstatus: B\n')).toEqual({ kind: 'invalid', reason: 'frontmatter sem marcação de fim (---)' });
  });

  it.each(['id', 'title', 'status'])('campo ausente: %s', (campo) => {
    const header = ['id: T-1', 'title: A', 'status: B'].filter((l) => !l.startsWith(campo)).join('\n');
    expect(parseTask(doc(header))).toEqual({ kind: 'invalid', reason: `campo obrigatório ausente: ${campo}` });
  });

  it('campo vazio ou só espaços conta como ausente', () => {
    expect(parseTask(doc('id: T-1\ntitle: A\nstatus: "   "'))).toEqual({ kind: 'invalid', reason: 'campo obrigatório ausente: status' });
  });
});

describe('rewriteStatus', () => {
  it('altera só a linha status', () => {
    const before = '---\nid: T-1\ntitle: A\nstatus: Backlog\nassignee: ana\n---\n\n# Corpo\nstatus: não mexer\n';
    const after = rewriteStatus(before, 'Em execução');
    expect(after).toBe('---\nid: T-1\ntitle: A\nstatus: Em execução\nassignee: ana\n---\n\n# Corpo\nstatus: não mexer\n');
  });

  it('preserva CRLF', () => {
    const before = '---\r\nid: T-1\r\ntitle: A\r\nstatus: Backlog\r\n---\r\ncorpo\r\n';
    expect(rewriteStatus(before, 'Revisão')).toBe('---\r\nid: T-1\r\ntitle: A\r\nstatus: Revisão\r\n---\r\ncorpo\r\n');
  });

  it('preserva comentário no fim da linha e valor entre aspas', () => {
    expect(rewriteStatus('---\nid: a\ntitle: b\nstatus: "Backlog" # kanban\n---\n', 'Feito')).toBe('---\nid: a\ntitle: b\nstatus: Feito # kanban\n---\n');
    expect(rewriteStatus('---\nid: a\ntitle: b\nstatus: Backlog # kanban\n---\n', 'Feito')).toBe('---\nid: a\ntitle: b\nstatus: Feito # kanban\n---\n');
  });

  it('coloca aspas quando o YAML exige', () => {
    const out = rewriteStatus('---\nid: a\ntitle: b\nstatus: x\n---\n', 'A: B # C');
    expect(out).toContain('status: "A: B # C"');
    expect(parseTask(out)).toMatchObject({ fields: { status: 'A: B # C' } });
  });

  it('falha sem tocar quando não acha a linha com segurança', () => {
    expect(() => rewriteStatus('---\nid: a\ntitle: b\n"status": x\n---\n', 'Z')).toThrow();
    expect(() => rewriteStatus('---\nid: a\ntitle: b\nstatus: x\nstatus: y\n---\n', 'Z')).toThrow();
    expect(() => rewriteStatus('---\nid: a\ntitle: b\nstatus: |\n  x\n---\n', 'Z')).toThrow();
    expect(() => rewriteStatus('# sem header\nstatus: x\n', 'Z')).toThrow();
  });
});

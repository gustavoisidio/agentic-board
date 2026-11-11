import YAML from 'yaml';

export interface TaskFields {
  id: string;
  title: string;
  status: string;
}

export type ParseResult =
  | { kind: 'none' } // sem frontmatter: não é task, ignorado em silêncio
  | { kind: 'invalid'; reason: string } // tem frontmatter, mas inválido: vai para o aviso
  | { kind: 'ok'; fields: TaskFields };

export class RewriteError extends Error {}

const REQUIRED = ['id', 'title', 'status'] as const;

function splitLines(content: string): string[] {
  return content.split('\n');
}

/** Localiza o bloco do header: devolve o índice da linha de fechamento (ou -1) se a primeira linha for `---`. */
function headerEnd(lines: string[]): number | null {
  if (lines[0]?.replace(/\r$/, '').replace(/^﻿/, '').trimEnd() !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.replace(/\r$/, '').trimEnd() === '---') return i;
  }
  return -1;
}

export function parseTask(content: string): ParseResult {
  const lines = splitLines(content);
  const end = headerEnd(lines);
  if (end === null) return { kind: 'none' };
  if (end === -1) return { kind: 'invalid', reason: 'frontmatter sem marcação de fim (---)' };

  let data: unknown;
  try {
    data = YAML.parse(lines.slice(1, end).join('\n'));
  } catch {
    return { kind: 'invalid', reason: 'frontmatter com YAML inválido' };
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { kind: 'invalid', reason: 'frontmatter com YAML inválido' };
  }
  const record = data as Record<string, unknown>;
  const fields = {} as Record<(typeof REQUIRED)[number], string>;
  for (const name of REQUIRED) {
    const value = record[name];
    const text = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
    if (!text.trim()) return { kind: 'invalid', reason: `campo obrigatório ausente: ${name}` };
    fields[name] = text.trim();
  }
  return { kind: 'ok', fields };
}

/** Texto do valor do status já formatado para YAML (com aspas só quando necessário). */
function formatValue(status: string): string {
  if (/[\r\n]/.test(status)) throw new RewriteError('o status não pode ter quebra de linha');
  return YAML.stringify(status, { lineWidth: 0 }).replace(/\n$/, '');
}

const QUOTED = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')/;

/**
 * Troca só a linha `status:` do frontmatter. O resto do arquivo (corpo, outros campos, comentários,
 * LF/CRLF) fica byte a byte igual. Falha, sem tocar em nada, se não achar a linha com segurança.
 */
export function rewriteStatus(content: string, newStatus: string): string {
  const lines = splitLines(content);
  const end = headerEnd(lines);
  if (end === null || end === -1) throw new RewriteError('frontmatter não encontrado');

  const matches: number[] = [];
  for (let i = 1; i < end; i++) if (/^status[ \t]*:/.test(lines[i]!)) matches.push(i);
  if (matches.length !== 1) throw new RewriteError('linha status: não localizada com segurança');
  const index = matches[0]!;

  const line = lines[index]!;
  const cr = line.endsWith('\r') ? '\r' : '';
  const body = cr ? line.slice(0, -1) : line;
  const prefix = /^status[ \t]*:[ \t]*/.exec(body)![0];
  const rest = body.slice(prefix.length);

  let tail = '';
  if (rest === '' || /^[|>&*!\[{]/.test(rest)) {
    // valor vazio (pode continuar nas linhas seguintes), bloco, âncora, lista: não é seguro reescrever
    throw new RewriteError('linha status: não localizada com segurança');
  }
  const quoted = QUOTED.exec(rest);
  if (quoted) {
    tail = rest.slice(quoted[0].length);
    if (tail.trim() !== '' && !/^[ \t]+#/.test(tail)) throw new RewriteError('linha status: não localizada com segurança');
  } else {
    const comment = /[ \t]+#.*$/.exec(rest);
    if (comment) tail = comment[0];
  }

  lines[index] = `${prefix}${formatValue(newStatus)}${tail}${cr}`;
  const result = lines.join('\n');

  // confere o resultado: o status lido tem que ser o pedido
  const check = parseTask(result);
  if (check.kind !== 'ok' || check.fields.status !== newStatus.trim()) {
    throw new RewriteError('a reescrita não produziu o status esperado');
  }
  return result;
}

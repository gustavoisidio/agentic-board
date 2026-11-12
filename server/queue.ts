import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { appDir } from './appConfig.js';
import { atomicWrite } from './writer.js';

/** Quando o card entrou na coluna atual. `estimated`: sem registro real, veio da data do arquivo. */
export interface Entry {
  column: string; // chave normalizada da coluna
  at: string; // ISO 8601
  estimated?: true;
}
export type Entered = Record<string, Entry>;

/** Fila por repositório, fora do repo (`~/.agentic-board/queues/<hash>.json`): nada vai para o git. */
export const queueFile = (realRoot: string) =>
  path.join(appDir(), 'queues', `${createHash('sha1').update(realRoot).digest('hex').slice(0, 16)}.json`);

const isEntry = (e: unknown): e is Entry =>
  !!e && typeof e === 'object' && typeof (e as Entry).column === 'string' && !Number.isNaN(Date.parse((e as Entry).at));

/** Arquivo ausente ou ilegível vale como vazio: o board nunca cai por causa da fila. */
export async function readQueue(realRoot: string): Promise<Entered> {
  try {
    const data = JSON.parse(await fs.readFile(queueFile(realRoot), 'utf8')) as { entered?: Record<string, unknown> };
    const out: Entered = {};
    for (const [id, entry] of Object.entries(data.entered ?? {})) if (isEntry(entry)) out[id] = entry;
    return out;
  } catch {
    return {};
  }
}

export async function writeQueue(realRoot: string, entered: Entered): Promise<void> {
  try {
    await fs.mkdir(path.dirname(queueFile(realRoot)), { recursive: true });
    await atomicWrite(queueFile(realRoot), JSON.stringify({ version: 1, repo: realRoot, entered }, null, 2) + '\n');
  } catch {
    /* a fila é conveniência: falha em gravar não impede o board */
  }
}

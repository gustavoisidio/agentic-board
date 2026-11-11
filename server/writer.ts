import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

/** Gravação atômica: arquivo temporário na mesma pasta + rename. Preserva as permissões do original. */
export async function atomicWrite(file: string, content: string): Promise<void> {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${randomBytes(4).toString('hex')}.tmp`);
  let mode: number | undefined;
  try {
    mode = (await fs.stat(file)).mode & 0o777;
  } catch {
    mode = undefined;
  }
  try {
    await fs.writeFile(tmp, content, { encoding: 'utf8', mode });
    await fs.rename(tmp, file);
  } catch (error) {
    await fs.rm(tmp, { force: true });
    throw error;
  }
}

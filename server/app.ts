import express, { type NextFunction, type Request, type Response } from 'express';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addRecent, readRecent } from './appConfig.js';
import { HttpError, Session } from './session.js';

export interface AppOptions {
  port: number;
  /** Origens extras aceitas (ex.: o Vite em desenvolvimento). */
  extraOrigins?: string[];
  /** Hostnames/IPs extras aceitos no Host (acesso pela rede local, opt-in). */
  extraHosts?: string[];
  platform?: NodeJS.Platform;
  /** Substitui o seletor de pasta (testes). */
  pickFolder?: () => Promise<string | null>;
}

const WEB_DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist');

function osascriptPick(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', 'POSIX path of (choose folder)'], (error, stdout, stderr) => {
      if (error) {
        if (/-128|User canceled/i.test(stderr)) resolve(null);
        else reject(new HttpError(500, 'Não foi possível abrir o seletor de pastas'));
        return;
      }
      resolve(stdout.trim().replace(/\/$/, '') || null);
    });
  });
}

export function createApp(options: AppOptions) {
  const session = new Session();
  const platform = options.platform ?? process.platform;
  const names = ['127.0.0.1', 'localhost', ...(options.extraHosts ?? [])];
  const hosts = new Set(names.map((n) => `${n}:${options.port}`));
  const origins = new Set([...names.map((n) => `http://${n}:${options.port}`), ...(options.extraOrigins ?? [])]);

  const app = express();
  app.disable('x-powered-by');

  // Só aceita requisições do próprio board (protege contra sites abertos no browser e DNS rebinding).
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!hosts.has(String(req.headers.host)) || (origin !== undefined && !origins.has(origin))) {
      res.status(403).json({ error: 'Origem não permitida' });
      return;
    }
    next();
  });
  app.use(express.json({ limit: '64kb' }));

  const api = express.Router();
  const wrap =
    (fn: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) =>
      fn(req, res).catch(next);

  api.get('/capabilities', (_req, res) => {
    res.json({ pickFolder: platform === 'darwin' });
  });

  api.post('/pick-folder', wrap(async (_req, res) => {
    if (platform !== 'darwin') throw new HttpError(501, 'Seletor de pastas disponível só no macOS');
    const picked = await (options.pickFolder ?? osascriptPick)();
    res.json(picked ? { path: picked } : { cancelled: true });
  }));

  api.get('/recent', wrap(async (_req, res) => {
    const recent = await readRecent();
    res.json(recent.map((p) => ({ path: p, name: path.basename(p) || p })));
  }));

  api.post('/repo', wrap(async (req, res) => {
    let input = typeof req.body?.path === 'string' ? req.body.path.trim() : '';
    if (!input) throw new HttpError(400, 'Informe o caminho do repositório');
    if (input === '~' || input.startsWith('~/')) input = path.join(os.homedir(), input.slice(1));
    if (!path.isAbsolute(input)) throw new HttpError(400, 'Use um caminho absoluto');
    const state = await session.open(input);
    await addRecent(state.repo.path);
    res.json(state);
  }));

  api.delete('/repo', wrap(async (_req, res) => {
    await session.closeAndNotify();
    res.status(204).end();
  }));

  api.get('/board', (_req, res) => {
    res.json({ ...session.current(), unavailable: session.isUnavailable() });
  });

  api.get('/tasks/:id', wrap(async (req, res) => {
    res.json(await session.taskDetail(String(req.params.id)));
  }));

  api.patch('/tasks/:id/status', wrap(async (req, res) => {
    res.json(await session.moveTask(String(req.params.id), req.body?.status));
  }));

  api.post('/columns', wrap(async (req, res) => {
    res.status(201).json(await session.createColumn(req.body?.name));
  }));

  api.patch('/columns/order', wrap(async (req, res) => {
    res.json(await session.reorderColumns(req.body?.order));
  }));

  api.patch('/columns/:key', wrap(async (req, res) => {
    res.json(await session.renameColumn(String(req.params.key), req.body?.name));
  }));

  api.delete('/columns/:key', wrap(async (req, res) => {
    res.json(await session.deleteColumn(String(req.params.key)));
  }));

  api.get('/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    res.write('retry: 1000\n\n');
    const unsubscribe = session.subscribe((event) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.type === 'board-changed' ? event.state : {})}\n\n`);
    });
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  api.use((_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
  });
  app.use('/api', api);

  if (existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else if ((error as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({ error: 'JSON inválido' });
    } else {
      console.error(error);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  return { app, session };
}

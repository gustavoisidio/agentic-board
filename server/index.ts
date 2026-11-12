import os from 'node:os';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 4400);
const webPort = process.env.WEB_PORT ?? '5173';
// HOST=0.0.0.0 libera o acesso pela rede local (opt-in): qualquer aparelho na rede passa a poder editar os .md.
const host = process.env.HOST ?? '127.0.0.1';
const lanIps = host === '127.0.0.1' ? [] : Object.values(os.networkInterfaces()).flat().filter((i) => i?.family === 'IPv4' && !i.internal).map((i) => i!.address);
const { app, session, ready } = createApp({
  port,
  extraHosts: lanIps,
  extraOrigins: [`http://localhost:${webPort}`, `http://127.0.0.1:${webPort}`],
});

// Por padrão somente loopback: o board escreve nos arquivos do usuário.
await ready;
const server = app.listen(port, host, () => {
  console.log(`Agentic Board em http://localhost:${port}`);
  for (const ip of lanIps) console.log(`Na rede: http://${ip}:${port}`);
});

const shutdown = () => {
  void session.close().finally(() => server.close(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

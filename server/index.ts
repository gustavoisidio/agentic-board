import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 4400);
const webPort = process.env.WEB_PORT ?? '5173';
const { app, session } = createApp({
  port,
  extraOrigins: [`http://localhost:${webPort}`, `http://127.0.0.1:${webPort}`],
});

// Somente loopback: o board escreve nos arquivos do usuário.
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Agentic Board em http://localhost:${port}`);
});

const shutdown = () => {
  void session.close().finally(() => server.close(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import { log } from './lib/log.js';
import { ensureSchema, seed } from './schema.js';

// The API cannot serve without its database, so a failure here stops startup.
try {
  await ensureSchema();
  await seed();
} catch (err) {
  log.error('Database setup failed.', err);
  process.exit(1);
}

const app = createApp();

// Like Kestrel, "localhost" listens on both the IPv4 and IPv6 loopback.
const hosts = config.host === 'localhost' ? ['127.0.0.1', '::1'] : [config.host];

const servers = hosts.map((host) => {
  const server = http.createServer(app);
  server.on('error', (err) => {
    // IPv6 may be disabled; the IPv4 loopback is enough then.
    if (host === '::1' && err.code === 'EADDRNOTAVAIL') return;
    log.error(`Cannot listen on ${host}:${config.port}.`, err);
    process.exit(1);
  });
  return server;
});

let listening = 0;
for (const [i, server] of servers.entries()) {
  server.listen(config.port, hosts[i], () => {
    if (++listening === 1) log.info(`User backend listening on http://${config.host}:${config.port}`);
  });
}

const shutdown = () => {
  log.info('Shutting down.');
  for (const server of servers) {
    server.close();
    server.closeAllConnections?.();
  }
  db.close().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { UnsupportedMediaTypeError, ValidationError, jsonBody, validationProblem } from './lib/http.js';
import { log } from './lib/log.js';
import { router as auth } from './routes/auth.js';
import { router as callback } from './routes/callback.js';
import { router as games } from './routes/games.js';
import { router as payments } from './routes/payments.js';
import { router as notifications } from './routes/notifications.js';
import { router as profile } from './routes/profile.js';
import { router as transactions } from './routes/transactions.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(cors({ origin: config.corsOrigins, credentials: true }));

  app.use('/api/auth', jsonBody, auth);
  app.use('/api/games', games);
  // Parses its own body after the token check, so a bad token is always a 401.
  app.use('/api/transactions', transactions);
  // Crypto deposits and withdrawals; each route parses its own body.
  app.use('/api/payments', payments);
  app.use('/api/profile', jsonBody, profile);
  app.use('/api/notifications', jsonBody, notifications);
  app.use('/callback', jsonBody, callback);

  app.use((req, res) => res.status(404).end());

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ValidationError) return res.status(400).json(validationProblem(err.field, err.message));
    if (err instanceof UnsupportedMediaTypeError) return res.status(415).end();
    if (err.type === 'entity.parse.failed') return res.status(400).json(validationProblem('$', 'The request body is not valid JSON.'));
    if (err.type === 'entity.too.large') return res.status(413).end();

    log.error(`${req.method} ${req.originalUrl} failed.`, err);
    if (!res.headersSent) res.status(500).end();
  });

  return app;
}

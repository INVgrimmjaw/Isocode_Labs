import { existsSync } from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { authRouter } from './auth/routes.ts';
import { config } from './config.ts';
import { AppError, errorHandler } from './http/errors.ts';
import { loadSession } from './http/session.ts';
import { deskRouter } from './routes/desk.ts';
import { retailerRouter } from './routes/retailer.ts';

const CLIENT_DIST = path.resolve(process.cwd(), 'client/dist');
const ONE_YEAR_MS = 365 * 86_400_000;

export function createApp(): Express {
  const app = express();

  // Behind one reverse proxy in production, so rate limits see the real client address.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: { imgSrc: ["'self'", 'data:'], upgradeInsecureRequests: config.isProduction ? [] : null },
      },
      strictTransportSecurity: config.isProduction,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api', loadSession);
  app.use('/api/auth', authRouter);
  app.use('/api/retailer', retailerRouter);
  app.use('/api/desk', deskRouter);
  app.use('/api', (_req, _res) => {
    throw new AppError(404, 'NOT_FOUND', 'Not found');
  });

  if (existsSync(CLIENT_DIST)) {
    // Hashed filenames never change content, so the phone never has to ask again.
    // A missing asset must be a 404. The page fallback below would answer it with HTML.
    app.use(
      '/assets',
      express.static(path.join(CLIENT_DIST, 'assets'), { immutable: true, maxAge: ONE_YEAR_MS, fallthrough: false }),
    );
    app.use(express.static(CLIENT_DIST, { index: false }));
    app.get('/{*path}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

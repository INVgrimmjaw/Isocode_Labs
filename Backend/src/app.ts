import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { container } from './container.ts';
import { AppError } from './lib/errors.ts';
import { loadSession } from './middleware/auth.ts';
import { errorHandler } from './middleware/error-handler.ts';
import { authRoutes } from './routes/auth.routes.ts';
import { deskRoutes } from './routes/desk.routes.ts';
import { retailerRoutes } from './routes/retailer.routes.ts';

export function createApp(): Express {
  const app = express();

  // Behind nginx, so rate limits see the real client address.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());

  app.use('/api', loadSession(container.authService));
  app.use('/api/auth', authRoutes(container.authController));
  app.use('/api/retailer', retailerRoutes(container.retailerController));
  app.use('/api/desk', deskRoutes(container.deskController));
  app.use((_req, _res) => {
    throw new AppError(404, 'NOT_FOUND', 'Not found');
  });

  app.use(errorHandler);
  return app;
}

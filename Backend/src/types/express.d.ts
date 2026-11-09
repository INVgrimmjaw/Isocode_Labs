import type { SessionUser } from './api.ts';

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

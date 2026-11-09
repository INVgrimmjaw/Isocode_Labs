import type { Request, RequestHandler } from 'express';
import { AppError } from '../lib/errors.ts';
import type { AuthService } from '../services/auth.service.ts';
import type { Role, SessionUser } from '../types/api.ts';

export const SESSION_COOKIE = 'peti_sid';

/** Attaches req.user when the cookie is valid. Rejecting is left to requireUser and requireRole. */
export function loadSession(auth: AuthService): RequestHandler {
  return async (req, _res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string') req.user = (await auth.userForToken(token)) ?? undefined;
    next();
  };
}

export function currentUser(req: Request): SessionUser {
  if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in.');
  return req.user;
}

export const requireUser: RequestHandler = (req, _res, next) => {
  currentUser(req);
  next();
};

export function requireRole(role: Role): RequestHandler {
  return (req, _res, next) => {
    if (currentUser(req).role !== role) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this.');
    }
    next();
  };
}

/**
 * The retailer a request acts for always comes from the session, never from the URL or body.
 * That is what keeps one shop's prices and credit out of another shop's reach.
 */
export function currentRetailerId(req: Request): string {
  const retailerId = currentUser(req).retailer?.id;
  if (!retailerId) throw new AppError(403, 'FORBIDDEN', 'You do not have access to this.');
  return retailerId;
}

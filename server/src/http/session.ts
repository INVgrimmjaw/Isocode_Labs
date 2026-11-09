import { createHash, randomBytes } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import type { Role, SessionUser } from '#shared/api';
import { config } from '../config.ts';
import { prisma } from '../db.ts';
import { AppError } from './errors.ts';

const COOKIE_NAME = 'peti_sid';
const DAY_MS = 86_400_000;

// A shopkeeper should not have to wait for an OTP every morning. A shared office PC should.
const SESSION_LIFETIME_MS: Record<Role, number> = {
  RETAILER: 30 * DAY_MS,
  DESK: DAY_MS / 2,
};

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function cookieOptions() {
  return { httpOnly: true, sameSite: 'lax', secure: config.isProduction, path: '/' } as const;
}

export async function startSession(res: Response, userId: string, role: Role) {
  const token = randomBytes(32).toString('base64url');
  const lifetime = SESSION_LIFETIME_MS[role];
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + lifetime) },
  });
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: lifetime });
}

export async function endSession(req: Request, res: Response) {
  const token: unknown = req.cookies?.[COOKIE_NAME];
  if (typeof token === 'string') {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

/** Attaches req.user when the cookie is valid. Rejecting is left to requireUser and requireRole. */
export const loadSession: RequestHandler = async (req, _res, next) => {
  const token: unknown = req.cookies?.[COOKIE_NAME];
  if (typeof token === 'string') {
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: { retailer: true } } },
    });
    if (session && session.expiresAt > new Date()) {
      const { user } = session;
      req.user = {
        id: user.id,
        name: user.name,
        role: user.role,
        retailer: user.retailer ? { id: user.retailer.id, shopName: user.retailer.shopName } : null,
      };
    }
  }
  next();
};

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

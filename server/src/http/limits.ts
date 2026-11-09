import { rateLimit } from 'express-rate-limit';
import { config } from '../config.ts';

const limiter = (windowMs: number, limit: number, message: string) =>
  rateLimit({
    windowMs,
    limit,
    skip: () => config.isTest,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message } },
  });

export const authLimiter = limiter(
  15 * 60_000,
  60,
  'Too many attempts. Please try again in a few minutes.',
);

/** Each capture can cost a model call, so it is capped separately from ordinary requests. */
export const captureLimiter = limiter(60_000, 12, 'Too many messages at once. Please wait a minute.');

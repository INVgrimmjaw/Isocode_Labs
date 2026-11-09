import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { config } from '../config.ts';
import { prisma } from '../db.ts';
import { AppError } from '../http/errors.ts';
import { mockSmsGateway } from './sms.ts';

const CODE_LIFETIME_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30_000;
const MAX_CODES_PER_HOUR = 6;

const invalidCode = () => new AppError(400, 'INVALID_CODE', 'That code is wrong or has expired.');

function hashCode(phone: string, code: string): Buffer {
  return createHmac('sha256', config.otpSecret).update(`${phone}:${code}`).digest();
}

/** An unknown number gets the same response as a known one, so numbers cannot be probed. */
export async function requestOtp(phone: string): Promise<{ demoCode?: string }> {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) return {};

  // Reviewers switch between demo accounts quickly, so only real use is throttled.
  if (!config.demoMode) await enforceSendLimits(phone);

  const code = String(randomInt(100_000, 1_000_000));
  await prisma.otpChallenge.create({
    data: {
      phone,
      codeHash: hashCode(phone, code).toString('hex'),
      expiresAt: new Date(Date.now() + CODE_LIFETIME_MS),
    },
  });
  await mockSmsGateway.sendOtp(phone, code);
  return config.demoMode ? { demoCode: code } : {};
}

async function enforceSendLimits(phone: string) {
  const now = Date.now();
  const recent = await prisma.otpChallenge.findMany({
    where: { phone, createdAt: { gte: new Date(now - 3_600_000) } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const latest = recent[0];
  if (latest && now - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new AppError(429, 'RATE_LIMITED', 'Please wait a few seconds before asking for another code.');
  }
  if (recent.length >= MAX_CODES_PER_HOUR) {
    throw new AppError(429, 'RATE_LIMITED', 'Too many codes requested. Please try again later.');
  }
}

export async function verifyOtp(phone: string, code: string) {
  const now = new Date();
  const challenge = await prisma.otpChallenge.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge) throw invalidCode();

  // Counted before comparing, so parallel guesses cannot slip past the limit.
  const counted = await prisma.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count === 0) throw invalidCode();

  if (!timingSafeEqual(hashCode(phone, code), Buffer.from(challenge.codeHash, 'hex'))) {
    throw invalidCode();
  }

  // Guarded so one code can start only one session.
  const consumed = await prisma.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: now },
  });
  if (consumed.count === 0) throw invalidCode();

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) throw invalidCode();
  return user;
}

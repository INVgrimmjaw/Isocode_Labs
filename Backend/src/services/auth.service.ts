import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { config } from '../lib/config.ts';
import { AppError } from '../lib/errors.ts';
import type { Database } from '../lib/prisma.ts';
import type { SmsGateway } from '../lib/sms.ts';
import type { Role, SessionUser } from '../types/api.ts';

const CODE_LIFETIME_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const DAY_MS = 86_400_000;

// A shopkeeper should not have to wait for an OTP every morning. A shared office PC should.
const SESSION_LIFETIME_MS: Record<Role, number> = {
  RETAILER: 30 * DAY_MS,
  DESK: DAY_MS / 2,
};

const invalidCode = () => new AppError(400, 'INVALID_CODE', 'That code is wrong or has expired.');
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function hashCode(phone: string, code: string): Buffer {
  return createHmac('sha256', config.otpSecret).update(`${phone}:${code}`).digest();
}

export class AuthService {
  constructor(
    private readonly db: Database,
    private readonly sms: SmsGateway,
  ) {}

  /** An unknown number gets the same response as a known one, so numbers cannot be probed. */
  async requestOtp(phone: string): Promise<{ demoCode?: string }> {
    const user = await this.db.user.findUnique({ where: { phone } });
    if (!user) return {};

    const code = String(randomInt(100_000, 1_000_000));
    await this.db.otpChallenge.create({
      data: {
        phone,
        codeHash: hashCode(phone, code).toString('hex'),
        expiresAt: new Date(Date.now() + CODE_LIFETIME_MS),
      },
    });
    await this.sms.sendOtp(phone, code);
    return config.demoMode ? { demoCode: code } : {};
  }

  async verifyOtp(phone: string, code: string) {
    const now = new Date();
    const challenge = await this.db.otpChallenge.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) throw invalidCode();

    // Counted before comparing, so parallel guesses cannot slip past the limit.
    const counted = await this.db.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, attempts: { lt: MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (counted.count === 0) throw invalidCode();

    if (!timingSafeEqual(hashCode(phone, code), Buffer.from(challenge.codeHash, 'hex'))) {
      throw invalidCode();
    }

    // Guarded so one code can start only one session.
    const consumed = await this.db.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (consumed.count === 0) throw invalidCode();

    const user = await this.db.user.findUnique({ where: { phone } });
    if (!user) throw invalidCode();
    return user;
  }

  async startSession(userId: string, role: Role): Promise<{ token: string; maxAgeMs: number }> {
    const token = randomBytes(32).toString('base64url');
    const maxAgeMs = SESSION_LIFETIME_MS[role];
    await this.db.session.create({
      data: { tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + maxAgeMs) },
    });
    return { token, maxAgeMs };
  }

  async endSession(token: string) {
    await this.db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  async userForToken(token: string): Promise<SessionUser | null> {
    const session = await this.db.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: { retailer: true } } },
    });
    if (!session || session.expiresAt <= new Date()) return null;
    const { user } = session;
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      retailer: user.retailer ? { id: user.retailer.id, shopName: user.retailer.shopName } : null,
    };
  }
}

import type { CookieOptions, Request, Response } from 'express';
import { config } from '../lib/config.ts';
import { currentUser, SESSION_COOKIE } from '../middleware/auth.ts';
import type { AuthService } from '../services/auth.service.ts';
import { requestOtpBody, verifyOtpBody } from '../validations/auth.validation.ts';

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProduction,
  path: '/',
};

export class AuthController {
  constructor(private readonly auth: AuthService) {}

  requestOtp = async (req: Request, res: Response) => {
    const { phone } = requestOtpBody.parse(req.body);
    res.json(await this.auth.requestOtp(phone));
  };

  verifyOtp = async (req: Request, res: Response) => {
    const { phone, code } = verifyOtpBody.parse(req.body);
    const user = await this.auth.verifyOtp(phone, code);
    const { token, maxAgeMs } = await this.auth.startSession(user.id, user.role);
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: maxAgeMs });
    res.status(204).end();
  };

  logout = async (req: Request, res: Response) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string') await this.auth.endSession(token);
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.status(204).end();
  };

  me = (req: Request, res: Response) => {
    res.json(currentUser(req));
  };
}

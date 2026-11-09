import { Router } from 'express';
import { z } from 'zod';
import type { DemoAccount, OtpRequestResponse } from '#shared/api';
import { config } from '../config.ts';
import { prisma } from '../db.ts';
import { authLimiter } from '../http/limits.ts';
import { currentUser, endSession, requireUser, startSession } from '../http/session.ts';
import { requestOtp, verifyOtp } from './otp.ts';

const phone = z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number.');

export const authRouter = Router();

authRouter.get('/demo-accounts', async (_req, res) => {
  if (!config.demoMode) {
    res.json({ accounts: [] });
    return;
  }
  const users = await prisma.user.findMany({
    include: { retailer: true },
    orderBy: [{ role: 'desc' }, { phone: 'asc' }],
    take: 4,
  });
  const accounts: DemoAccount[] = users.map((u) => ({
    phone: u.phone,
    role: u.role,
    label: u.retailer?.shopName ?? `Order desk (${u.name})`,
  }));
  res.json({ accounts });
});

authRouter.post('/otp/request', authLimiter, async (req, res) => {
  const body = z.object({ phone }).parse(req.body);
  const result: OtpRequestResponse = await requestOtp(body.phone);
  res.json(result);
});

authRouter.post('/otp/verify', authLimiter, async (req, res) => {
  const body = z.object({ phone, code: z.string().regex(/^\d{6}$/) }).parse(req.body);
  const user = await verifyOtp(body.phone, body.code);
  await startSession(res, user.id, user.role);
  res.status(204).end();
});

authRouter.post('/logout', async (req, res) => {
  await endSession(req, res);
  res.status(204).end();
});

authRouter.get('/me', requireUser, (req, res) => {
  res.json(currentUser(req));
});

import { z } from 'zod';

const phone = z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number.');

export const requestOtpBody = z.object({ phone });

export const verifyOtpBody = z.object({ phone, code: z.string().regex(/^\d{6}$/) });

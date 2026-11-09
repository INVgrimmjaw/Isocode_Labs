import { z } from 'zod';

export const createCaptureBody = z.object({
  retailerId: z.string().min(1).max(64),
  text: z.string().trim().min(2).max(2000),
});

const confirmLine = z.discriminatedUnion('action', [
  z.object({
    lineId: z.string().min(1).max(64),
    action: z.literal('ORDER'),
    skuId: z.string().min(1).max(64),
    quantity: z.number().int().min(1).max(100_000),
    unit: z.enum(['CASE', 'PIECE']),
  }),
  z.object({ lineId: z.string().min(1).max(64), action: z.literal('DROP') }),
]);

export const confirmCaptureBody = z.object({
  lines: z.array(confirmLine).min(1).max(200),
  expectedTotalPaise: z.number().int().min(0),
});

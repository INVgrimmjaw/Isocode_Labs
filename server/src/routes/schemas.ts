import { z } from 'zod';

/** Upper bounds catch typing slips like 5000000 before they reach pricing. */
export const placeOrderBody = z.object({
  items: z
    .array(
      z.object({
        skuId: z.string().min(1).max(64),
        cases: z.number().int().min(0).max(5000),
        pieces: z.number().int().min(0).max(100_000),
      }),
    )
    .min(1)
    .max(200),
  idempotencyKey: z.string().min(8).max(64),
  expectedTotalPaise: z.number().int().min(0),
});

export const captureText = z.string().trim().min(2).max(2000);

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

export const idParam = z.object({ id: z.string().min(1).max(64) });

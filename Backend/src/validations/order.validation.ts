import { z } from 'zod';

export const idParam = z.object({ id: z.string().min(1).max(64) });

/** Upper bounds catch typing slips like 5000000 before they reach pricing. */
const items = z
  .array(
    z.object({
      skuId: z.string().min(1).max(64),
      cases: z.number().int().min(0).max(5000),
      pieces: z.number().int().min(0).max(100_000),
    }),
  )
  .min(1)
  .max(200);

export const quoteBody = z.object({ items });

export const placeOrderBody = z.object({
  items,
  idempotencyKey: z.string().min(8).max(64),
  expectedTotalPaise: z.number().int().min(0),
});

export const orderListQuery = z.object({
  status: z.enum(['CREDIT_HOLD', 'READY', 'EXPORTED', 'REJECTED']).optional(),
});

export const rejectOrderBody = z.object({ reason: z.string().trim().min(3).max(300) });

import { beforeEach, describe, expect, it } from 'vitest';
import { percentOf } from '#shared/money';
import { prisma } from '../../src/db.ts';
import { cases, createFixture, expectedTotal, newKey, orderBody, PHONE, signIn, type Agent, type Fixture } from './fixtures.ts';

let f: Fixture;
let shopA: Agent;
let shopB: Agent;
let desk: Agent;

beforeEach(async () => {
  f = await createFixture();
  [shopA, shopB, desk] = await Promise.all([signIn(PHONE.shopA), signIn(PHONE.shopB), signIn(PHONE.desk)]);
});

const stockOf = async (skuId: string) =>
  (await prisma.sku.findUniqueOrThrow({ where: { id: skuId } })).stockPieces;

describe('placing an order', () => {
  it('prices, applies the scheme and stores a snapshot', async () => {
    const res = await shopA
      .post('/api/retailer/orders')
      .send(await orderBody(f.shopA.id, [cases(f.biscuit.id, 10)]))
      .expect(201);

    expect(res.body.status).toBe('READY');
    expect(res.body.source).toBe('APP');
    expect(res.body.freeCases).toBe(1);
    expect(res.body.lines[0]).toMatchObject({
      skuCode: 'SKU-BS-075',
      cases: 10,
      freeCases: 1,
      unitPricePaise: 810,
      schemeLabel: 'Buy 10 cases get 1 free',
    });
  });

  it('uses the retailer price and applies the slab', async () => {
    const res = await shopA
      .post('/api/retailer/orders')
      .send(await orderBody(f.shopA.id, [cases(f.detergent.id, 5)]))
      .expect(201);
    const gross = 5 * 20 * 9900;
    expect(res.body.grossPaise).toBe(gross);
    expect(res.body.discountPaise).toBe(percentOf(gross, 300));
  });

  it('takes free cases out of stock as well as paid ones', async () => {
    const before = await stockOf(f.biscuit.id);
    await shopA.post('/api/retailer/orders').send(await orderBody(f.shopA.id, [cases(f.biscuit.id, 10)])).expect(201);
    expect(await stockOf(f.biscuit.id)).toBe(before - 11 * 96);
  });

  it('keeps the order unchanged when the price later changes', async () => {
    const res = await shopA
      .post('/api/retailer/orders')
      .send(await orderBody(f.shopA.id, [cases(f.biscuit.id, 2)]))
      .expect(201);
    await prisma.sku.update({ where: { id: f.biscuit.id }, data: { dealerPricePaise: 5000 } });
    const again = await shopA.get(`/api/retailer/orders/${res.body.id}`).expect(200);
    expect(again.body.lines[0].unitPricePaise).toBe(810);
    expect(again.body.totalPaise).toBe(res.body.totalPaise);
  });

  it('refuses when the total the shop saw is out of date, and takes no stock', async () => {
    const before = await stockOf(f.biscuit.id);
    const body = await orderBody(f.shopA.id, [cases(f.biscuit.id, 2)]);
    await prisma.sku.update({ where: { id: f.biscuit.id }, data: { dealerPricePaise: 900 } });

    const res = await shopA.post('/api/retailer/orders').send(body).expect(409);
    expect(res.body.error.code).toBe('PRICE_CHANGED');
    expect(await stockOf(f.biscuit.id)).toBe(before);
    expect(await prisma.order.count()).toBe(0);
  });

  it('refuses a client-supplied low total', async () => {
    const items = [cases(f.biscuit.id, 2)];
    const res = await shopA
      .post('/api/retailer/orders')
      .send({ items, idempotencyKey: newKey(), expectedTotalPaise: 1 })
      .expect(409);
    expect(res.body.error.code).toBe('PRICE_CHANGED');
  });

  it('refuses an out of stock item', async () => {
    const res = await shopA
      .post('/api/retailer/orders')
      .send({ items: [cases(f.tea.id, 1)], idempotencyKey: newKey(), expectedTotalPaise: 0 })
      .expect(409);
    expect(res.body.error.code).toBe('STOCK_CHANGED');
    expect(res.body.error.details.lines[0]).toMatchObject({ skuId: f.tea.id, stock: 'OUT' });
  });

  it('refuses more than is in stock', async () => {
    const res = await shopA
      .post('/api/retailer/orders')
      .send({ items: [cases(f.detergent.id, 86)], idempotencyKey: newKey(), expectedTotalPaise: 0 })
      .expect(409);
    expect(res.body.error.code).toBe('STOCK_CHANGED');
  });

  it('rejects an unknown SKU', async () => {
    const res = await shopA
      .post('/api/retailer/orders')
      .send({ items: [cases('no-such-sku', 1)], idempotencyKey: newKey(), expectedTotalPaise: 0 })
      .expect(400);
    expect(res.body.error.code).toBe('UNKNOWN_SKU');
  });

  it.each([
    [{ items: [], idempotencyKey: 'abcdefgh', expectedTotalPaise: 0 }],
    [{ items: [{ skuId: 'x', cases: -1, pieces: 0 }], idempotencyKey: 'abcdefgh', expectedTotalPaise: 0 }],
    [{ items: [{ skuId: 'x', cases: 1.5, pieces: 0 }], idempotencyKey: 'abcdefgh', expectedTotalPaise: 0 }],
    [{ items: [{ skuId: 'x', cases: 999999, pieces: 0 }], idempotencyKey: 'abcdefgh', expectedTotalPaise: 0 }],
  ])('rejects invalid input %#', async (body) => {
    const res = await shopA.post('/api/retailer/orders').send(body).expect(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('refuses an order with no quantity', async () => {
    const res = await shopA
      .post('/api/retailer/orders')
      .send({ items: [cases(f.biscuit.id, 0)], idempotencyKey: newKey(), expectedTotalPaise: 0 })
      .expect(400);
    expect(res.body.error.code).toBe('EMPTY_ORDER');
  });
});

describe('retries and races', () => {
  it('creates one order when the same request is retried', async () => {
    const body = await orderBody(f.shopA.id, [cases(f.biscuit.id, 2)]);
    const first = await shopA.post('/api/retailer/orders').send(body).expect(201);
    const retry = await shopA.post('/api/retailer/orders').send(body).expect(201);

    expect(retry.body.id).toBe(first.body.id);
    expect(await prisma.order.count()).toBe(1);
    expect(await stockOf(f.biscuit.id)).toBe(340 * 96 - 2 * 96);
  });

  it('creates one order from a double tap arriving together', async () => {
    const body = await orderBody(f.shopA.id, [cases(f.biscuit.id, 2)]);
    const results = await Promise.all([
      shopA.post('/api/retailer/orders').send(body),
      shopA.post('/api/retailer/orders').send(body),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results[0]?.body.id).toBe(results[1]?.body.id);
    expect(await prisma.order.count()).toBe(1);
  });

  it('does not let two shops share a key', async () => {
    const key = newKey();
    const a = { ...(await orderBody(f.shopA.id, [cases(f.biscuit.id, 1)])), idempotencyKey: key };
    const b = { ...(await orderBody(f.shopB.id, [cases(f.biscuit.id, 1)])), idempotencyKey: key };
    const first = await shopA.post('/api/retailer/orders').send(a).expect(201);
    const second = await shopB.post('/api/retailer/orders').send(b).expect(201);
    expect(second.body.id).not.toBe(first.body.id);
  });

  it('sells the last cases to only one of two shops ordering together', async () => {
    await prisma.sku.update({ where: { id: f.biscuit.id }, data: { stockPieces: 2 * 96 } });
    const items = [cases(f.biscuit.id, 2)];
    const [a, b] = await Promise.all([
      shopA.post('/api/retailer/orders').send(await orderBody(f.shopA.id, items)),
      shopB.post('/api/retailer/orders').send(await orderBody(f.shopB.id, items)),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await stockOf(f.biscuit.id)).toBe(0);
  });

  it('never approves two orders that together exceed the credit limit', async () => {
    // Each order fits in the available credit on its own. Together they do not.
    const items = [cases(f.detergent.id, 8)];
    const body = () => orderBody(f.shopA.id, items);
    const total = await expectedTotal(f.shopA.id, items);
    await prisma.retailer.update({
      where: { id: f.shopA.id },
      data: { creditLimitPaise: Math.floor(total * 1.5) },
    });

    const results = await Promise.all([
      shopA.post('/api/retailer/orders').send(await body()),
      shopA.post('/api/retailer/orders').send(await body()),
    ]);
    expect(results.map((r) => r.body.status).sort()).toEqual(['CREDIT_HOLD', 'READY']);
  });
});

describe('credit', () => {
  it('holds an order that goes over the limit, and records by how much', async () => {
    const items = [cases(f.biscuit.id, 3)];
    const total = await expectedTotal(f.shopB.id, items);
    const res = await shopB.post('/api/retailer/orders').send(await orderBody(f.shopB.id, items)).expect(201);

    expect(res.body.status).toBe('CREDIT_HOLD');
    expect(res.body.overLimitPaise).toBe(800_000 + total - 1_000_000);
  });

  it('allows an order that lands exactly on the limit', async () => {
    const items = [cases(f.biscuit.id, 2)];
    const total = await expectedTotal(f.shopB.id, items);
    await prisma.retailer.update({
      where: { id: f.shopB.id },
      data: { creditLimitPaise: 800_000 + total },
    });
    const res = await shopB.post('/api/retailer/orders').send(await orderBody(f.shopB.id, items)).expect(201);
    expect(res.body.status).toBe('READY');
  });

  it('counts open orders against the limit', async () => {
    const items = [cases(f.biscuit.id, 1)];
    const total = await expectedTotal(f.shopB.id, items);
    await prisma.retailer.update({
      where: { id: f.shopB.id },
      data: { creditLimitPaise: 800_000 + total + 1 },
    });
    await shopB.post('/api/retailer/orders').send(await orderBody(f.shopB.id, items)).expect(201);
    const second = await shopB.post('/api/retailer/orders').send(await orderBody(f.shopB.id, items)).expect(201);
    expect(second.body.status).toBe('CREDIT_HOLD');
  });

  it('lets the desk release a hold and records who did', async () => {
    const placed = await shopB
      .post('/api/retailer/orders')
      .send(await orderBody(f.shopB.id, [cases(f.biscuit.id, 3)]))
      .expect(201);

    const released = await desk.post(`/api/desk/orders/${placed.body.id}/release`).expect(200);
    expect(released.body.status).toBe('READY');
    expect(released.body.events[0]).toMatchObject({ action: 'Credit hold released', actorName: 'Desk' });

    await desk.post(`/api/desk/orders/${placed.body.id}/release`).expect(409);
  });

  it('returns stock, including free cases, when an order is rejected', async () => {
    const before = await stockOf(f.biscuit.id);
    const placed = await shopA
      .post('/api/retailer/orders')
      .send(await orderBody(f.shopA.id, [cases(f.biscuit.id, 10)]))
      .expect(201);
    expect(await stockOf(f.biscuit.id)).toBe(before - 11 * 96);

    const rejected = await desk
      .post(`/api/desk/orders/${placed.body.id}/reject`)
      .send({ reason: 'Shop closed' })
      .expect(200);
    expect(rejected.body.status).toBe('REJECTED');
    expect(await stockOf(f.biscuit.id)).toBe(before);

    await desk.post(`/api/desk/orders/${placed.body.id}/reject`).send({ reason: 'Again' }).expect(409);
    expect(await stockOf(f.biscuit.id)).toBe(before);
  });

  it('requires a reason to reject', async () => {
    await desk.post('/api/desk/orders/any/reject').send({ reason: '' }).expect(400);
  });
});

describe('repeat ordering data', () => {
  it('reports the last order, ignoring rejected ones', async () => {
    const placed = await shopA
      .post('/api/retailer/orders')
      .send(await orderBody(f.shopA.id, [cases(f.biscuit.id, 1)]))
      .expect(201);
    expect((await shopA.get('/api/retailer/home').expect(200)).body.lastOrder.id).toBe(placed.body.id);

    await desk.post(`/api/desk/orders/${placed.body.id}/reject`).send({ reason: 'Duplicate' }).expect(200);
    expect((await shopA.get('/api/retailer/home').expect(200)).body.lastOrder).toBeNull();
  });
});

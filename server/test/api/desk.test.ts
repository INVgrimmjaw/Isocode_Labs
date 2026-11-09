import { beforeEach, describe, expect, it } from 'vitest';
import type { OrderDetail } from '#shared/api';
import { prisma } from '../../src/db.ts';
import { istDateKey } from '../../src/time.ts';
import { cases, createFixture, orderBody, PHONE, signIn, type Agent, type Fixture } from './fixtures.ts';

let f: Fixture;
let shopA: Agent;
let shopB: Agent;
let desk: Agent;

beforeEach(async () => {
  f = await createFixture();
  [shopA, shopB, desk] = await Promise.all([signIn(PHONE.shopA), signIn(PHONE.shopB), signIn(PHONE.desk)]);
});

async function readyOrder(cartCases = 10): Promise<OrderDetail> {
  const body = await orderBody(f.shopA.id, [cases(f.biscuit.id, cartCases)]);
  return (await shopA.post('/api/retailer/orders').send(body).expect(201)).body;
}

async function heldOrder(): Promise<OrderDetail> {
  const body = await orderBody(f.shopB.id, [cases(f.biscuit.id, 3)]);
  const res = await shopB.post('/api/retailer/orders').send(body).expect(201);
  expect(res.body.status).toBe('CREDIT_HOLD');
  return res.body;
}

describe('order queue', () => {
  it('filters by status', async () => {
    const ready = await readyOrder();
    const held = await heldOrder();
    const onHold = await desk.get('/api/desk/orders?status=CREDIT_HOLD').expect(200);
    expect(onHold.body.map((o: OrderDetail) => o.id)).toEqual([held.id]);
    const all = await desk.get('/api/desk/orders').expect(200);
    expect(all.body.map((o: OrderDetail) => o.id).sort()).toEqual([ready.id, held.id].sort());
  });

  it('searches by shop name and by order number', async () => {
    const order = await readyOrder();
    expect((await desk.get('/api/desk/orders?q=shop a').expect(200)).body).toHaveLength(1);
    expect((await desk.get(`/api/desk/orders?q=${order.label}`).expect(200)).body).toHaveLength(1);
    expect((await desk.get('/api/desk/orders?q=nothing').expect(200)).body).toHaveLength(0);
  });

  it('shows the desk a shop’s credit on the order', async () => {
    const held = await heldOrder();
    const detail = await desk.get(`/api/desk/orders/${held.id}`).expect(200);
    expect(detail.body.credit.limitPaise).toBe(1_000_000);
  });

  it('counts what needs attention', async () => {
    await readyOrder();
    await heldOrder();
    await desk.post('/api/desk/captures').send({ retailerId: f.shopA.id, text: '5 peti biscuit' }).expect(201);
    const counts = await desk.get('/api/desk/counts').expect(200);
    expect(counts.body).toMatchObject({ creditHold: 1, ready: 1, captures: 1 });
  });
});

describe('Tally export', () => {
  it('lists only ready orders, and says how many are held', async () => {
    const ready = await readyOrder();
    await heldOrder();
    const { body } = await desk.get('/api/desk/tally').expect(200);
    expect(body.orders.map((o: OrderDetail) => o.id)).toEqual([ready.id]);
    expect(body.held).toBe(1);
  });

  it('exports, marks orders exported and offers the file', async () => {
    const order = await readyOrder();
    const batch = await desk.post('/api/desk/tally/batches').send({ orderIds: [order.id] }).expect(201);
    expect(batch.body).toMatchObject({ orderCount: 1, totalPaise: order.totalPaise });

    const after = await desk.get(`/api/desk/orders/${order.id}`).expect(200);
    expect(after.body.status).toBe('EXPORTED');
    expect(after.body.events.at(-1)).toMatchObject({ action: 'Exported to Tally' });

    const file = await desk.get(`/api/desk/tally/batches/${batch.body.id}/file`).expect(200);
    expect(file.headers['content-type']).toMatch(/xml/);
    expect(file.headers['content-disposition']).toMatch(/attachment; filename="?tally-TE-0001\.xml"?/);
    expect(file.text).toContain(`<VOUCHERNUMBER>${order.label}</VOUCHERNUMBER>`);
    expect(file.text).toContain('<ACTUALQTY>1056 pcs</ACTUALQTY>');
  });

  it('cannot bill the same order twice', async () => {
    const order = await readyOrder();
    await desk.post('/api/desk/tally/batches').send({ orderIds: [order.id] }).expect(201);
    await desk.post('/api/desk/tally/batches').send({ orderIds: [order.id] }).expect(400);
    expect(await prisma.tallyBatch.count()).toBe(1);
  });

  it('exports once when two people press export together', async () => {
    const order = await readyOrder();
    const results = await Promise.all([
      desk.post('/api/desk/tally/batches').send({ orderIds: [order.id] }),
      desk.post('/api/desk/tally/batches').send({ orderIds: [order.id] }),
    ]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await prisma.tallyBatch.count()).toBe(1);
    const shop = await prisma.retailer.findUniqueOrThrow({ where: { id: f.shopA.id } });
    expect(shop.outstandingPaise).toBe(order.totalPaise);
  });

  it('refuses a held order', async () => {
    const held = await heldOrder();
    await desk.post('/api/desk/tally/batches').send({ orderIds: [held.id] }).expect(400);
  });

  it('refuses the whole batch if one order is no longer ready', async () => {
    const ready = await readyOrder();
    const held = await heldOrder();
    const res = await desk.post('/api/desk/tally/batches').send({ orderIds: [ready.id, held.id] }).expect(409);
    expect(res.body.error.code).toBe('ORDERS_CHANGED');
    expect(await prisma.tallyBatch.count()).toBe(0);
  });

  it('moves the value from open orders to outstanding, so credit is not counted twice', async () => {
    const order = await readyOrder();
    const before = (await shopA.get('/api/retailer/home').expect(200)).body.credit;
    expect(before).toMatchObject({ openOrdersPaise: order.totalPaise, outstandingPaise: 0 });

    await desk.post('/api/desk/tally/batches').send({ orderIds: [order.id] }).expect(201);

    const after = (await shopA.get('/api/retailer/home').expect(200)).body.credit;
    expect(after).toMatchObject({ openOrdersPaise: 0, outstandingPaise: order.totalPaise });
    expect(after.availablePaise).toBe(before.availablePaise);
  });
});

describe('van loading lists', () => {
  it('adds up cases per route and lists free cases apart', async () => {
    await readyOrder(10);
    await readyOrder(2);
    const { body } = await desk.get('/api/desk/van-lists').expect(200);
    expect(body.date).toBe(istDateKey(new Date()));
    expect(body.vans).toHaveLength(1);
    expect(body.vans[0]).toMatchObject({ beat: 'Route 1', orderCount: 2 });
    expect(body.vans[0].lines[0]).toMatchObject({ skuCode: 'SKU-BS-075', cases: 12, freeCases: 1 });
    expect(body.vans[0].drops).toHaveLength(2);
  });

  it('leaves out held orders', async () => {
    await heldOrder();
    expect((await desk.get('/api/desk/van-lists').expect(200)).body.vans).toEqual([]);
  });

  it('rolls loose pieces up into cases', async () => {
    const body = await orderBody(f.shopA.id, [{ skuId: f.biscuit.id, cases: 1, pieces: 100 }]);
    await shopA.post('/api/retailer/orders').send(body).expect(201);
    const { body: lists } = await desk.get('/api/desk/van-lists').expect(200);
    expect(lists.vans[0].lines[0]).toMatchObject({ cases: 2, pieces: 4 });
  });

  it('finds nothing on another date', async () => {
    await readyOrder();
    expect((await desk.get('/api/desk/van-lists?date=2020-01-01').expect(200)).body.vans).toEqual([]);
  });

  it('rejects a malformed date', async () => {
    await desk.get('/api/desk/van-lists?date=yesterday').expect(400);
  });
});

describe('inactive retailers', () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

  async function backdateOrder(createdAt: Date) {
    const order = await readyOrder(1);
    await prisma.order.update({ where: { id: order.id }, data: { createdAt } });
  }

  it('lists a shop with no order in 14 days, and one that has never ordered', async () => {
    await backdateOrder(daysAgo(20));
    const { body } = await desk.get('/api/desk/retailers/inactive').expect(200);
    expect(body.map((r: { shopName: string }) => r.shopName)).toEqual(['Shop B', 'Shop A']);
    expect(body[0].daysSince).toBeNull();
    expect(body[1].daysSince).toBe(20);
  });

  it('includes a shop at exactly 14 days', async () => {
    await backdateOrder(daysAgo(14));
    const { body } = await desk.get('/api/desk/retailers/inactive').expect(200);
    expect(body.map((r: { shopName: string }) => r.shopName)).toContain('Shop A');
  });

  it('leaves out a shop that ordered 13 days ago', async () => {
    await backdateOrder(daysAgo(13));
    const { body } = await desk.get('/api/desk/retailers/inactive').expect(200);
    expect(body.map((r: { shopName: string }) => r.shopName)).not.toContain('Shop A');
  });

  it('does not count a rejected order as activity', async () => {
    const order = await readyOrder(1);
    await desk.post(`/api/desk/orders/${order.id}/reject`).send({ reason: 'Duplicate' }).expect(200);
    const { body } = await desk.get('/api/desk/retailers/inactive').expect(200);
    expect(body.map((r: { shopName: string }) => r.shopName)).toContain('Shop A');
  });
});

import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { rupeesToPaise } from '#shared/money';
import { app, cases, createFixture, orderBody, PHONE, signIn, type Fixture } from './fixtures.ts';

let f: Fixture;

beforeEach(async () => {
  f = await createFixture();
});

describe('who can reach what', () => {
  it.each(['/api/retailer/home', '/api/retailer/orders', '/api/desk/orders', '/api/desk/tally'])(
    'requires sign-in for %s',
    async (path) => {
      await request(app).get(path).expect(401);
    },
  );

  it.each([
    '/api/desk/orders',
    '/api/desk/captures',
    '/api/desk/tally',
    '/api/desk/retailers',
    '/api/desk/retailers/inactive',
    '/api/desk/van-lists',
  ])('blocks a retailer from %s', async (path) => {
    const retailer = await signIn(PHONE.shopA);
    await retailer.get(path).expect(403);
  });

  it('blocks a retailer from desk actions', async () => {
    const retailer = await signIn(PHONE.shopA);
    await retailer.post('/api/desk/tally/batches').send({ orderIds: ['x'] }).expect(403);
    await retailer.post('/api/desk/orders/x/release').expect(403);
  });

  it('blocks the desk from placing orders as a retailer', async () => {
    const desk = await signIn(PHONE.desk);
    await desk.get('/api/retailer/home').expect(403);
    await desk.post('/api/retailer/orders').send({}).expect(403);
  });
});

describe("one shop's data is invisible to another", () => {
  it('shows each shop its own price', async () => {
    const a = await signIn(PHONE.shopA);
    const b = await signIn(PHONE.shopB);
    const priceIn = (body: { skus: { id: string; unitPricePaise: number }[] }) =>
      body.skus.find((s) => s.id === f.detergent.id)?.unitPricePaise;

    expect(priceIn((await a.get('/api/retailer/home').expect(200)).body)).toBe(rupeesToPaise(99));
    expect(priceIn((await b.get('/api/retailer/home').expect(200)).body)).toBe(rupeesToPaise(101.5));
  });

  it("shows each shop only its own credit", async () => {
    const b = await signIn(PHONE.shopB);
    const { body } = await b.get('/api/retailer/home').expect(200);
    expect(body.credit).toMatchObject({
      limitPaise: rupeesToPaise(10_000),
      outstandingPaise: rupeesToPaise(8_000),
      availablePaise: rupeesToPaise(2_000),
    });
  });

  it("returns 404 for another shop's order", async () => {
    const a = await signIn(PHONE.shopA);
    const b = await signIn(PHONE.shopB);
    const body = await orderBody(f.shopA.id, [cases(f.biscuit.id, 1)]);
    const placed = await a.post('/api/retailer/orders').send(body).expect(201);

    await a.get(`/api/retailer/orders/${placed.body.id}`).expect(200);
    await b.get(`/api/retailer/orders/${placed.body.id}`).expect(404);
  });

  it("keeps another shop's orders out of the list", async () => {
    const a = await signIn(PHONE.shopA);
    const b = await signIn(PHONE.shopB);
    await a.post('/api/retailer/orders').send(await orderBody(f.shopA.id, [cases(f.biscuit.id, 1)])).expect(201);
    expect((await b.get('/api/retailer/orders').expect(200)).body).toEqual([]);
  });

  it('ignores a retailer id smuggled into an order', async () => {
    const a = await signIn(PHONE.shopA);
    const body = await orderBody(f.shopA.id, [cases(f.biscuit.id, 1)]);
    const placed = await a
      .post('/api/retailer/orders')
      .send({ ...body, retailerId: f.shopB.id })
      .expect(201);
    expect(placed.body.retailer.id).toBe(f.shopA.id);
  });

  it("cannot open or confirm another shop's capture", async () => {
    const a = await signIn(PHONE.shopA);
    const b = await signIn(PHONE.shopB);
    const capture = await a.post('/api/retailer/captures').send({ text: '5 peti biscuit' }).expect(201);
    const lineId = capture.body.lines[0].id;

    await b.get(`/api/retailer/captures/${capture.body.id}`).expect(404);
    await b
      .post(`/api/retailer/captures/${capture.body.id}/confirm`)
      .send({
        lines: [{ lineId, action: 'ORDER', skuId: f.biscuit.id, quantity: 5, unit: 'CASE' }],
        expectedTotalPaise: 0,
      })
      .expect(404);
    await b.post(`/api/retailer/captures/${capture.body.id}/discard`).expect(409);
  });
});

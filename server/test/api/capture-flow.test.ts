import { beforeEach, describe, expect, it } from 'vitest';
import type { CaptureDetail, ConfirmLine } from '#shared/api';
import { priceCart } from '#shared/pricing';
import { prisma } from '../../src/db.ts';
import { createFixture, PHONE, signIn, type Agent, type Fixture } from './fixtures.ts';

const SAMPLE = 'bhaiya 5 peti biscuit chhota, 2 peti washing powder 1 kilo, chai patti 250 wala 1 peti';

let f: Fixture;
let shopA: Agent;
let shopB: Agent;
let desk: Agent;

beforeEach(async () => {
  f = await createFixture();
  [shopA, shopB, desk] = await Promise.all([signIn(PHONE.shopA), signIn(PHONE.shopB), signIn(PHONE.desk)]);
});

async function inbound(retailerId: string, text: string): Promise<CaptureDetail> {
  return (await desk.post('/api/desk/captures').send({ retailerId, text }).expect(201)).body;
}

function totalFor(capture: CaptureDetail, lines: ConfirmLine[]): number {
  const items = lines.flatMap((l) =>
    l.action === 'DROP'
      ? []
      : [{ skuId: l.skuId, cases: l.unit === 'CASE' ? l.quantity : 0, pieces: l.unit === 'PIECE' ? l.quantity : 0 }],
  );
  const skus = new Map(capture.catalogue.skus.map((s) => [s.id, s]));
  return priceCart(items, skus, capture.catalogue.schemes, new Date()).totalPaise;
}

function confirmation(capture: CaptureDetail, lines: ConfirmLine[]) {
  return { lines, expectedTotalPaise: totalFor(capture, lines) };
}

/** Takes every line as suggested, leaving out what stock cannot cover, as a reviewer would. */
function acceptAll(capture: CaptureDetail): ConfirmLine[] {
  return capture.lines.map((line): ConfirmLine => {
    const sku = capture.catalogue.skus.find((s) => s.id === line.suggestedSkuId);
    if (!sku || sku.stockPieces === 0) return { lineId: line.id, action: 'DROP' };
    return {
      lineId: line.id,
      action: 'ORDER',
      skuId: sku.id,
      quantity: line.quantity ?? 1,
      unit: line.unit === 'PIECE' ? 'PIECE' : 'CASE',
    };
  });
}

describe('capturing an order from a message', () => {
  it('reads the sample message into reviewable lines', async () => {
    const capture = await inbound(f.shopA.id, SAMPLE);
    expect(capture.status).toBe('NEEDS_REVIEW');
    expect(capture.engine).toBe('MATCHER');
    expect(capture.engineNote).toMatch(/not configured/);
    expect(capture.lines.map((l) => l.originalWords)).toEqual([
      '5 peti biscuit chhota',
      '2 peti washing powder 1 kilo',
      'chai patti 250 wala 1 peti',
    ]);
    expect(capture.lines.map((l) => l.suggestedSkuId)).toEqual([f.biscuit.id, f.detergent.id, f.tea.id]);
    expect(capture.lines.every((l) => l.alternativeSkuIds.length === 2)).toBe(true);
  });

  it('places no order until a person confirms', async () => {
    await inbound(f.shopA.id, SAMPLE);
    expect(await prisma.order.count()).toBe(0);
  });

  it('prices the capture for that shop', async () => {
    const capture = await inbound(f.shopA.id, SAMPLE);
    expect(capture.catalogue.skus.find((s) => s.id === f.detergent.id)?.unitPricePaise).toBe(9900);
  });

  it('reports a message with no items', async () => {
    const res = await desk
      .post('/api/desk/captures')
      .send({ retailerId: f.shopA.id, text: 'namaste bhaiya' })
      .expect(422);
    expect(res.body.error.code).toBe('NO_ITEMS');
  });

  it('rejects text that is too long', async () => {
    await desk.post('/api/desk/captures').send({ retailerId: f.shopA.id, text: 'a'.repeat(2001) }).expect(400);
  });

  it('returns 404 for an unknown shop', async () => {
    await desk.post('/api/desk/captures').send({ retailerId: 'nope', text: '5 peti biscuit' }).expect(404);
  });
});

describe('confirming', () => {
  it('creates an order marked as AI captured, leaving out what was dropped', async () => {
    const capture = await inbound(f.shopA.id, SAMPLE);
    const res = await desk
      .post(`/api/desk/captures/${capture.id}/confirm`)
      .send(confirmation(capture, acceptAll(capture)))
      .expect(200);

    expect(res.body.order.source).toBe('AI_CAPTURE');
    expect(res.body.order.lines).toHaveLength(2);
    expect(res.body.order.captureId).toBe(capture.id);
    expect(res.body.order.events[0]).toMatchObject({ action: 'Confirmed from a message', actorName: 'Desk' });
  });

  it('writes a reply that names the line left out', async () => {
    const capture = await inbound(f.shopA.id, SAMPLE);
    const res = await desk
      .post(`/api/desk/captures/${capture.id}/confirm`)
      .send(confirmation(capture, acceptAll(capture)))
      .expect(200);
    expect(res.body.replyText).toContain('Nahi jud paya: chai patti 250 wala 1 peti');
    expect(res.body.replyText).toContain('GST sahit');
  });

  it('refuses to confirm a line whose unit is still unclear', async () => {
    const capture = await inbound(f.shopA.id, 'biscuit 5');
    const line = capture.lines[0]!;
    expect(line.unit).toBe('UNCLEAR');
    await desk
      .post(`/api/desk/captures/${capture.id}/confirm`)
      .send({
        lines: [{ lineId: line.id, action: 'ORDER', skuId: f.biscuit.id, quantity: 5, unit: 'UNCLEAR' }],
        expectedTotalPaise: 0,
      })
      .expect(400);
    expect(await prisma.order.count()).toBe(0);
  });

  it('requires a decision on every line', async () => {
    const capture = await inbound(f.shopA.id, SAMPLE);
    const lines = acceptAll(capture).slice(0, 2);
    const res = await desk
      .post(`/api/desk/captures/${capture.id}/confirm`)
      .send(confirmation(capture, lines))
      .expect(400);
    expect(res.body.error.code).toBe('INCOMPLETE_REVIEW');
  });

  it('refuses a confirmation in which every line was dropped', async () => {
    const capture = await inbound(f.shopA.id, SAMPLE);
    const lines = capture.lines.map((l): ConfirmLine => ({ lineId: l.id, action: 'DROP' }));
    const res = await desk
      .post(`/api/desk/captures/${capture.id}/confirm`)
      .send({ lines, expectedTotalPaise: 0 })
      .expect(400);
    expect(res.body.error.code).toBe('EMPTY_ORDER');
  });

  it('runs the normal scheme and credit rules', async () => {
    const capture = await inbound(f.shopB.id, '12 peti biscuit chhota');
    const res = await desk
      .post(`/api/desk/captures/${capture.id}/confirm`)
      .send(confirmation(capture, acceptAll(capture)))
      .expect(200);
    expect(res.body.order.freeCases).toBe(1);
    expect(res.body.order.status).toBe('CREDIT_HOLD');
    expect(res.body.replyText).toContain('hold');
  });

  it('gives one order for a double confirm', async () => {
    const capture = await inbound(f.shopA.id, SAMPLE);
    const body = confirmation(capture, acceptAll(capture));
    const [a, b] = await Promise.all([
      desk.post(`/api/desk/captures/${capture.id}/confirm`).send(body),
      desk.post(`/api/desk/captures/${capture.id}/confirm`).send(body),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.order.id).toBe(b.body.order.id);
    expect(await prisma.order.count()).toBe(1);
  });

  it('leaves nothing behind when the order fails', async () => {
    const capture = await inbound(f.shopA.id, 'pila wala 4 peti');
    const line = capture.lines[0]!;
    await desk
      .post(`/api/desk/captures/${capture.id}/confirm`)
      .send({
        lines: [{ lineId: line.id, action: 'ORDER', skuId: f.tea.id, quantity: 4, unit: 'CASE' }],
        expectedTotalPaise: 0,
      })
      .expect(409);

    expect(await prisma.retailerAlias.count()).toBe(0);
    expect((await prisma.capture.findUniqueOrThrow({ where: { id: capture.id } })).status).toBe('NEEDS_REVIEW');
  });

  it('cannot confirm a rejected message', async () => {
    const capture = await inbound(f.shopA.id, SAMPLE);
    await desk.post(`/api/desk/captures/${capture.id}/reject`).expect(204);
    const res = await desk
      .post(`/api/desk/captures/${capture.id}/confirm`)
      .send(confirmation(capture, acceptAll(capture)))
      .expect(409);
    expect(res.body.error.code).toBe('ALREADY_DECIDED');
  });
});

describe('learning from desk corrections', () => {
  async function correct(retailerId: string, text: string, skuId: string) {
    const capture = await inbound(retailerId, text);
    const line = capture.lines[0]!;
    const lines: ConfirmLine[] = [{ lineId: line.id, action: 'ORDER', skuId, quantity: line.quantity ?? 1, unit: 'CASE' }];
    return desk.post(`/api/desk/captures/${capture.id}/confirm`).send(confirmation(capture, lines));
  }

  it('remembers a correction and applies it to the next message', async () => {
    const first = await inbound(f.shopA.id, 'neela packet wala 4 peti');
    expect(first.lines[0]?.reason).toBe('UNSURE');

    const res = await correct(f.shopA.id, 'neela packet wala 4 peti', f.detergent.id);
    expect(res.status).toBe(200);
    expect(res.body.aliasesLearned).toBe(1);

    const next = await inbound(f.shopA.id, '2 peti neela packet wala');
    expect(next.lines[0]).toMatchObject({
      suggestedSkuId: f.detergent.id,
      reason: 'ALIAS',
      band: 'HIGH',
      quantity: 2,
    });
  });

  it('keeps an alias to the shop that taught it', async () => {
    await correct(f.shopA.id, 'neela wala 4 peti', f.detergent.id);
    const other = await inbound(f.shopB.id, 'neela wala 4 peti');
    expect(other.lines[0]?.reason).not.toBe('ALIAS');
  });

  it('replaces an alias when the desk corrects it again', async () => {
    await correct(f.shopA.id, 'neela wala 4 peti', f.detergent.id);
    await correct(f.shopA.id, 'neela wala 4 peti', f.biscuit.id);
    expect(await prisma.retailerAlias.count()).toBe(1);
    const next = await inbound(f.shopA.id, 'neela wala 1 peti');
    expect(next.lines[0]?.suggestedSkuId).toBe(f.biscuit.id);
  });

  it('counts how often an alias proved right', async () => {
    await correct(f.shopA.id, 'neela wala 4 peti', f.detergent.id);
    const capture = await inbound(f.shopA.id, 'neela wala 2 peti');
    await desk
      .post(`/api/desk/captures/${capture.id}/confirm`)
      .send(confirmation(capture, acceptAll(capture)))
      .expect(200);
    expect((await prisma.retailerAlias.findFirstOrThrow()).timesUsed).toBe(1);
  });

  it('does not learn anything when the suggestion was right', async () => {
    const capture = await inbound(f.shopA.id, '5 peti biscuit');
    await desk
      .post(`/api/desk/captures/${capture.id}/confirm`)
      .send(confirmation(capture, acceptAll(capture)))
      .expect(200);
    expect(await prisma.retailerAlias.count()).toBe(0);
  });

  it("does not learn from a retailer's own edits", async () => {
    const created = await shopA.post('/api/retailer/captures').send({ text: 'neela wala 4 peti' }).expect(201);
    const capture: CaptureDetail = created.body;
    const line = capture.lines[0]!;
    const lines: ConfirmLine[] = [
      { lineId: line.id, action: 'ORDER', skuId: f.detergent.id, quantity: 4, unit: 'CASE' },
    ];
    await shopA.post(`/api/retailer/captures/${capture.id}/confirm`).send(confirmation(capture, lines)).expect(200);
    expect(await prisma.retailerAlias.count()).toBe(0);
  });

  it("uses a shop's order history to choose", async () => {
    const before = await inbound(f.shopB.id, '1 peti biscuit');
    const placed = before.lines[0]!;
    expect(placed.suggestedSkuId).toBe(f.biscuit.id);

    await prisma.order.create({
      data: {
        retailerId: f.shopB.id,
        placedById: f.desk.id,
        status: 'EXPORTED',
        source: 'APP',
        grossPaise: 0,
        discountPaise: 0,
        taxablePaise: 0,
        gstPaise: 0,
        totalPaise: 0,
        lines: {
          create: {
            skuId: f.biscuit.id,
            skuCode: f.biscuit.code,
            skuName: f.biscuit.name,
            unitsPerCase: 96,
            cases: 2,
            pieces: 0,
            totalPieces: 192,
            unitPricePaise: 810,
            gstBps: 500,
            grossPaise: 0,
            discountPaise: 0,
            taxablePaise: 0,
            gstPaise: 0,
            totalPaise: 0,
          },
        },
      },
    });
    const after = await inbound(f.shopB.id, '1 peti biscuit');
    expect(after.lines[0]?.reason).toBe('HISTORY');
  });
});

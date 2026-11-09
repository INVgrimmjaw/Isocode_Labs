import request from 'supertest';
import { vi } from 'vitest';
import { createApp } from '../../app.ts';
import { container } from '../../container.ts';
import { prisma } from '../../lib/prisma.ts';
import { mockSmsGateway } from '../../lib/sms.ts';
import type { CartItem } from '../../services/scheme-engine.ts';
import { rupeesToPaise } from '../../utils/money.ts';

export const app = createApp();

export type Agent = ReturnType<typeof request.agent>;

export const PHONE = {
  shopA: '9111111111',
  shopB: '9222222222',
  desk: '9333333333',
  unknown: '9444444444',
};

const TABLES =
  '"CaptureLine","Capture","OrderLine","Order","TallyBatch","RetailerAlias","SchemeSlab","Scheme","RetailerPrice","Sku","Session","OtpChallenge","User","Retailer"';

function createSku(over: {
  code: string;
  name: string;
  family: string;
  sizeGrams: number;
  unitsPerCase: number;
  rupees: number;
  gstBps: number;
  stockCases: number;
  keywords: string[];
}) {
  const { rupees, stockCases, ...fields } = over;
  return prisma.sku.create({
    data: {
      ...fields,
      nameHi: fields.name,
      brand: 'Test',
      dealerPricePaise: rupeesToPaise(rupees),
      stockPieces: stockCases * fields.unitsPerCase,
      packKind: 'box',
    },
  });
}

/** The client's three sample SKUs, one shop with a special price, and one with tight credit. */
export async function createFixture() {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES} RESTART IDENTITY CASCADE`);

  const biscuit = await createSku({
    code: 'SKU-BS-075',
    name: 'Glucose biscuit 75 g, case of 96',
    family: 'glucose-biscuit',
    sizeGrams: 75,
    unitsPerCase: 96,
    rupees: 8.1,
    gstBps: 500,
    stockCases: 340,
    keywords: ['biscuit', 'glucose'],
  });
  const detergent = await createSku({
    code: 'SKU-DT-1KG',
    name: 'Detergent powder 1 kg, case of 20',
    family: 'detergent-powder',
    sizeGrams: 1000,
    unitsPerCase: 20,
    rupees: 101.5,
    gstBps: 1800,
    stockCases: 85,
    keywords: ['detergent', 'washing', 'powder'],
  });
  const tea = await createSku({
    code: 'SKU-TE-250',
    name: 'Tea leaf 250 g, case of 40',
    family: 'tea-leaf',
    sizeGrams: 250,
    unitsPerCase: 40,
    rupees: 118,
    gstBps: 500,
    stockCases: 0,
    keywords: ['chai', 'tea', 'patti'],
  });

  await prisma.scheme.create({
    data: {
      skuId: biscuit.id,
      kind: 'FREE_GOODS',
      label: 'Buy 10 cases get 1 free',
      labelHi: '10 पेटी पर 1 फ्री',
      buyCases: 10,
      freeCases: 1,
      validFrom: new Date(Date.now() - 86_400_000),
    },
  });
  await prisma.scheme.create({
    data: {
      skuId: detergent.id,
      kind: 'SLAB_DISCOUNT',
      label: '3% off 5 or more cases',
      labelHi: '5 पेटी पर 3%',
      validFrom: new Date(Date.now() - 86_400_000),
      slabs: { create: [{ minCases: 5, discountBps: 300 }] },
    },
  });

  const shopA = await prisma.retailer.create({
    data: {
      shopName: 'Shop A',
      ownerName: 'Owner A',
      phone: PHONE.shopA,
      area: 'North',
      beat: 'Route 1',
      tallyLedgerName: 'Shop A',
      creditLimitPaise: rupeesToPaise(100_000),
      users: { create: { phone: PHONE.shopA, name: 'Owner A', role: 'RETAILER' } },
      prices: { create: { skuId: detergent.id, unitPricePaise: rupeesToPaise(99) } },
    },
  });
  const shopB = await prisma.retailer.create({
    data: {
      shopName: 'Shop B',
      ownerName: 'Owner B',
      phone: PHONE.shopB,
      area: 'South',
      beat: 'Route 2',
      tallyLedgerName: 'Shop B',
      creditLimitPaise: rupeesToPaise(10_000),
      outstandingPaise: rupeesToPaise(8_000),
      users: { create: { phone: PHONE.shopB, name: 'Owner B', role: 'RETAILER' } },
    },
  });
  await prisma.user.create({ data: { phone: PHONE.desk, name: 'Desk', role: 'DESK' } });

  return { biscuit, detergent, tea, shopA, shopB };
}

export type Fixture = Awaited<ReturnType<typeof createFixture>>;

const lastCodeSent = new Map<string, string>();

vi.spyOn(mockSmsGateway, 'sendOtp').mockImplementation(async (phone, code) => {
  lastCodeSent.set(phone, code);
});

export async function requestCode(agent: Agent, phone: string): Promise<string> {
  await agent.post('/api/auth/otp/request').send({ phone }).expect(200);
  const code = lastCodeSent.get(phone);
  if (!code) throw new Error('No code was sent');
  return code;
}

export async function signIn(phone: string): Promise<Agent> {
  const agent = request.agent(app);
  const code = await requestCode(agent, phone);
  await agent.post('/api/auth/otp/verify').send({ phone, code }).expect(204);
  return agent;
}

/** What the shopkeeper saw as the total before pressing Place order. */
export async function expectedTotal(retailerId: string, items: CartItem[]): Promise<number> {
  return (await container.orderService.quote(retailerId, items)).totalPaise;
}

let keyCounter = 0;
export const newKey = () => `test-key-${++keyCounter}-${Date.now()}`;

export async function orderBody(retailerId: string, items: CartItem[]) {
  return { items, idempotencyKey: newKey(), expectedTotalPaise: await expectedTotal(retailerId, items) };
}

export const cases = (skuId: string, count: number): CartItem => ({ skuId, cases: count, pieces: 0 });

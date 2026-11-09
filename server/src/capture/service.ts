import type {
  CaptureChannel,
  CaptureDetail,
  CaptureFlag,
  CaptureReason,
  CaptureStatus,
  CaptureSummary,
  ConfirmCaptureBody,
  ConfirmCaptureResult,
  ConfirmLine,
  SessionUser,
} from '#shared/api';
import { confidenceBand, lineNeedsDecision } from '#shared/capture';
import { formatRupees } from '#shared/money';
import type { CartItem } from '#shared/pricing';
import { loadCatalogue } from '../catalogue/service.ts';
import { audit, prisma, type Db } from '../db.ts';
import type { Prisma } from '../generated/prisma/client.ts';
import { AppError, conflict, notFound } from '../http/errors.ts';
import { creditSummary } from '../orders/credit.ts';
import {
  orderInclude,
  orderLabel,
  placeOrderInTransaction,
  toOrderDetail,
  TRANSACTION_OPTIONS,
  type OrderRow,
} from '../orders/service.ts';
import type { MatchContext, SkuHistory } from './rank.ts';
import { readMessage } from './read.ts';

const HISTORY_LINES = 300;

export async function loadMatchContext(db: Db, retailerId: string): Promise<MatchContext> {
  const skus = await db.sku.findMany({ where: { active: true } });
  const aliases = await db.retailerAlias.findMany({ where: { retailerId } });
  const pastLines = await db.orderLine.findMany({
    where: { order: { retailerId, status: { not: 'REJECTED' } } },
    orderBy: { order: { createdAt: 'desc' } },
    take: HISTORY_LINES,
    select: { skuId: true, cases: true },
  });

  const history = new Map<string, SkuHistory>();
  for (const line of pastLines) {
    const seen = history.get(line.skuId);
    history.set(line.skuId, {
      orders: (seen?.orders ?? 0) + 1,
      maxCases: Math.max(seen?.maxCases ?? 0, line.cases),
    });
  }

  return {
    skus: skus.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      family: s.family,
      packLabel: s.packLabel,
      sizeGrams: s.sizeGrams,
      unitsPerCase: s.unitsPerCase,
      keywords: s.keywords,
    })),
    aliases: new Map(aliases.map((a) => [a.phrase, a.skuId])),
    history,
    knownSizes: new Set(skus.flatMap((s) => (s.sizeGrams === null ? [] : [s.sizeGrams]))),
  };
}

const captureInclude = {
  retailer: true,
  lines: { orderBy: { position: 'asc' } },
  order: { select: { number: true } },
} satisfies Prisma.CaptureInclude;

type CaptureRow = Prisma.CaptureGetPayload<{ include: typeof captureInclude }>;

const toView = (line: CaptureRow['lines'][number]) => ({
  band: confidenceBand(line.confidence),
  quantity: line.quantity,
  unit: line.unit,
  flags: line.flags as CaptureFlag[],
});

function toSummary(capture: CaptureRow): CaptureSummary {
  return {
    id: capture.id,
    status: capture.status,
    channel: capture.channel,
    rawText: capture.rawText,
    engine: capture.engine,
    createdAt: capture.createdAt.toISOString(),
    retailer: {
      id: capture.retailer.id,
      shopName: capture.retailer.shopName,
      area: capture.retailer.area,
    },
    lineCount: capture.lines.length,
    needsDecision: capture.lines.filter((l) => lineNeedsDecision(toView(l))).length,
    orderLabel: capture.order ? orderLabel(capture.order.number) : null,
  };
}

async function toDetail(capture: CaptureRow): Promise<CaptureDetail> {
  const context = await loadMatchContext(prisma, capture.retailerId);
  return {
    ...toSummary(capture),
    engineNote: capture.engineNote,
    lines: capture.lines.map((line) => ({
      id: line.id,
      position: line.position,
      originalWords: line.originalWords,
      quantity: line.quantity,
      unit: line.unit,
      suggestedSkuId: line.suggestedSkuId,
      band: confidenceBand(line.confidence),
      reason: line.reason as CaptureReason,
      alternativeSkuIds: line.alternativeSkuIds,
      flags: line.flags as CaptureFlag[],
      usualMaxCases: line.suggestedSkuId
        ? (context.history.get(line.suggestedSkuId)?.maxCases ?? null)
        : null,
      finalSkuId: line.finalSkuId,
      finalQuantity: line.finalQuantity,
      finalUnit: line.finalUnit,
      decision: line.decision,
    })),
    catalogue: await loadCatalogue(prisma, capture.retailerId),
    credit: await creditSummary(prisma, capture.retailer),
    orderId: capture.orderId,
    replyText: capture.replyText,
  };
}

export async function createCapture(input: {
  retailerId: string;
  text: string;
  channel: CaptureChannel;
}): Promise<CaptureDetail> {
  const context = await loadMatchContext(prisma, input.retailerId);
  const reading = await readMessage(input.text, context);
  if (reading.lines.length === 0) {
    throw new AppError(422, 'NO_ITEMS', 'No items could be found in this message.');
  }
  const capture = await prisma.capture.create({
    data: {
      retailerId: input.retailerId,
      channel: input.channel,
      rawText: input.text,
      engine: reading.engine,
      engineNote: reading.engineNote,
      lines: { create: reading.lines.map((line, position) => ({ ...line, position })) },
    },
    include: captureInclude,
  });
  return toDetail(capture);
}

/** retailerId scopes the lookup for a retailer. The desk passes nothing and can open any capture. */
export async function getCapture(captureId: string, retailerId?: string): Promise<CaptureDetail> {
  const capture = await prisma.capture.findFirst({
    where: { id: captureId, retailerId },
    include: captureInclude,
  });
  if (!capture) throw notFound('Message not found.');
  return toDetail(capture);
}

export async function listCaptures(status: CaptureStatus): Promise<CaptureSummary[]> {
  const captures = await prisma.capture.findMany({
    where: { status },
    include: captureInclude,
    orderBy: { createdAt: status === 'NEEDS_REVIEW' ? 'asc' : 'desc' },
    take: 100,
  });
  return captures.map(toSummary);
}

function toCartItems(lines: ConfirmLine[]): CartItem[] {
  return lines.flatMap((line) => {
    if (line.action === 'DROP') return [];
    return [
      {
        skuId: line.skuId,
        cases: line.unit === 'CASE' ? line.quantity : 0,
        pieces: line.unit === 'PIECE' ? line.quantity : 0,
      },
    ];
  });
}

function buildReply(shopName: string, order: OrderRow, dropped: string[]): string {
  const items = order.lines.map((l) => {
    const qty = [l.cases && `${l.cases} peti`, l.pieces && `${l.pieces} pcs`].filter(Boolean).join(' + ');
    const free = l.freeCases > 0 ? ` (+${l.freeCases} peti free)` : '';
    return `${qty} ${l.skuName.split(',')[0]}${free}`;
  });
  const parts = [
    `Namaste ${shopName}, aapka order ${orderLabel(order.number)} mil gaya.`,
    ...items,
    `Total ${formatRupees(order.totalPaise)} (GST sahit).`,
  ];
  if (dropped.length > 0) parts.push(`Nahi jud paya: ${dropped.join(', ')}.`);
  if (order.status === 'CREDIT_HOLD') parts.push('Credit limit ke karan order hold par hai, office call karega.');
  return parts.join('\n');
}

/**
 * The only way a capture becomes an order: a named person has seen every line.
 * Everything happens in one transaction, so a failed order cannot leave aliases behind.
 */
export async function confirmCapture(input: {
  captureId: string;
  actor: SessionUser;
  retailerId?: string;
  body: ConfirmCaptureBody;
}): Promise<ConfirmCaptureResult> {
  const { captureId, actor, retailerId, body } = input;

  return prisma.$transaction(async (tx) => {
    // Locked so a double tap on a slow connection sees the first confirmation, not a second order.
    await tx.$queryRaw`SELECT id FROM "Capture" WHERE id = ${captureId} FOR UPDATE`;

    const capture = await tx.capture.findFirst({
      where: { id: captureId, retailerId },
      include: captureInclude,
    });
    if (!capture) throw notFound('Message not found.');

    if (capture.status === 'CONFIRMED' && capture.orderId) {
      const order = await tx.order.findUniqueOrThrow({
        where: { id: capture.orderId },
        include: orderInclude,
      });
      return { order: await toOrderDetail(tx, order, false), replyText: capture.replyText, aliasesLearned: 0 };
    }
    if (capture.status !== 'NEEDS_REVIEW') {
      throw conflict('ALREADY_DECIDED', 'This message has already been dealt with.');
    }

    const decisions = new Map(body.lines.map((l) => [l.lineId, l]));
    if (decisions.size !== capture.lines.length || capture.lines.some((l) => !decisions.has(l.id))) {
      throw new AppError(400, 'INCOMPLETE_REVIEW', 'Every line needs a decision before confirming.');
    }
    const items = toCartItems(body.lines);
    if (items.length === 0) {
      throw new AppError(400, 'EMPTY_ORDER', 'Keep at least one line, or reject the message.');
    }

    const order = await placeOrderInTransaction(tx, {
      retailerId: capture.retailerId,
      placedById: actor.id,
      items,
      source: 'AI_CAPTURE',
      expectedTotalPaise: body.expectedTotalPaise,
    });

    const dropped: string[] = [];
    let aliasesLearned = 0;

    for (const line of capture.lines) {
      const decision = decisions.get(line.id)!;
      if (decision.action === 'DROP') {
        dropped.push(line.originalWords);
        await tx.captureLine.update({ where: { id: line.id }, data: { decision: 'DROPPED' } });
        continue;
      }

      const corrected = decision.skuId !== line.suggestedSkuId;
      await tx.captureLine.update({
        where: { id: line.id },
        data: {
          finalSkuId: decision.skuId,
          finalQuantity: decision.quantity,
          finalUnit: decision.unit,
          decision: corrected ? 'CORRECTED' : 'ACCEPTED',
        },
      });

      if (actor.role !== 'DESK' || !line.phrase) continue;
      if (corrected) {
        await tx.retailerAlias.upsert({
          where: { retailerId_phrase: { retailerId: capture.retailerId, phrase: line.phrase } },
          create: {
            retailerId: capture.retailerId,
            phrase: line.phrase,
            skuId: decision.skuId,
            createdById: actor.id,
          },
          update: { skuId: decision.skuId, createdById: actor.id, timesUsed: 0 },
        });
        aliasesLearned++;
      } else if (line.reason === 'ALIAS') {
        await tx.retailerAlias.updateMany({
          where: { retailerId: capture.retailerId, phrase: line.phrase },
          data: { timesUsed: { increment: 1 } },
        });
      }
    }

    // A reply is only needed when the order arrived on WhatsApp.
    const replyText =
      capture.channel === 'WHATSAPP' ? buildReply(capture.retailer.shopName, order, dropped) : null;

    await tx.capture.update({
      where: { id: capture.id },
      data: {
        status: 'CONFIRMED',
        orderId: order.id,
        decidedById: actor.id,
        decidedAt: new Date(),
        replyText,
      },
    });
    await audit(tx, actor.id, 'CAPTURE_CONFIRMED', 'Order', order.id);

    return { order: await toOrderDetail(tx, order, false), replyText, aliasesLearned };
  }, TRANSACTION_OPTIONS);
}

export async function rejectCapture(captureId: string, actorId: string, retailerId?: string) {
  const rejected = await prisma.capture.updateMany({
    where: { id: captureId, retailerId, status: 'NEEDS_REVIEW' },
    data: { status: 'REJECTED', decidedById: actorId, decidedAt: new Date() },
  });
  if (rejected.count === 0) throw conflict('ALREADY_DECIDED', 'This message has already been dealt with.');
}

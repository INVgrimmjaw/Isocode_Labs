import { confidenceBand, lineNeedsDecision } from '../ai/confidence.ts';
import type { MatchContext, SkuHistory } from '../ai/matcher.ts';
import type { MessageReader } from '../ai/message-reader.ts';
import type { Prisma } from '../generated/prisma/client.ts';
import { AppError, conflict, notFound } from '../lib/errors.ts';
import { TRANSACTION_OPTIONS, type Database } from '../lib/prisma.ts';
import type {
  CaptureDetail,
  CaptureReason,
  CaptureSummary,
  ConfirmCaptureBody,
  ConfirmCaptureResult,
  ConfirmLine,
} from '../types/api.ts';
import type { CatalogueService } from './catalogue.service.ts';
import type { CreditService } from './credit.service.ts';
import { orderInclude, toOrderDetail, type OrderService } from './order.service.ts';
import type { CartItem, Quote } from './scheme-engine.ts';

const HISTORY_LINES = 300;

const captureInclude = {
  retailer: true,
  lines: { orderBy: { position: 'asc' } },
} satisfies Prisma.CaptureInclude;

type CaptureRow = Prisma.CaptureGetPayload<{ include: typeof captureInclude }>;

function toSummary(capture: CaptureRow): CaptureSummary {
  return {
    id: capture.id,
    status: capture.status,
    rawText: capture.rawText,
    engine: capture.engine,
    createdAt: capture.createdAt.toISOString(),
    retailer: {
      id: capture.retailer.id,
      shopName: capture.retailer.shopName,
      area: capture.retailer.area,
    },
    lineCount: capture.lines.length,
    needsDecision: capture.lines.filter((l) =>
      lineNeedsDecision({ ...l, band: confidenceBand(l.confidence) }),
    ).length,
  };
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

export class CaptureService {
  constructor(
    private readonly db: Database,
    private readonly catalogue: CatalogueService,
    private readonly credit: CreditService,
    private readonly orders: OrderService,
    private readonly readMessage: MessageReader,
  ) {}

  private async matchContext(retailerId: string): Promise<MatchContext> {
    const skus = await this.db.sku.findMany();
    const aliases = await this.db.retailerAlias.findMany({ where: { retailerId } });
    const pastLines = await this.db.orderLine.findMany({
      where: { order: { retailerId, status: { not: 'REJECTED' } } },
      orderBy: { order: { createdAt: 'desc' } },
      take: HISTORY_LINES,
      select: { skuId: true },
    });

    const history = new Map<string, SkuHistory>();
    for (const line of pastLines) {
      history.set(line.skuId, { orders: (history.get(line.skuId)?.orders ?? 0) + 1 });
    }

    return {
      skus: skus.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        family: s.family,
        sizeGrams: s.sizeGrams,
        keywords: s.keywords,
      })),
      aliases: new Map(aliases.map((a) => [a.phrase, a.skuId])),
      history,
      knownSizes: new Set(skus.flatMap((s) => (s.sizeGrams === null ? [] : [s.sizeGrams]))),
    };
  }

  private async toDetail(capture: CaptureRow): Promise<CaptureDetail> {
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
      })),
      catalogue: await this.catalogue.load(capture.retailerId),
      credit: await this.credit.summary(capture.retailer),
    };
  }

  async create(retailerId: string, text: string): Promise<CaptureDetail> {
    const reading = await this.readMessage(text, await this.matchContext(retailerId));
    if (reading.lines.length === 0) {
      throw new AppError(422, 'NO_ITEMS', 'No items could be found in this message.');
    }
    const capture = await this.db.capture.create({
      data: {
        retailerId,
        rawText: text,
        engine: reading.engine,
        engineNote: reading.engineNote,
        lines: { create: reading.lines.map((line, position) => ({ ...line, position })) },
      },
      include: captureInclude,
    });
    return this.toDetail(capture);
  }

  async get(captureId: string): Promise<CaptureDetail> {
    const capture = await this.db.capture.findUnique({
      where: { id: captureId },
      include: captureInclude,
    });
    if (!capture) throw notFound('Message not found.');
    return this.toDetail(capture);
  }

  async listToCheck(): Promise<CaptureSummary[]> {
    const captures = await this.db.capture.findMany({
      where: { status: 'NEEDS_REVIEW' },
      include: captureInclude,
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return captures.map(toSummary);
  }

  async quote(captureId: string, items: CartItem[]): Promise<Quote> {
    const capture = await this.db.capture.findUnique({ where: { id: captureId } });
    if (!capture) throw notFound('Message not found.');
    return this.orders.quote(capture.retailerId, items);
  }

  /**
   * The only way a capture becomes an order: a person on the desk has seen every line.
   * Everything happens in one transaction, so a failed order cannot leave aliases behind.
   */
  async confirm(captureId: string, body: ConfirmCaptureBody): Promise<ConfirmCaptureResult> {
    return this.db.$transaction(async (tx) => {
      // Locked so a double click sees the first confirmation, not a second order.
      await tx.$queryRaw`SELECT id FROM "Capture" WHERE id = ${captureId} FOR UPDATE`;

      const capture = await tx.capture.findUnique({
        where: { id: captureId },
        include: captureInclude,
      });
      if (!capture) throw notFound('Message not found.');

      if (capture.status === 'CONFIRMED' && capture.orderId) {
        const order = await tx.order.findUniqueOrThrow({
          where: { id: capture.orderId },
          include: orderInclude,
        });
        return { order: toOrderDetail(order), aliasesLearned: 0 };
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

      const order = await this.orders.placeInTransaction(tx, {
        retailerId: capture.retailerId,
        items,
        source: 'AI_CAPTURE',
        expectedTotalPaise: body.expectedTotalPaise,
      });

      let aliasesLearned = 0;
      for (const line of capture.lines) {
        const decision = decisions.get(line.id)!;
        if (decision.action === 'DROP' || decision.skuId === line.suggestedSkuId || !line.phrase) continue;
        await tx.retailerAlias.upsert({
          where: { retailerId_phrase: { retailerId: capture.retailerId, phrase: line.phrase } },
          create: { retailerId: capture.retailerId, phrase: line.phrase, skuId: decision.skuId },
          update: { skuId: decision.skuId },
        });
        aliasesLearned++;
      }

      await tx.capture.update({
        where: { id: capture.id },
        data: { status: 'CONFIRMED', orderId: order.id },
      });

      return { order: toOrderDetail(order), aliasesLearned };
    }, TRANSACTION_OPTIONS);
  }

  async reject(captureId: string) {
    const rejected = await this.db.capture.updateMany({
      where: { id: captureId, status: 'NEEDS_REVIEW' },
      data: { status: 'REJECTED' },
    });
    if (rejected.count === 0) throw conflict('ALREADY_DECIDED', 'This message has already been dealt with.');
  }
}

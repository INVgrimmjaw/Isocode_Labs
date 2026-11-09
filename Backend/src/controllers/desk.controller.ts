import type { Request, Response } from 'express';
import { notFound } from '../lib/errors.ts';
import type { Database } from '../lib/prisma.ts';
import type { CaptureService } from '../services/capture.service.ts';
import type { OrderService } from '../services/order.service.ts';
import type { ReportService } from '../services/report.service.ts';
import type { TallyService } from '../services/tally.service.ts';
import type { RetailerOption } from '../types/api.ts';
import { confirmCaptureBody, createCaptureBody } from '../validations/capture.validation.ts';
import { idParam, orderListQuery, quoteBody, rejectOrderBody } from '../validations/order.validation.ts';

export class DeskController {
  constructor(
    private readonly db: Database,
    private readonly orders: OrderService,
    private readonly captures: CaptureService,
    private readonly tally: TallyService,
    private readonly reports: ReportService,
  ) {}

  listOrders = async (req: Request, res: Response) => {
    const { status } = orderListQuery.parse(req.query);
    res.json(await this.orders.listForDesk(status));
  };

  getOrder = async (req: Request, res: Response) => {
    const { id } = idParam.parse(req.params);
    res.json(await this.orders.getForDesk(id));
  };

  releaseHold = async (req: Request, res: Response) => {
    const { id } = idParam.parse(req.params);
    res.json(await this.orders.releaseHold(id));
  };

  rejectOrder = async (req: Request, res: Response) => {
    const { id } = idParam.parse(req.params);
    const { reason } = rejectOrderBody.parse(req.body);
    res.json(await this.orders.reject(id, reason));
  };

  listRetailers = async (_req: Request, res: Response) => {
    const retailers = await this.db.retailer.findMany({
      orderBy: { shopName: 'asc' },
      select: { id: true, shopName: true, area: true },
    });
    res.json(retailers satisfies RetailerOption[]);
  };

  inactiveRetailers = async (_req: Request, res: Response) => {
    res.json(await this.reports.inactiveRetailers());
  };

  listCaptures = async (_req: Request, res: Response) => {
    res.json(await this.captures.listToCheck());
  };

  createCapture = async (req: Request, res: Response) => {
    const { retailerId, text } = createCaptureBody.parse(req.body);
    const retailer = await this.db.retailer.findUnique({ where: { id: retailerId } });
    if (!retailer) throw notFound('Shop not found.');
    res.status(201).json(await this.captures.create(retailer.id, text));
  };

  getCapture = async (req: Request, res: Response) => {
    const { id } = idParam.parse(req.params);
    res.json(await this.captures.get(id));
  };

  quoteCapture = async (req: Request, res: Response) => {
    const { id } = idParam.parse(req.params);
    const { items } = quoteBody.parse(req.body);
    res.json(await this.captures.quote(id, items));
  };

  confirmCapture = async (req: Request, res: Response) => {
    const { id } = idParam.parse(req.params);
    res.json(await this.captures.confirm(id, confirmCaptureBody.parse(req.body)));
  };

  rejectCapture = async (req: Request, res: Response) => {
    const { id } = idParam.parse(req.params);
    await this.captures.reject(id);
    res.status(204).end();
  };

  tallyPreview = async (_req: Request, res: Response) => {
    res.json(await this.tally.preview());
  };

  exportToTally = async (_req: Request, res: Response) => {
    res.status(201).json(await this.tally.exportReady());
  };

  downloadTallyFile = async (req: Request, res: Response) => {
    const { id } = idParam.parse(req.params);
    const { fileName, xml } = await this.tally.file(id);
    res.type('application/xml').attachment(fileName).send(xml);
  };

  vanLists = async (_req: Request, res: Response) => {
    res.json(await this.reports.vanLists());
  };
}

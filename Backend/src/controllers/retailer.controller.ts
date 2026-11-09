import type { Request, Response } from 'express';
import { currentRetailerId } from '../middleware/auth.ts';
import type { OrderService } from '../services/order.service.ts';
import { idParam, placeOrderBody, quoteBody } from '../validations/order.validation.ts';

export class RetailerController {
  constructor(private readonly orders: OrderService) {}

  home = async (req: Request, res: Response) => {
    res.json(await this.orders.home(currentRetailerId(req)));
  };

  quote = async (req: Request, res: Response) => {
    const { items } = quoteBody.parse(req.body);
    res.json(await this.orders.quote(currentRetailerId(req), items));
  };

  listOrders = async (req: Request, res: Response) => {
    res.json(await this.orders.listForRetailer(currentRetailerId(req)));
  };

  getOrder = async (req: Request, res: Response) => {
    const { id } = idParam.parse(req.params);
    res.json(await this.orders.getForRetailer(currentRetailerId(req), id));
  };

  placeOrder = async (req: Request, res: Response) => {
    const body = placeOrderBody.parse(req.body);
    const order = await this.orders.place({
      retailerId: currentRetailerId(req),
      items: body.items,
      source: 'APP',
      idempotencyKey: body.idempotencyKey,
      expectedTotalPaise: body.expectedTotalPaise,
    });
    res.status(201).json(order);
  };
}

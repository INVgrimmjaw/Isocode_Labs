import { defaultGroqClient } from './ai/groq.ts';
import { createMessageReader } from './ai/message-reader.ts';
import { AuthController } from './controllers/auth.controller.ts';
import { DeskController } from './controllers/desk.controller.ts';
import { RetailerController } from './controllers/retailer.controller.ts';
import { prisma } from './lib/prisma.ts';
import { mockSmsGateway } from './lib/sms.ts';
import { AuthService } from './services/auth.service.ts';
import { CaptureService } from './services/capture.service.ts';
import { CatalogueService } from './services/catalogue.service.ts';
import { CreditService } from './services/credit.service.ts';
import { OrderService } from './services/order.service.ts';
import { ReportService } from './services/report.service.ts';
import { TallyService } from './services/tally.service.ts';

/** Builds every service once and hands each one what it depends on. */
const authService = new AuthService(prisma, mockSmsGateway);
const catalogueService = new CatalogueService(prisma);
const creditService = new CreditService(prisma);
const orderService = new OrderService(prisma, catalogueService, creditService);
const captureService = new CaptureService(
  prisma,
  catalogueService,
  creditService,
  orderService,
  createMessageReader(defaultGroqClient()),
);
const tallyService = new TallyService(prisma);
const reportService = new ReportService(prisma);

export const container = {
  authService,
  catalogueService,
  orderService,
  captureService,
  authController: new AuthController(authService),
  retailerController: new RetailerController(orderService),
  deskController: new DeskController(prisma, orderService, captureService, tallyService, reportService),
};

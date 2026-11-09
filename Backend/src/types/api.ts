import type { PricingSku, Scheme } from '../services/scheme-engine.ts';
import type { Paise } from '../utils/money.ts';

/** The JSON the API returns. Frontend/src/api/types.ts mirrors what the browser uses of it. */

export type Role = 'RETAILER' | 'DESK';

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  retailer: { id: string; shopName: string } | null;
}

export interface OtpRequestResponse {
  /** Present only in demo mode, where the mock SMS is shown on screen. */
  demoCode?: string;
}

export interface CreditSummary {
  limitPaise: Paise;
  outstandingPaise: Paise;
  openOrdersPaise: Paise;
  availablePaise: Paise;
}

export interface CatalogueSku extends PricingSku {
  code: string;
  name: string;
  nameHi: string;
  brand: string;
  packKind: string;
  /** Words shopkeepers use, so searching "chai" finds tea leaf. */
  keywords: string[];
}

export interface Catalogue {
  skus: CatalogueSku[];
  schemes: Scheme[];
}

export interface LastOrder {
  id: string;
  lineCount: number;
  totalPaise: Paise;
}

export interface RetailerHome extends Catalogue {
  credit: CreditSummary;
  lastOrder: LastOrder | null;
}

export type OrderStatus = 'CREDIT_HOLD' | 'READY' | 'EXPORTED' | 'REJECTED';
export type OrderSource = 'APP' | 'AI_CAPTURE';

export interface OrderSummary {
  id: string;
  label: string;
  status: OrderStatus;
  source: OrderSource;
  totalPaise: Paise;
  lineCount: number;
  freeCases: number;
  createdAt: string;
  retailer: { id: string; shopName: string; area: string; beat: string };
}

export interface OrderLineView {
  skuId: string;
  skuCode: string;
  skuName: string;
  unitsPerCase: number;
  cases: number;
  pieces: number;
  freeCases: number;
  unitPricePaise: Paise;
  gstBps: number;
  grossPaise: Paise;
  discountPaise: Paise;
  taxablePaise: Paise;
  gstPaise: Paise;
  totalPaise: Paise;
  schemeLabel: string | null;
}

export interface OrderDetail extends OrderSummary {
  lines: OrderLineView[];
  grossPaise: Paise;
  discountPaise: Paise;
  taxablePaise: Paise;
  gstPaise: Paise;
  overLimitPaise: Paise | null;
  rejectedReason: string | null;
  /** Desk only: the retailer's credit position right now. */
  credit?: CreditSummary;
}

export type CaptureUnit = 'CASE' | 'PIECE' | 'UNCLEAR';
export type CaptureStatus = 'NEEDS_REVIEW' | 'CONFIRMED' | 'REJECTED';
export type CaptureEngine = 'CLAUDE' | 'MATCHER';
export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';
export type CaptureReason = 'ALIAS' | 'HISTORY' | 'MATCH' | 'UNSURE';

export interface CaptureLineView {
  id: string;
  position: number;
  originalWords: string;
  quantity: number | null;
  unit: CaptureUnit;
  suggestedSkuId: string | null;
  band: ConfidenceBand;
  reason: CaptureReason;
  alternativeSkuIds: string[];
}

export interface CaptureSummary {
  id: string;
  status: CaptureStatus;
  rawText: string;
  engine: CaptureEngine;
  createdAt: string;
  retailer: { id: string; shopName: string; area: string };
  lineCount: number;
  needsDecision: number;
}

export interface CaptureDetail extends CaptureSummary {
  engineNote: string | null;
  lines: CaptureLineView[];
  catalogue: Catalogue;
  credit: CreditSummary;
}

export type ConfirmLine =
  | { lineId: string; action: 'ORDER'; skuId: string; quantity: number; unit: 'CASE' | 'PIECE' }
  | { lineId: string; action: 'DROP' };

export interface ConfirmCaptureBody {
  lines: ConfirmLine[];
  expectedTotalPaise: Paise;
}

export interface ConfirmCaptureResult {
  order: OrderDetail;
  aliasesLearned: number;
}

export interface RetailerOption {
  id: string;
  shopName: string;
  area: string;
}

export interface TallyBatchView {
  id: string;
  label: string;
  orderCount: number;
  totalPaise: Paise;
  createdAt: string;
}

export interface TallyPreview {
  orders: OrderSummary[];
  held: number;
  batches: TallyBatchView[];
}

export interface VanListLine {
  skuCode: string;
  skuName: string;
  cases: number;
  freeCases: number;
  pieces: number;
  unitsPerCase: number;
}

export interface VanListDrop {
  orderLabel: string;
  shopName: string;
  area: string;
  totalPaise: Paise;
}

export interface VanList {
  beat: string;
  orderCount: number;
  lines: VanListLine[];
  drops: VanListDrop[];
}

export interface VanListResponse {
  date: string;
  vans: VanList[];
}

export interface InactiveRetailer {
  id: string;
  shopName: string;
  ownerName: string;
  phone: string;
  area: string;
  beat: string;
  lastOrderAt: string | null;
  daysSince: number | null;
  lastOrderPaise: Paise | null;
}

/** Every failed API call has this body, so the client handles errors one way. */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

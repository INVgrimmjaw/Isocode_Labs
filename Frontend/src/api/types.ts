/** The parts of the API's JSON that the browser uses. Backend/src/types/api.ts is the source. */

export type Role = 'RETAILER' | 'DESK';

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  retailer: { id: string; shopName: string } | null;
}

export interface CreditSummary {
  limitPaise: number;
  outstandingPaise: number;
  openOrdersPaise: number;
  availablePaise: number;
}

export interface CatalogueSku {
  id: string;
  code: string;
  name: string;
  nameHi: string;
  brand: string;
  packKind: string;
  keywords: string[];
  unitsPerCase: number;
  unitPricePaise: number;
  gstBps: number;
  stockPieces: number;
}

export interface Scheme {
  id: string;
  skuId: string;
  label: string;
  labelHi: string;
}

export interface Catalogue {
  skus: CatalogueSku[];
  schemes: Scheme[];
}

export interface RetailerHome extends Catalogue {
  credit: CreditSummary;
  lastOrder: { id: string; lineCount: number; totalPaise: number } | null;
}

export interface CartItem {
  skuId: string;
  cases: number;
  pieces: number;
}

export interface PricedLine {
  skuId: string;
  cases: number;
  pieces: number;
  grossPaise: number;
  discountPaise: number;
  freeCases: number;
  freeCasesShort: number;
  applied: { label: string; labelHi: string } | null;
  stock: 'OK' | 'SHORT' | 'OUT';
  availablePieces: number;
}

export interface Quote {
  lines: PricedLine[];
  grossPaise: number;
  discountPaise: number;
  taxablePaise: number;
  gstPaise: number;
  totalPaise: number;
  freeCases: number;
  blocked: boolean;
}

export type OrderStatus = 'CREDIT_HOLD' | 'READY' | 'EXPORTED' | 'REJECTED';

export interface OrderSummary {
  id: string;
  label: string;
  status: OrderStatus;
  source: 'APP' | 'AI_CAPTURE';
  totalPaise: number;
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
  unitPricePaise: number;
  gstBps: number;
  discountPaise: number;
  taxablePaise: number;
  schemeLabel: string | null;
}

export interface OrderDetail extends OrderSummary {
  lines: OrderLineView[];
  grossPaise: number;
  discountPaise: number;
  taxablePaise: number;
  gstPaise: number;
  overLimitPaise: number | null;
  rejectedReason: string | null;
  credit?: CreditSummary;
}

export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';
export type CaptureReason = 'ALIAS' | 'HISTORY' | 'MATCH' | 'UNSURE';

export interface CaptureLineView {
  id: string;
  originalWords: string;
  quantity: number | null;
  unit: 'CASE' | 'PIECE' | 'UNCLEAR';
  suggestedSkuId: string | null;
  band: ConfidenceBand;
  reason: CaptureReason;
  alternativeSkuIds: string[];
}

export interface CaptureSummary {
  id: string;
  rawText: string;
  createdAt: string;
  retailer: { id: string; shopName: string; area: string };
  lineCount: number;
  needsDecision: number;
}

export interface CaptureDetail extends CaptureSummary {
  status: 'NEEDS_REVIEW' | 'CONFIRMED' | 'REJECTED';
  engine: 'CLAUDE' | 'MATCHER';
  engineNote: string | null;
  lines: CaptureLineView[];
  catalogue: Catalogue;
  credit: CreditSummary;
}

export type ConfirmLine =
  | { lineId: string; action: 'ORDER'; skuId: string; quantity: number; unit: 'CASE' | 'PIECE' }
  | { lineId: string; action: 'DROP' };

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
  totalPaise: number;
  createdAt: string;
}

export interface TallyPreview {
  orders: OrderSummary[];
  held: number;
  batches: TallyBatchView[];
}

export interface VanList {
  beat: string;
  orderCount: number;
  lines: { skuCode: string; skuName: string; cases: number; freeCases: number; pieces: number }[];
  drops: { orderLabel: string; shopName: string; area: string; totalPaise: number }[];
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
  lastOrderPaise: number | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export type Category = 'Labour' | 'Materials' | 'Permits' | 'Other';
export type ExpenseStatus = 'Estimate' | 'Quote' | 'Partial' | 'Paid';

export interface ExpenseInstallment {
  date: string;
  amount: number;
  note?: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number; // The reference amount (Estimate or Quote total)
  estimateAmount?: number;
  quoteAmount?: number;
  paidAmount?: number; // Accumulated total of installments
  installments?: ExpenseInstallment[];
  quotePhotoUrls?: string[]; // Documentation for the initial quote/invoice
  paymentPhotoUrls?: string[]; // Documentation for partial payments/receipts
  category: Category;
  date: string;
  status: ExpenseStatus;
  supplier?: string;
  supplierUrl?: string;
  isAiGenerated?: boolean;
  calculationBreakdown?: string;
  isComplianceRequired?: boolean; // Flag for trades requiring certification
}

export interface AIActionItem {
  description: string;
  category: string;
  estimatedCost: number;
  searchQuery: string;
  supplier: string;
  supplierUrl: string;
}

export interface Dimensions {
  length: number;
  width: number;
  height: number;
  /** Set when sanitizeDimensions inferred mm (>50) and divided by 1000; cleared on manual shell edits unless conversion happens again. */
  _autoConverted?: boolean;
}

/** Derived geometry for the room shell (indicative). */
export interface RoomCalculations {
  floorArea: number;
  wallArea: number;
  /** Floor perimeter (m), e.g. for skirting / services runs */
  linearMetres: number;
}

/** Indicative renovation band — placeholder until trade pricing engine exists. */
export interface RoomEstimateBand {
  low: number;
  mid: number;
  high: number;
}

/** Single line from pricing v1 rules (rough AUD, ex-GST). */
export interface RoomEstimateLineItem {
  id: string;
  label: string;
  category: string;
  unit: string;
  quantity: number;
  low: number;
  high: number;
}

/**
 * Rule-based line items + trade rollup. Stored on room for summaries.
 * `source`: `rules` when at least one rule produced a line; `placeholder` when v1 total fell back to area rate.
 */
export interface RoomPricingV1 {
  lineItems: RoomEstimateLineItem[];
  tradeBreakdown: { label: string; low: number; high: number }[];
  source: 'rules' | 'placeholder';
}

/** Flat structured scope values (MVP walk-through). Persisted; mirrors legacy `scopeInputs`. */
export type RoomScopeValues = Record<string, string | number | boolean>;

/** Manual trade quote line (local-only; for analytics: estimate vs quote vs actual). */
export type QuoteItemStatus = 'draft' | 'received' | 'accepted' | 'rejected';
export type QuotePaymentType = 'deposit' | 'progress' | 'final' | 'variation' | 'other';
export type QuotePaymentStatus = 'unpaid' | 'scheduled' | 'paid';

export interface QuotePayment {
  id: string;
  amount: number;
  paymentType: QuotePaymentType;
  paidDate: string;
  status: QuotePaymentStatus;
  notes: string;
  receiptPhotoUrls?: string[];
}

export interface QuoteItem {
  id: string;
  roomId: string;
  category: string;
  description: string;
  supplierOrTrade: string;
  quoteAmount: number;
  status: QuoteItemStatus;
  quoteDate: string;
  notes: string;
  quotePhotoUrls?: string[];
  /** Preferred structure for tracking real payments over time. */
  payments?: QuotePayment[];
}

export type ActualPaymentStatus = 'unpaid' | 'part-paid' | 'paid';

export interface ActualCostItem {
  id: string;
  roomId: string;
  category: string;
  description: string;
  amountPaid: number;
  paidDate: string;
  paymentStatus: ActualPaymentStatus;
  notes: string;
}

export interface Room {
  id: string;
  name: string;
  type: string;
  dimensions: Dimensions;
  budget: number;
  expenses: Expense[];
  /** Manual quotes (builder/trade) — not the legacy expense list. */
  quoteItems?: QuoteItem[];
  /** Manual actual costs paid — for analytics vs estimate and vs quotes. */
  actualCostItems?: ActualCostItem[];
  photoUrls?: string[];
  aiSuggestions?: string;
  intendedScope?: string[];
  notes?: string;
  /** @deprecated use `scope` — kept for stored projects / migration */
  scopeInputs?: RoomScopeValues;
  /** Structured walk-through capture (single source of truth with scopeInputs merged on load). */
  scope?: RoomScopeValues;
  calculations?: RoomCalculations;
  estimate?: RoomEstimateBand;
  /** Line-item model v1; totals align with `estimate` when rules apply. */
  pricingV1?: RoomPricingV1;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  address: string;
  postcode: string;
  rooms: Room[];
  totalBudget: number;
  createdAt: string;
  isUnlocked?: boolean; // Tracks if the project has been paid for
  /** Email captured for this project (local-only; for future sync / comms). */
  ownerEmail?: string;
}

export interface User {
  email: string;
}

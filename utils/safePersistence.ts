import type { ActualCostItem, Dimensions, Project, QuoteItem, QuotePayment, Room, RoomScopeValues, RoomPricingV1 } from '../types';
import { computeIndicativeEstimate } from './indicativeEstimate';
import { applyRoomPricing } from './calculateRoomEstimate';
import { computeRoomCalculations } from './roomCalculations';

const QUOTA_EXCEEDED_ERROR = 'Storage full. Remove old projects or clear photos to free space.';

function isQuotaExceededError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'QuotaExceededError' || (error as DOMException).code === 22;
  }
  const name = (error as { name?: string }).name;
  const code = (error as { code?: number }).code;
  return name === 'QuotaExceededError' || code === 22;
}

/**
 * Wraps localStorage.setItem; handles QuotaExceededError without throwing.
 */
export function safeSetItem(key: string, value: string): { ok: boolean; error?: string } {
  if (typeof localStorage === 'undefined') {
    return { ok: false, error: 'Storage unavailable in this environment.' };
  }
  try {
    localStorage.setItem(key, value);
    return { ok: true };
  } catch (e: unknown) {
    if (isQuotaExceededError(e)) {
      return { ok: false, error: QUOTA_EXCEEDED_ERROR };
    }
    const msg = e instanceof Error ? e.message : 'Could not save data.';
    return { ok: false, error: msg };
  }
}

/** Rough UTF-16 size of all `zorvo_iq_*` keys + values, in KB (2 bytes per JS char). */
export function getStorageUsageKB(): number {
  if (typeof localStorage === 'undefined') return 0;
  let chars = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('zorvo_iq_')) continue;
    const val = localStorage.getItem(key);
    if (val == null) continue;
    chars += key.length + val.length;
  }
  const bytes = chars * 2;
  return Math.round((bytes / 1024) * 100) / 100;
}

const num = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const p = parseFloat(v);
    return Number.isFinite(p) ? p : 0;
  }
  return 0;
};

/** Safe shell dimensions for calculations and display. */
export function sanitizeDimensions(raw: unknown): Dimensions {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { length: 0, width: 0, height: 0 };
  }
  const o = raw as Record<string, unknown>;
  const normalizeMetres = (value: unknown): { v: number; fromMm: boolean } => {
    const parsed = Math.max(0, num(value));
    if (parsed <= 0) return { v: 0, fromMm: false };
    // Defensive: treat obviously-mm inputs as metres (e.g. 2400 -> 2.4m).
    if (parsed > 50) return { v: Math.min(50, parsed / 1000), fromMm: true };
    return { v: Math.min(50, parsed), fromMm: false };
  };
  const L = normalizeMetres(o.length);
  const W = normalizeMetres(o.width);
  const H = normalizeMetres(o.height);
  const autoConverted = L.fromMm || W.fromMm || H.fromMm;
  return {
    length: L.v,
    width: W.v,
    height: H.v,
    ...(autoConverted ? { _autoConverted: true } : {}),
  };
}

/** Sanitize flat scope object from storage (no functions, cap huge strings). */
export function sanitizeScopeObject(raw: unknown): RoomScopeValues {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: RoomScopeValues = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'boolean' || typeof v === 'number') {
      out[k] = v;
    } else if (typeof v === 'string') {
      out[k] = v.length > 8000 ? v.slice(0, 8000) : v;
    }
  }
  return out;
}

function emptyPricingV1(): RoomPricingV1 {
  return { lineItems: [], tradeBreakdown: [], source: 'placeholder' };
}

const QUOTE_STATUSES: QuoteItem['status'][] = ['draft', 'received', 'accepted', 'rejected'];
const ACTUAL_PAY_STATUSES: ActualCostItem['paymentStatus'][] = ['unpaid', 'part-paid', 'paid'];
const QUOTE_PAYMENT_TYPES: QuotePayment['paymentType'][] = ['deposit', 'progress', 'final', 'variation', 'other'];
const QUOTE_PAYMENT_STATUSES: QuotePayment['status'][] = ['unpaid', 'scheduled', 'paid'];

function sanitizeQuotePayments(raw: unknown): QuotePayment[] {
  if (!Array.isArray(raw)) return [];
  const out: QuotePayment[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) continue;
    const r = x as Record<string, unknown>;
    const id = typeof r.id === 'string' && r.id ? r.id : '';
    if (!id) continue;
    const paymentType: QuotePayment['paymentType'] =
      typeof r.paymentType === 'string' && QUOTE_PAYMENT_TYPES.includes(r.paymentType as QuotePayment['paymentType'])
        ? (r.paymentType as QuotePayment['paymentType'])
        : 'other';
    const status: QuotePayment['status'] =
      typeof r.status === 'string' && QUOTE_PAYMENT_STATUSES.includes(r.status as QuotePayment['status'])
        ? (r.status as QuotePayment['status'])
        : 'paid';
    out.push({
      id,
      amount: Math.max(0, num(r.amount)),
      paymentType,
      paidDate: typeof r.paidDate === 'string' ? r.paidDate.slice(0, 40) : '',
      status,
      notes: typeof r.notes === 'string' ? r.notes.slice(0, 2000) : '',
    });
  }
  return out;
}

function sanitizeQuoteItems(raw: unknown, roomId: string): QuoteItem[] {
  if (!Array.isArray(raw)) return [];
  const out: QuoteItem[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) continue;
    const r = x as Record<string, unknown>;
    const id = typeof r.id === 'string' && r.id ? r.id : '';
    if (!id) continue;
    const status: QuoteItem['status'] =
      typeof r.status === 'string' && QUOTE_STATUSES.includes(r.status as QuoteItem['status'])
        ? (r.status as QuoteItem['status'])
        : 'draft';
    out.push({
      id,
      roomId,
      category: typeof r.category === 'string' ? r.category.slice(0, 120) : 'Other',
      description: typeof r.description === 'string' ? r.description.slice(0, 2000) : '',
      supplierOrTrade: typeof r.supplierOrTrade === 'string' ? r.supplierOrTrade.slice(0, 400) : '',
      quoteAmount: Math.max(0, num(r.quoteAmount)),
      status,
      quoteDate: typeof r.quoteDate === 'string' ? r.quoteDate.slice(0, 40) : '',
      notes: typeof r.notes === 'string' ? r.notes.slice(0, 2000) : '',
      payments: sanitizeQuotePayments(r.payments),
    });
  }
  return out;
}

function sanitizeActualCostItems(raw: unknown, roomId: string): ActualCostItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ActualCostItem[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) continue;
    const r = x as Record<string, unknown>;
    const id = typeof r.id === 'string' && r.id ? r.id : '';
    if (!id) continue;
    const paymentStatus: ActualCostItem['paymentStatus'] =
      typeof r.paymentStatus === 'string' && ACTUAL_PAY_STATUSES.includes(r.paymentStatus as ActualCostItem['paymentStatus'])
        ? (r.paymentStatus as ActualCostItem['paymentStatus'])
        : 'paid';
    out.push({
      id,
      roomId,
      category: typeof r.category === 'string' ? r.category.slice(0, 120) : 'Other',
      description: typeof r.description === 'string' ? r.description.slice(0, 2000) : '',
      amountPaid: Math.max(0, num(r.amountPaid)),
      paidDate: typeof r.paidDate === 'string' ? r.paidDate.slice(0, 40) : '',
      paymentStatus,
      notes: typeof r.notes === 'string' ? r.notes.slice(0, 2000) : '',
    });
  }
  return out;
}

/**
 * Rebuild a room from persisted JSON with valid dimensions, scope, and pricing (never throws).
 */
export function safeNormalizeRoom(raw: unknown): Room | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) return null;

  const scopeMerged = { ...sanitizeScopeObject(o.scopeInputs), ...sanitizeScopeObject(o.scope) };
  const dimensions = sanitizeDimensions(o.dimensions);
  const calcs = computeRoomCalculations(dimensions);

  const room: Room = {
    id: o.id,
    name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : 'Room',
    type: typeof o.type === 'string' && o.type.trim() ? o.type.trim() : 'living',
    budget: Math.max(0, num(o.budget)),
    dimensions,
    expenses: Array.isArray(o.expenses) ? (o.expenses as Room['expenses']) : [],
    quoteItems: sanitizeQuoteItems(o.quoteItems, o.id),
    actualCostItems: sanitizeActualCostItems(o.actualCostItems, o.id),
    photoUrls: Array.isArray(o.photoUrls) ? (o.photoUrls as string[]) : [],
    intendedScope: Array.isArray(o.intendedScope)
      ? (o.intendedScope as string[]).filter(s => typeof s === 'string')
      : [],
    notes: typeof o.notes === 'string' ? o.notes : '',
    scopeInputs: scopeMerged,
    scope: scopeMerged,
    calculations: calcs,
  };

  try {
    return applyRoomPricing(room);
  } catch {
    try {
      const est = computeIndicativeEstimate(room);
      return { ...room, estimate: est, pricingV1: emptyPricingV1() };
    } catch {
      return {
        ...room,
        estimate: { low: 0, mid: 0, high: 0 },
        pricingV1: emptyPricingV1(),
      };
    }
  }
}

/**
 * Rebuild a project; drops invalid room entries.
 */
export function safeNormalizeProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) return null;

  const roomList = Array.isArray(o.rooms) ? o.rooms : [];
  const rooms: Room[] = [];
  for (const r of roomList) {
    const norm = safeNormalizeRoom(r);
    if (norm) rooms.push(norm);
  }

  const rawOwnerEmail = o.ownerEmail;
  const ownerEmail =
    typeof rawOwnerEmail === 'string' && rawOwnerEmail.trim().length > 0
      ? rawOwnerEmail.trim().slice(0, 320)
      : undefined;

  return {
    id: o.id,
    name: typeof o.name === 'string' ? o.name : 'Project',
    description: typeof o.description === 'string' ? o.description : '',
    address: typeof o.address === 'string' ? o.address : '',
    postcode: typeof o.postcode === 'string' ? o.postcode : '',
    totalBudget: Math.max(0, num(o.totalBudget)),
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString(),
    isUnlocked: o.isUnlocked === true,
    ...(ownerEmail ? { ownerEmail } : {}),
    rooms,
  };
}

export function exportProjectsJson(projects: Project[]): string {
  return JSON.stringify(projects, null, 2);
}

/**
 * Parses a backup JSON payload. Accepts either a top-level Project[] array
 * or `{ "projects": Project[] }`. Returns null when anything is malformed.
 */
export function importProjectsJson(json: string): Project[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  let rawList: unknown;
  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const o = parsed as Record<string, unknown>;
    if (!Array.isArray(o.projects)) return null;
    rawList = o.projects;
  } else {
    return null;
  }

  const rawArray = rawList as unknown[];
  const normalized: Project[] = [];
  for (const el of rawArray) {
    const norm = safeNormalizeProject(el);
    if (norm == null) return null;
    normalized.push(norm);
  }
  return normalized;
}

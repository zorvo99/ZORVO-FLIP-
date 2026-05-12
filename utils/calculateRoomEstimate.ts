import type { Dimensions, Project, Room, RoomEstimateBand, RoomEstimateLineItem, RoomPricingV1, RoomScopeValues } from '../types';
import { computeIndicativeEstimate, getPlaceholderTradeBreakdown } from './indicativeEstimate';
import {
  PRICING_RULES,
  getCabinetRates,
  getFloorRates,
  getLaundryBenchRates,
  getMaterialBenchRates,
  getSplashRates,
  getWindowRates,
  type PricingMatchContext,
} from './pricingRules';
import { sanitizeDimensions } from './safePersistence';
import { computeRoomCalculations } from './roomCalculations';

function mergeScope(room: Room): RoomScopeValues {
  return { ...(room.scopeInputs || {}), ...(room.scope || {}) };
}

function t(scope: RoomScopeValues, key: string): string {
  const v = scope[key];
  return typeof v === 'string' ? v : '';
}

function buildTradeBreakdown(
  items: RoomEstimateLineItem[]
): { label: string; low: number; high: number }[] {
  const m = new Map<string, { low: number; high: number }>();
  for (const li of items) {
    const cur = m.get(li.category) || { low: 0, high: 0 };
    m.set(li.category, { low: cur.low + li.low, high: cur.high + li.high });
  }
  return Array.from(m.entries())
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function lineLowHigh(
  rule: (typeof PRICING_RULES)[0],
  scope: RoomScopeValues,
  qty: number
): { low: number; high: number } {
  switch (rule.id) {
    case 'kitch.cabinetry': {
      const r = getCabinetRates(scope, true);
      return { low: Math.round(qty * r.low), high: Math.round(qty * r.high) };
    }
    case 'laundry.cabinetry': {
      const r = getCabinetRates(scope, false);
      return { low: Math.round(qty * r.low), high: Math.round(qty * r.high) };
    }
    case 'kitch.bench': {
      const r = getMaterialBenchRates(scope);
      return { low: Math.round(qty * r.low), high: Math.round(qty * r.high) };
    }
    case 'laundry.bench': {
      const r = getLaundryBenchRates(scope);
      return { low: Math.round(qty * r.low), high: Math.round(qty * r.high) };
    }
    case 'kitch.splash': {
      const r = getSplashRates(scope);
      return { low: Math.round(qty * r.low), high: Math.round(qty * r.high) };
    }
    case 'win': {
      const r = getWindowRates(scope);
      return { low: r.low, high: r.high };
    }
    case 'floor': {
      const r = getFloorRates(scope);
      return { low: Math.round(qty * r.low), high: Math.round(qty * r.high) };
    }
    case 'demo.concrete':
      return { low: 2000, high: 5000 };
    case 'demo.other':
    case 'alf.demo.other':
      return { low: 600, high: 2200 };
    case 'site.clear':
      return { low: 800, high: 3200 };
    case 'plumb': {
      const lo = Math.round(qty * rule.lowRate);
      const hi = Math.round(qty * rule.highRate);
      const m = t(scope, 'plumbingScope') === 'New plumbing' ? 1.15 : 1;
      return { low: Math.round(lo * m), high: Math.round(hi * m) };
    }
    case 'elec': {
      const lo = Math.round(qty * rule.lowRate);
      const hi = Math.round(qty * rule.highRate);
      const m = t(scope, 'electricalScope') === 'New electrical' ? 1.2 : 1;
      return { low: Math.round(lo * m), high: Math.round(hi * m) };
    }
    default:
      return {
        low: Math.round(qty * rule.lowRate),
        high: Math.round(qty * rule.highRate),
      };
  }
}

/**
 * v1: sum applicable PRICING_RULES lines. If no lines or $0, falls back to area-based placeholder.
 */
const emptyPlaceholderPricing = (): RoomPricingV1 => ({
  lineItems: [],
  tradeBreakdown: [],
  source: 'placeholder',
});

export function calculateRoomEstimate(room: Room): {
  band: RoomEstimateBand;
  pricing: RoomPricingV1;
} {
  try {
    const scope = mergeScope(room);
    const roomType = (typeof room.type === 'string' && room.type.trim() ? room.type : 'living').trim();
    const dimensions: Dimensions = sanitizeDimensions(room.dimensions);
    const calcs =
      room.calculations &&
      Number.isFinite(room.calculations.floorArea) &&
      Number.isFinite(room.calculations.wallArea) &&
      Number.isFinite(room.calculations.linearMetres)
        ? room.calculations
        : computeRoomCalculations(dimensions);
    const ctx: PricingMatchContext = { roomType, scope, calcs, dimensions };

    const rtk = roomType.toLowerCase();
    const lineItems: RoomEstimateLineItem[] = [];

    for (const rule of PRICING_RULES) {
      if (rule.roomTypes && !rule.roomTypes.includes(rtk)) continue;
      if (!rule.matches(ctx)) continue;
      const qty = rule.quantity(ctx);
      if (qty <= 0 || !Number.isFinite(qty)) continue;
      const { low, high } = lineLowHigh(rule, scope, qty);
      if (low <= 0 && high <= 0) continue;
      lineItems.push({
        id: rule.id,
        label: rule.label,
        category: rule.category,
        unit: rule.unit,
        quantity: Math.round(qty * 100) / 100,
        low,
        high,
      });
    }

    if (lineItems.length === 0) {
      const ph = computeIndicativeEstimate({ ...room, scope, scopeInputs: scope, dimensions, calculations: calcs });
      return {
        band: ph,
        pricing: emptyPlaceholderPricing(),
      };
    }

    const low = lineItems.reduce((s, l) => s + l.low, 0);
    const high = lineItems.reduce((s, l) => s + l.high, 0);
    if (low < 1 && high < 1) {
      const ph = computeIndicativeEstimate({ ...room, scope, scopeInputs: scope, dimensions, calculations: calcs });
      return {
        band: ph,
        pricing: emptyPlaceholderPricing(),
      };
    }

    const mid = Math.round((low + high) / 2);
    return {
      band: {
        low: Math.max(0, low),
        mid: Math.max(0, mid),
        high: Math.max(0, high),
      },
      pricing: {
        lineItems,
        tradeBreakdown: buildTradeBreakdown(lineItems),
        source: 'rules',
      },
    };
  } catch (e) {
    console.error('[calculateRoomEstimate]', e);
    const dimensions = sanitizeDimensions(room.dimensions);
    const calcs = computeRoomCalculations(dimensions);
    const ph = computeIndicativeEstimate({ ...room, dimensions, calculations: calcs });
    return { band: ph, pricing: emptyPlaceholderPricing() };
  }
}

/**
 * Recompute `estimate` + `pricingV1` for a room (used on save / patch).
 */
export function applyRoomPricing(room: Room): Room {
  try {
    const { band, pricing } = calculateRoomEstimate(room);
    return { ...room, estimate: band, pricingV1: pricing };
  } catch (e) {
    console.error('[applyRoomPricing]', e);
    const dimensions = sanitizeDimensions(room.dimensions);
    const calculations = computeRoomCalculations(dimensions);
    const safeRoom = { ...room, dimensions, calculations };
    return {
      ...safeRoom,
      estimate: computeIndicativeEstimate(safeRoom),
      pricingV1: emptyPlaceholderPricing(),
    };
  }
}

/**
 * Project-level trade lines: v1 rules aggregate per room; any room still on placeholder uses the simple spread for that room only.
 */
export function aggregateProjectTradeBreakdown(project: Project): { label: string; low: number; high: number }[] {
  const map = new Map<string, { low: number; high: number }>();
  for (const room of project.rooms) {
    try {
      if (room.pricingV1?.source === 'rules' && room.pricingV1.tradeBreakdown.length > 0) {
        for (const row of room.pricingV1.tradeBreakdown) {
          const cur = map.get(row.label) || { low: 0, high: 0 };
          map.set(row.label, { low: cur.low + row.low, high: cur.high + row.high });
        }
      } else {
        const est = room.estimate || computeIndicativeEstimate(room);
        for (const row of getPlaceholderTradeBreakdown(est.low, est.high)) {
          const cur = map.get(row.label) || { low: 0, high: 0 };
          map.set(row.label, { low: cur.low + row.low, high: cur.high + row.high });
        }
      }
    } catch (e) {
      console.error('[aggregateProjectTradeBreakdown] room', room.id, e);
    }
  }
  return Array.from(map.entries())
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

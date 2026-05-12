import type { Room, RoomEstimateBand } from '../types';

/**
 * Rough AUD placeholder band from shell size + room type only.
 * Replace with line-item engine when pricing rules exist.
 */
const TYPE_RATE_AUD_PER_SQM: Record<string, number> = {
  kitchen: 2200,
  laundry: 1400,
  bathroom: 2800,
  ensuite: 2800,
  living: 900,
  dining: 900,
  bedroom: 800,
  study: 800,
  alfresco: 1100,
  outdoors: 600,
  garage: 700,
};

export function computeIndicativeEstimate(room: Room): RoomEstimateBand {
  const d = room.dimensions;
  const l = d && typeof d.length === 'number' && Number.isFinite(d.length) ? Math.max(0, d.length) : 0;
  const w = d && typeof d.width === 'number' && Number.isFinite(d.width) ? Math.max(0, d.width) : 0;
  const fa =
    room.calculations?.floorArea != null && Number.isFinite(room.calculations.floorArea)
      ? Math.max(0, room.calculations.floorArea)
      : l * w;
  const base = Math.max(0, fa);
  const key = (typeof room.type === 'string' ? room.type : 'living').toLowerCase();
  const rate = TYPE_RATE_AUD_PER_SQM[key] ?? 1000;
  const mid = Math.round(base * rate);
  return {
    low: Math.round(mid * 0.75),
    mid,
    high: Math.round(mid * 1.25),
  };
}

/** Placeholder category split only — not tied to line items. Sums to 100% per band. */
export const PLACEHOLDER_TRADE_SLICES: ReadonlyArray<{ label: string; share: number }> = [
  { label: 'Labour & coordination', share: 0.34 },
  { label: 'Materials & finishes', share: 0.31 },
  { label: 'Trades & services', share: 0.22 },
  { label: 'Contingency & fees', share: 0.13 },
];

export interface PlaceholderTradeLine {
  label: string;
  low: number;
  high: number;
}

export function getPlaceholderTradeBreakdown(low: number, high: number): PlaceholderTradeLine[] {
  return PLACEHOLDER_TRADE_SLICES.map(s => ({
    label: s.label,
    low: Math.round(Math.max(0, low) * s.share),
    high: Math.round(Math.max(0, high) * s.share),
  }));
}

export function sumPlaceholderBreakdowns(rows: PlaceholderTradeLine[]): PlaceholderTradeLine[] {
  const map = new Map<string, { low: number; high: number }>();
  for (const r of rows) {
    const cur = map.get(r.label) || { low: 0, high: 0 };
    map.set(r.label, { low: cur.low + r.low, high: cur.high + r.high });
  }
  return PLACEHOLDER_TRADE_SLICES.map(s => {
    const v = map.get(s.label);
    return { label: s.label, low: v?.low ?? 0, high: v?.high ?? 0 };
  });
}

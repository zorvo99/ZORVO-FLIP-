import type { Dimensions, RoomCalculations, RoomScopeValues } from '../types';

/**
 * Simple placeholder $/unit rates (AUD, ex-GST) for v1 line items — not market quotes.
 */

export type PricingMatchContext = {
  roomType: string;
  scope: RoomScopeValues;
  calcs: RoomCalculations;
  dimensions: Dimensions;
};

export interface PricingRule {
  id: string;
  label: string;
  category: string;
  unit: string;
  lowRate: number;
  highRate: number;
  /** If set, only these room types (lowercase) may produce a line. */
  roomTypes?: string[];
  matches: (m: PricingMatchContext) => boolean;
  /** Return billable quantity in `unit`. Return 0 to skip even when `matches` is true. */
  quantity: (m: PricingMatchContext) => number;
}

function n(scope: RoomScopeValues, key: string): number {
  const v = scope[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return 0;
    // Guard against accidental parsing of descriptive labels like "Small (600–1000mm)".
    if (!/^-?\d+(\.\d+)?$/.test(s)) return 0;
    return parseFloat(s) || 0;
  }
  return 0;
}

function b(scope: RoomScopeValues, key: string): boolean {
  return scope[key] === true;
}

function t(scope: RoomScopeValues, key: string): string {
  const v = scope[key];
  return typeof v === 'string' ? v : '';
}

function dimArea(scope: RoomScopeValues, base: string): number {
  return Math.max(0, n(scope, `${base}_length`)) * Math.max(0, n(scope, `${base}_width`));
}

const rt = (r: string) => r.toLowerCase();

const OUTDOOR_PRICING_ROOM_TYPES = ['alfresco', 'outdoors', 'outdoor kitchen'] as const;

function isOutdoorPricingRoom(roomType: string): boolean {
  const k = rt(roomType);
  return k === 'alfresco' || k === 'outdoors' || k === 'outdoor kitchen';
}

function deckingScopeActive(scope: RoomScopeValues): boolean {
  const v = t(scope, 'deckingScope').trim();
  return v.length > 0 && v.toLowerCase() !== 'none';
}

function pavingScopeActive(scope: RoomScopeValues): boolean {
  const v = t(scope, 'pavingScope').trim();
  return v.length > 0 && v.toLowerCase() !== 'none';
}

/** Billable deck m²: explicit footprint dims, else room shell floor area. */
function outdoorDeckQuantity(m: PricingMatchContext): number {
  const fromDims = Math.max(
    dimArea(m.scope, 'decking'),
    dimArea(m.scope, 'alfDeck'),
    dimArea(m.scope, 'extDeck')
  );
  if (fromDims > 0.01) return fromDims;
  return Math.max(0, m.calcs.floorArea);
}

function isKitchenFamily(r: string): boolean {
  const k = rt(r);
  return k === 'kitchen' || k === 'laundry';
}

const CABINET_RATE: Record<string, { low: number; high: number }> = {
  Refresh: { low: 320, high: 680 },
  'Replace doors': { low: 620, high: 1200 },
  'Full replacement': { low: 980, high: 1950 },
};

const BENCHTOP_LM: Record<string, { low: number; high: number }> = {
  Stone: { low: 720, high: 1600 },
  Laminate: { low: 180, high: 480 },
  Other: { low: 420, high: 980 },
};

const SPLASH_AREA: Record<string, { low: number; high: number }> = {
  Glass: { low: 120, high: 280 },
  Tile: { low: 85, high: 200 },
  Other: { low: 95, high: 220 },
};

/** Standard demo wall toggle key by room. */
function demoWallsKey(roomType: string): string {
  return rt(roomType) === 'alfresco' ? 'alfDemoWalls' : 'demoWalls';
}

function demoCeilingsKey(roomType: string): string {
  return rt(roomType) === 'alfresco' ? 'alfDemoCeilings' : 'demoCeilings';
}

function demoConcreteKey(roomType: string): string {
  return rt(roomType) === 'alfresco' ? 'alfDemoConcrete' : 'demoConcrete';
}

/**
 * All rule-based line templates. Not every scope field has a line — some roll into nearby trades.
 */
export const PRICING_RULES: PricingRule[] = [
  // —— Demolition ——
  {
    id: 'demo.walls',
    label: 'Demolition (wall linings allow.)',
    category: 'Demolition',
    unit: 'm²',
    lowRate: 40,
    highRate: 95,
    matches: m => b(m.scope, demoWallsKey(m.roomType)),
    quantity: m => Math.max(2, m.calcs.wallArea * 0.12),
  },
  {
    id: 'demo.ceilings',
    label: 'Demolition (ceilings)',
    category: 'Demolition',
    unit: 'm²',
    lowRate: 22,
    highRate: 52,
    matches: m => b(m.scope, demoCeilingsKey(m.roomType)),
    quantity: m => m.calcs.floorArea * 0.85,
  },
  {
    id: 'demo.concrete',
    label: 'Demolition (concrete / substrate)',
    category: 'Demolition',
    unit: 'job',
    lowRate: 1,
    highRate: 1,
    matches: m => b(m.scope, demoConcreteKey(m.roomType)),
    quantity: m => 1,
  },
  {
    id: 'demo.lm',
    label: 'Demolition (linear run)',
    category: 'Demolition',
    unit: 'lm',
    lowRate: 85,
    highRate: 175,
    matches: m => n(m.scope, 'demoLm') > 0,
    quantity: m => n(m.scope, 'demoLm'),
  },
  {
    id: 'alf.demo.lm',
    label: 'Demolition (linear run)',
    category: 'Demolition',
    unit: 'lm',
    lowRate: 85,
    highRate: 175,
    roomTypes: ['alfresco'],
    matches: m => n(m.scope, 'alfDemoLm') > 0,
    quantity: m => n(m.scope, 'alfDemoLm'),
  },
  {
    id: 'demo.other',
    label: 'Demolition (other — allowance)',
    category: 'Demolition',
    unit: 'job',
    lowRate: 1,
    highRate: 1,
    matches: m => t(m.scope, 'demoOther').trim().length > 0,
    quantity: m => 1,
  },
  {
    id: 'alf.demo.other',
    label: 'Demolition (other — allowance)',
    category: 'Demolition',
    unit: 'job',
    lowRate: 1,
    highRate: 1,
    roomTypes: ['alfresco'],
    matches: m => t(m.scope, 'alfDemoOther').trim().length > 0,
    quantity: m => 1,
  },

  // —— Kitchen cabinetry (rates scale by scope level on cabinet footprint m²) ——
  {
    id: 'kitch.cabinetry',
    label: 'Cabinetry (kit.)',
    category: 'Cabinetry',
    unit: 'm²',
    lowRate: 0,
    highRate: 0,
    roomTypes: ['kitchen'],
    matches: m => Boolean(t(m.scope, 'cabinetScope')),
    quantity: m => {
      const ca = dimArea(m.scope, 'kitchenCabinet');
      const a = ca > 0.01 ? ca : m.calcs.floorArea * 0.22;
      return Math.max(1, a);
    },
  },
  {
    id: 'laundry.cabinetry',
    label: 'Cabinetry (laundry)',
    category: 'Cabinetry',
    unit: 'm²',
    lowRate: 0,
    highRate: 0,
    roomTypes: ['laundry'],
    matches: m => Boolean(t(m.scope, 'laundryCabScope')),
    quantity: m => {
      const ca = dimArea(m.scope, 'laundryCabinet');
      const a = ca > 0.01 ? ca : m.calcs.floorArea * 0.2;
      return Math.max(1, a);
    },
  },
  {
    id: 'kitch.island',
    label: 'Island cabinetry (allowance)',
    category: 'Cabinetry',
    unit: 'm²',
    lowRate: 400,
    highRate: 950,
    roomTypes: ['kitchen'],
    matches: m => b(m.scope, 'islandIncluded'),
    quantity: m => {
      const ia = dimArea(m.scope, 'island');
      return Math.max(0.8, ia > 0.01 ? ia * 0.4 : 1.2);
    },
  },

  // —— Benchtops ——
  {
    id: 'kitch.bench',
    label: 'Benchtop',
    category: 'Benchtops',
    unit: 'lm',
    lowRate: 0,
    highRate: 0,
    roomTypes: ['kitchen'],
    matches: m => n(m.scope, 'benchtopLm') > 0 && Boolean(t(m.scope, 'benchtopMaterial')),
    quantity: m => n(m.scope, 'benchtopLm'),
  },
  {
    id: 'laundry.bench',
    label: 'Benchtop (laundry)',
    category: 'Benchtops',
    unit: 'lm',
    lowRate: 0,
    highRate: 0,
    roomTypes: ['laundry'],
    matches: m => n(m.scope, 'laundryBenchtopLm') > 0,
    quantity: m => n(m.scope, 'laundryBenchtopLm'),
  },

  // —— Splashback ——
  {
    id: 'kitch.splash',
    label: 'Splashback',
    category: 'Splashback',
    unit: 'm²',
    lowRate: 0,
    highRate: 0,
    roomTypes: ['kitchen'],
    matches: m => {
      const h = n(m.scope, 'splashbackHeight');
      const w = n(m.scope, 'splashbackWidth');
      return h > 0 && w > 0 && Boolean(t(m.scope, 'splashbackMaterial'));
    },
    quantity: m => Math.max(0.1, n(m.scope, 'splashbackHeight') * n(m.scope, 'splashbackWidth')),
  },

  // —— Appliances (fixed allow.) ——
  {
    id: 'app.cooktop',
    label: 'Appliances — cooktop (allowance)',
    category: 'Appliances',
    unit: 'job',
    lowRate: 650,
    highRate: 1400,
    roomTypes: ['kitchen'],
    matches: m => b(m.scope, 'cooktop'),
    quantity: () => 1,
  },
  {
    id: 'app.oven',
    label: 'Appliances — oven (allowance)',
    category: 'Appliances',
    unit: 'job',
    lowRate: 800,
    highRate: 2200,
    roomTypes: ['kitchen'],
    matches: m => b(m.scope, 'oven'),
    quantity: () => 1,
  },
  {
    id: 'app.rangehood',
    label: 'Appliances — rangehood (allowance)',
    category: 'Appliances',
    unit: 'job',
    lowRate: 500,
    highRate: 1600,
    roomTypes: ['kitchen'],
    matches: m => b(m.scope, 'rangehood'),
    quantity: () => 1,
  },
  {
    id: 'app.dw',
    label: 'Appliances — dishwasher (allowance)',
    category: 'Appliances',
    unit: 'job',
    lowRate: 550,
    highRate: 1200,
    roomTypes: ['kitchen'],
    matches: m => b(m.scope, 'dishwasher'),
    quantity: () => 1,
  },

  // —— Tiling (wet) ——
  {
    id: 'tile.walls',
    label: 'Tiling (walls allow.)',
    category: 'Tiling',
    unit: 'm²',
    lowRate: 70,
    highRate: 195,
    roomTypes: ['bathroom', 'ensuite', 'laundry'],
    matches: m => b(m.scope, 'tileWalls'),
    quantity: m => m.calcs.wallArea * 0.4,
  },
  {
    id: 'tile.floors',
    label: 'Tiling (floor)',
    category: 'Tiling',
    unit: 'm²',
    lowRate: 65,
    highRate: 180,
    roomTypes: ['bathroom', 'ensuite', 'laundry'],
    matches: m => b(m.scope, 'tileFloors'),
    quantity: m => m.calcs.floorArea * 0.95,
  },

  // —— Waterproofing ——
  {
    id: 'wp.wet',
    label: 'Waterproofing (allowance)',
    category: 'Waterproofing',
    unit: 'm²',
    lowRate: 45,
    highRate: 110,
    roomTypes: ['bathroom', 'ensuite'],
    matches: m => b(m.scope, 'waterproofAllowance'),
    quantity: m => m.calcs.floorArea * 0.55,
  },

  // —— Plumbing / Electrical (lm-based or defaults) ——
  {
    id: 'plumb',
    label: 'Plumbing (allowance)',
    category: 'Plumbing',
    unit: 'lm',
    lowRate: 85,
    highRate: 220,
    matches: m => {
      if (!t(m.scope, 'plumbingScope')) return false;
      if (n(m.scope, 'plumbingLm') > 0) return true;
      return ['bathroom', 'ensuite', 'laundry'].includes(rt(m.roomType));
    },
    quantity: m => {
      const lm = n(m.scope, 'plumbingLm');
      if (lm > 0) return lm;
      if (['bathroom', 'ensuite', 'laundry'].includes(rt(m.roomType))) return m.calcs.floorArea * 0.28;
      return 0;
    },
  },
  {
    id: 'elec',
    label: 'Electrical (allowance)',
    category: 'Electrical',
    unit: 'lm',
    lowRate: 55,
    highRate: 165,
    matches: m => {
      if (!t(m.scope, 'electricalScope')) return false;
      if (n(m.scope, 'electricalLm') > 0) return true;
      return !['kitchen'].includes(rt(m.roomType));
    },
    quantity: m => {
      const lm = n(m.scope, 'electricalLm');
      if (lm > 0) return lm;
      if (rt(m.roomType) === 'kitchen') return 0;
      return m.calcs.floorArea * 0.32;
    },
  },

  // —— Lighting ——
  {
    id: 'light',
    label: 'Lighting (allowance)',
    category: 'Lighting',
    unit: 'point',
    lowRate: 220,
    highRate: 580,
    matches: m => Boolean(t(m.scope, 'lightingLevel')) && m.roomType.toLowerCase() !== 'garage',
    quantity: m => {
      const q = n(m.scope, 'lightingFittingQty');
      return q > 0 ? q : (t(m.scope, 'lightingLevel') === 'Architectural' ? 6 : 3);
    },
  },
  {
    id: 'light.garage',
    label: 'Lighting (garage)',
    category: 'Lighting',
    unit: 'point',
    lowRate: 180,
    highRate: 450,
    roomTypes: ['garage'],
    matches: m => n(m.scope, 'garageLightQty') > 0,
    quantity: m => n(m.scope, 'garageLightQty'),
  },
  {
    id: 'light.alf',
    label: 'Lighting (outdoor)',
    category: 'Lighting',
    unit: 'point',
    lowRate: 200,
    highRate: 520,
    roomTypes: ['alfresco'],
    matches: m => n(m.scope, 'alfLightQty') > 0,
    quantity: m => n(m.scope, 'alfLightQty'),
  },

  // —— Windows ——
  {
    id: 'win',
    label: 'Windows (typical allow.)',
    category: 'Windows',
    unit: 'opening',
    lowRate: 0,
    highRate: 0,
    matches: m => Boolean(t(m.scope, 'windowSize')) && t(m.scope, 'windowType').length > 0,
    quantity: () => 1,
  },

  // —— Gyprock ——
  {
    id: 'gyp.w',
    label: 'Gyprock (walls)',
    category: 'Gyprock',
    unit: 'm²',
    lowRate: 28,
    highRate: 65,
    matches: m => b(m.scope, 'gyprockWalls'),
    quantity: m => m.calcs.wallArea * 0.5,
  },
  {
    id: 'gyp.c',
    label: 'Gyprock (ceilings)',
    category: 'Gyprock',
    unit: 'm²',
    lowRate: 32,
    highRate: 70,
    matches: m => b(m.scope, 'gyprockCeilings'),
    quantity: m => m.calcs.floorArea * 0.9,
  },

  // —— Painting ——
  {
    id: 'paint.w',
    label: 'Painting (walls)',
    category: 'Painting',
    unit: 'm²',
    lowRate: 18,
    highRate: 45,
    matches: m => b(m.scope, 'paintWalls'),
    quantity: m => m.calcs.wallArea * 0.85,
  },
  {
    id: 'paint.c',
    label: 'Painting (ceilings)',
    category: 'Painting',
    unit: 'm²',
    lowRate: 20,
    highRate: 48,
    matches: m => b(m.scope, 'paintCeilings'),
    quantity: m => m.calcs.floorArea * 0.9,
  },
  {
    id: 'ext.paint',
    label: 'External painting (allow.)',
    category: 'Painting',
    unit: 'm²',
    lowRate: 16,
    highRate: 42,
    roomTypes: ['outdoors'],
    matches: m =>
      b(m.scope, 'extPaintWalls') || b(m.scope, 'extPaintEaves') || b(m.scope, 'extPaintGutters') || b(m.scope, 'extPaintRoof'),
    quantity: m => m.calcs.wallArea * 0.35,
  },

  // —— Flooring ——
  {
    id: 'floor',
    label: 'Flooring',
    category: 'Flooring',
    unit: 'm²',
    lowRate: 0,
    highRate: 0,
    matches: m => Boolean(t(m.scope, 'floorType')) && t(m.scope, 'floorType').length > 0,
    quantity: m => m.calcs.floorArea * 0.95,
  },

  // —— Doors ——
  {
    id: 'door.int.living',
    label: 'Internal doors',
    category: 'Doors',
    unit: 'no.',
    lowRate: 450,
    highRate: 1150,
    roomTypes: ['living', 'dining', 'bedroom', 'study'],
    matches: m => n(m.scope, 'internalDoorQty') > 0,
    quantity: m => n(m.scope, 'internalDoorQty'),
  },
  {
    id: 'door.wet',
    label: 'Doors (wet area)',
    category: 'Doors',
    unit: 'no.',
    lowRate: 500,
    highRate: 1400,
    roomTypes: ['bathroom', 'ensuite'],
    matches: m => n(m.scope, 'wetDoorQty') > 0,
    quantity: m => n(m.scope, 'wetDoorQty'),
  },
  {
    id: 'door.laundry',
    label: 'Doors (laundry)',
    category: 'Doors',
    unit: 'no.',
    lowRate: 450,
    highRate: 1100,
    roomTypes: ['laundry'],
    matches: m => n(m.scope, 'laundryDoorQty') > 0,
    quantity: m => n(m.scope, 'laundryDoorQty'),
  },
  {
    id: 'door.ext.k',
    label: 'External / entry doors (allow.)',
    category: 'Doors',
    unit: 'no.',
    lowRate: 1200,
    highRate: 3500,
    roomTypes: ['kitchen'],
    matches: m => n(m.scope, 'extDoorQty') > 0,
    quantity: m => n(m.scope, 'extDoorQty'),
  },

  // —— Outdoor scope (alfresco / outdoors / outdoor kitchen) ——
  {
    id: 'ext.deck.scope',
    label: 'Decking',
    category: 'Decking',
    unit: 'm²',
    lowRate: 180,
    highRate: 450,
    roomTypes: [...OUTDOOR_PRICING_ROOM_TYPES],
    matches: m =>
      isOutdoorPricingRoom(m.roomType) &&
      (deckingScopeActive(m.scope) ||
        dimArea(m.scope, 'decking') > 0.01 ||
        dimArea(m.scope, 'alfDeck') > 0.01 ||
        dimArea(m.scope, 'extDeck') > 0.01),
    quantity: m => outdoorDeckQuantity(m),
  },
  {
    id: 'ext.pergola',
    label: 'Pergola / outdoor roof structure',
    category: 'Structure',
    unit: 'job',
    lowRate: 8000,
    highRate: 25000,
    roomTypes: [...OUTDOOR_PRICING_ROOM_TYPES],
    matches: m => isOutdoorPricingRoom(m.roomType) && b(m.scope, 'pergola'),
    quantity: () => 1,
  },
  {
    id: 'ext.paving',
    label: 'Outdoor paving',
    category: 'Paving',
    unit: 'm²',
    lowRate: 90,
    highRate: 220,
    roomTypes: [...OUTDOOR_PRICING_ROOM_TYPES],
    matches: m => isOutdoorPricingRoom(m.roomType) && pavingScopeActive(m.scope),
    quantity: m => {
      const a = dimArea(m.scope, 'paving');
      return a > 0.01 ? a : Math.max(0, m.calcs.floorArea);
    },
  },
  {
    id: 'ext.landscaping',
    label: 'Landscaping',
    category: 'Landscaping',
    unit: 'm²',
    lowRate: 60,
    highRate: 180,
    roomTypes: [...OUTDOOR_PRICING_ROOM_TYPES],
    matches: m => isOutdoorPricingRoom(m.roomType) && b(m.scope, 'landscaping'),
    quantity: m => {
      const a = n(m.scope, 'landscapingArea');
      return a > 0 ? a : Math.max(0, m.calcs.floorArea);
    },
  },
  {
    id: 'ext.outdoor.electrical',
    label: 'Outdoor electrical',
    category: 'Electrical',
    unit: 'job',
    lowRate: 1200,
    highRate: 3500,
    roomTypes: [...OUTDOOR_PRICING_ROOM_TYPES],
    matches: m => isOutdoorPricingRoom(m.roomType) && b(m.scope, 'outdoorElectrical'),
    quantity: () => 1,
  },
  {
    id: 'ext.fencing.screen',
    label: 'Fencing / screening',
    category: 'Fencing',
    unit: 'lm',
    lowRate: 180,
    highRate: 650,
    roomTypes: [...OUTDOOR_PRICING_ROOM_TYPES],
    matches: m =>
      isOutdoorPricingRoom(m.roomType) &&
      (b(m.scope, 'fencing') || n(m.scope, 'alfFencingLm') > 0 || n(m.scope, 'fencingLm') > 0),
    quantity: m => {
      const byToggle = b(m.scope, 'fencing') ? n(m.scope, 'fencingLm') : 0;
      return Math.max(byToggle, n(m.scope, 'alfFencingLm'), n(m.scope, 'fencingLm'));
    },
  },

  // —— Roller door ——
  {
    id: 'roller',
    label: 'Roller door (allowance)',
    category: 'Roller door',
    unit: 'm²',
    lowRate: 180,
    highRate: 420,
    roomTypes: ['garage'],
    matches: m => Boolean(t(m.scope, 'rollerDoorType')) && t(m.scope, 'rollerDoorType').length > 0,
    quantity: m => Math.max(0.1, n(m.scope, 'rollerDoorHeight') * n(m.scope, 'rollerDoorWidth') || 6),
  },

  // —— Site / small outdoor ——
  {
    id: 'outdoor.kitchen.lm',
    label: 'Outdoor kitchen (allow.)',
    category: 'Cabinetry',
    unit: 'lm',
    lowRate: 1500,
    highRate: 3500,
    roomTypes: [...OUTDOOR_PRICING_ROOM_TYPES],
    matches: m => b(m.scope, 'outdoorKitchen') && n(m.scope, 'outdoorKitchenLm') > 0,
    quantity: m => n(m.scope, 'outdoorKitchenLm'),
  },
  {
    id: 'site.clear',
    label: 'Site clearing (allowance)',
    category: 'Other',
    unit: 'job',
    lowRate: 800,
    highRate: 3500,
    roomTypes: ['outdoors'],
    matches: m => b(m.scope, 'siteClearing'),
    quantity: () => 1,
  },
];

// Post-process: concrete jobs use fixed 1800-5200, demo.other 600-2000, kitchen bench uses material rates
export function getMaterialBenchRates(
  scope: RoomScopeValues
): { low: number; high: number } {
  const mat = t(scope, 'benchtopMaterial');
  return BENCHTOP_LM[mat] || BENCHTOP_LM.Other;
}

export function getLaundryBenchRates(scope: RoomScopeValues): { low: number; high: number } {
  const mat = t(scope, 'laundryBenchtopMaterial');
  return BENCHTOP_LM[mat] || BENCHTOP_LM.Other;
}

export function getCabinetRates(
  scope: RoomScopeValues,
  isKitchen: boolean
): { low: number; high: number } {
  const k = isKitchen ? t(scope, 'cabinetScope') : t(scope, 'laundryCabScope');
  if (!k) return { low: 600, high: 1200 };
  return CABINET_RATE[k] || { low: 600, high: 1200 };
}

export function getSplashRates(scope: RoomScopeValues): { low: number; high: number } {
  const m = t(scope, 'splashbackMaterial');
  return SPLASH_AREA[m] || SPLASH_AREA.Other;
}

export function getWindowRates(scope: RoomScopeValues): { low: number; high: number } {
  const sz = t(scope, 'windowSize');
  if (sz === 'Small') return { low: 850, high: 2500 };
  if (sz === 'Medium') return { low: 1200, high: 4000 };
  if (sz === 'Large') return { low: 2000, high: 6000 };
  return { low: 1200, high: 3500 };
}

export function getFloorRates(scope: RoomScopeValues): { low: number; high: number } {
  const f = t(scope, 'floorType');
  if (f === 'Tile') return { low: 75, high: 185 };
  if (f === 'Vinyl') return { low: 45, high: 110 };
  if (f === 'Timber') return { low: 85, high: 220 };
  if (f === 'Carpet') return { low: 40, high: 95 };
  return { low: 55, high: 150 };
}

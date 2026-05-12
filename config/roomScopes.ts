/**
 * MVP walk-through scope: room type → sections → fields.
 * Persisted as flat keys on `Room.scope` / `Room.scopeInputs`.
 */

export type ScopeFieldType = 'toggle' | 'select' | 'number' | 'text' | 'dimensions' | 'quantity';

export interface ScopeField {
  key: string;
  label: string;
  type: ScopeFieldType;
  options?: string[];
  unit?: string;
  placeholder?: string;
}

export interface ScopeSection {
  title: string;
  fields: ScopeField[];
}

const DEMOLITION: ScopeSection = {
  title: 'Demolition',
  fields: [
    { key: 'demoWalls', label: 'Walls', type: 'toggle' },
    { key: 'demoCeilings', label: 'Ceilings', type: 'toggle' },
    { key: 'demoConcrete', label: 'Concrete', type: 'toggle' },
    { key: 'demoOther', label: 'Other demolition', type: 'text', placeholder: 'Describe other demo work' },
    { key: 'demoLm', label: 'Demolition quantity', type: 'quantity', unit: 'lm' },
  ],
};

const WINDOWS_STD: ScopeSection = {
  title: 'Windows',
  fields: [
    {
      key: 'windowType',
      label: 'Type',
      type: 'select',
      options: ['Fixed', 'Sliding', 'Awning'],
    },
    {
      key: 'windowGlazing',
      label: 'Glazing',
      type: 'select',
      options: ['Single', 'Double'],
    },
    {
      key: 'windowSize',
      label: 'Size',
      type: 'select',
      options: ['Small (600–1000mm)', 'Medium (1000–1500mm)', 'Large (1500–2400mm)'],
    },
    { key: 'windowQuantity', label: 'Quantity', type: 'quantity' },
  ],
};

const DOORS_STD: ScopeSection = {
  title: 'Doors',
  fields: [
    { key: 'doorQuantity', label: 'Quantity', type: 'quantity' },
    { key: 'doorType', label: 'Type', type: 'select', options: ['Hinged', 'Sliding'] },
    { key: 'doorMaterial', label: 'Material', type: 'select', options: ['Timber', 'Aluminium', 'Steel'] },
    { key: 'doorLocation', label: 'Location', type: 'select', options: ['Internal', 'External'] },
  ],
};

const GYPROCK_STD: ScopeSection = {
  title: 'Gyprock',
  fields: [
    { key: 'gyprockWalls', label: 'Walls', type: 'toggle' },
    { key: 'gyprockCeilings', label: 'Ceilings', type: 'toggle' },
  ],
};

const PAINTING_STD: ScopeSection = {
  title: 'Painting',
  fields: [
    { key: 'paintWalls', label: 'Walls', type: 'toggle' },
    { key: 'paintCeilings', label: 'Ceilings', type: 'toggle' },
  ],
};

const FLOORING_STD: ScopeSection = {
  title: 'Flooring',
  fields: [{ key: 'floorType', label: 'Type', type: 'select', options: ['Tile', 'Vinyl', 'Timber', 'Carpet'] }],
};

const PLUMBING_STD: ScopeSection = {
  title: 'Plumbing',
  fields: [
    { key: 'plumbingScope', label: 'Scope', type: 'select', options: ['Basic re-plumb', 'New plumbing'] },
    { key: 'plumbingLm', label: 'Plumbing quantity', type: 'quantity', unit: 'lm' },
  ],
};

const ELECTRICAL_STD: ScopeSection = {
  title: 'Electrical',
  fields: [
    { key: 'electricalScope', label: 'Scope', type: 'select', options: ['Basic rewire', 'New electrical'] },
    { key: 'electricalLm', label: 'Electrical quantity', type: 'quantity', unit: 'lm' },
  ],
};

const LIGHTING_STD: ScopeSection = {
  title: 'Lighting',
  fields: [
    { key: 'lightingLevel', label: 'Lighting level', type: 'select', options: ['Basic', 'Architectural'] },
    { key: 'lightingFittingQty', label: 'Quantity of fittings', type: 'quantity' },
  ],
};

/** Living / Dining / Bedroom / Study shell (shared) */
const LIVING_CORE: ScopeSection[] = [
  DEMOLITION,
  {
    title: 'Structural Works',
    fields: [
      { key: 'removeWalls', label: 'Remove walls', type: 'toggle' },
      { key: 'installWalls', label: 'Install new walls', type: 'toggle' },
      { key: 'structuralLm', label: 'Linear metres affected', type: 'quantity', unit: 'lm' },
    ],
  },
  ELECTRICAL_STD,
  LIGHTING_STD,
  WINDOWS_STD,
  GYPROCK_STD,
  PAINTING_STD,
  FLOORING_STD,
  DOORS_STD,
];

const BATHROOM_CORE: ScopeSection[] = [
  DEMOLITION,
  {
    title: 'Tiling',
    fields: [
      { key: 'tileWalls', label: 'Walls', type: 'toggle' },
      { key: 'tileFloors', label: 'Floors', type: 'toggle' },
    ],
  },
  {
    title: 'Fixtures',
    fields: [
      { key: 'bathIncluded', label: 'Bath', type: 'toggle' },
      { key: 'vanityIncluded', label: 'Vanity', type: 'toggle' },
      { key: 'vanityTypeSize', label: 'Vanity type / size', type: 'text' },
      { key: 'mirrorType', label: 'Mirrors', type: 'select', options: ['Standard', 'Architectural'] },
      { key: 'bathroomTapware', label: 'Tapware', type: 'select', options: ['Standard', 'Premium'] },
    ],
  },
  {
    title: 'Shower',
    fields: [{ key: 'showerScreenType', label: 'Shower screen', type: 'select', options: ['Framed', 'Semi-frameless', 'Frameless'] }],
  },
  {
    title: 'Waterproofing',
    fields: [{ key: 'waterproofAllowance', label: 'Include waterproofing allowance', type: 'toggle' }],
  },
  PLUMBING_STD,
  ELECTRICAL_STD,
  LIGHTING_STD,
  WINDOWS_STD,
  GYPROCK_STD,
  PAINTING_STD,
  DOORS_STD,
];

const KITCHEN_SCOPE: ScopeSection[] = [
  DEMOLITION,
  {
    title: 'Cabinetry',
    fields: [
      {
        key: 'cabinetLayout',
        label: 'New cabinetry layout',
        type: 'select',
        options: ['U-Shape', 'L-Shape', 'Straight', 'Straight + Island'],
      },
      {
        key: 'cabinetScope',
        label: 'Cabinetry scope',
        type: 'select',
        options: ['Refresh', 'Replace doors', 'Full replacement'],
      },
      { key: 'kitchenCabinet', label: 'Cabinet dimensions', type: 'dimensions', unit: 'm' },
      { key: 'islandIncluded', label: 'Island', type: 'toggle' },
      { key: 'island', label: 'Island dimensions', type: 'dimensions', unit: 'm' },
    ],
  },
  {
    title: 'Benchtops',
    fields: [
      { key: 'benchtopMaterial', label: 'Material', type: 'select', options: ['Stone', 'Laminate', 'Other'] },
      { key: 'benchtopLm', label: 'Benchtop quantity', type: 'quantity', unit: 'lm' },
    ],
  },
  {
    title: 'Splashback',
    fields: [
      { key: 'splashbackMaterial', label: 'Material', type: 'select', options: ['Glass', 'Tile', 'Other'] },
      { key: 'splashbackHeight', label: 'Splashback height', type: 'number', unit: 'm' },
      { key: 'splashbackWidth', label: 'Splashback width', type: 'number', unit: 'm' },
    ],
  },
  {
    title: 'Appliances',
    fields: [
      { key: 'cooktop', label: 'Cooktop', type: 'toggle' },
      { key: 'oven', label: 'Oven', type: 'toggle' },
      { key: 'rangehood', label: 'Rangehood', type: 'toggle' },
      { key: 'dishwasher', label: 'Dishwasher', type: 'toggle' },
      { key: 'otherAppliance', label: 'Other appliance', type: 'text' },
    ],
  },
  {
    title: 'Sink & Tapware',
    fields: [
      { key: 'sinkType', label: 'Sink type', type: 'text' },
      { key: 'tapwareLevel', label: 'Tapware', type: 'select', options: ['Standard', 'Premium'] },
    ],
  },
  LIGHTING_STD,
  PLUMBING_STD,
  ELECTRICAL_STD,
  WINDOWS_STD,
  GYPROCK_STD,
  PAINTING_STD,
  FLOORING_STD,
  DOORS_STD,
];

const LAUNDRY_SCOPE: ScopeSection[] = [
  DEMOLITION,
  {
    title: 'Cabinetry & Storage',
    fields: [
      {
        key: 'laundryCabScope',
        label: 'Scope',
        type: 'select',
        options: ['Refresh', 'Replace doors', 'Full replacement'],
      },
      { key: 'laundryCabinet', label: 'Cabinet dimensions', type: 'dimensions', unit: 'm' },
    ],
  },
  {
    title: 'Benchtops',
    fields: [
      { key: 'laundryBenchtopMaterial', label: 'Material', type: 'select', options: ['Stone', 'Laminate', 'Other'] },
      { key: 'laundryBenchtopLm', label: 'Benchtop quantity', type: 'quantity', unit: 'lm' },
    ],
  },
  PLUMBING_STD,
  ELECTRICAL_STD,
  LIGHTING_STD,
  WINDOWS_STD,
  GYPROCK_STD,
  PAINTING_STD,
  FLOORING_STD,
  DOORS_STD,
];

/** Shared alfresco-style outdoor trades (pricing rules tie to deckingScope, pavingScope, pergola, etc.). */
const OUTDOOR_WORKS_SHELL: ScopeSection[] = [
  {
    title: 'Decking',
    fields: [
      {
        key: 'deckingScope',
        label: 'Decking scope',
        type: 'select',
        options: ['None', 'Timber', 'Composite', 'Other'],
      },
      { key: 'decking', label: 'Deck footprint', type: 'dimensions', unit: 'm' },
    ],
  },
  {
    title: 'Roofing / pergola',
    fields: [{ key: 'pergola', label: 'Pergola / covered structure', type: 'toggle' }],
  },
  {
    title: 'Paving',
    fields: [
      {
        key: 'pavingScope',
        label: 'Paving scope',
        type: 'select',
        options: ['None', 'Concrete', 'Pavers', 'Exposed aggregate', 'Other'],
      },
      { key: 'paving', label: 'Paved area', type: 'dimensions', unit: 'm' },
    ],
  },
  {
    title: 'Landscaping',
    fields: [
      { key: 'landscaping', label: 'Landscaping / planting', type: 'toggle' },
      { key: 'landscapingArea', label: 'Area (approx.)', type: 'number', unit: 'm²', placeholder: 'Uses room floor area if blank' },
    ],
  },
  {
    title: 'Services',
    fields: [{ key: 'outdoorElectrical', label: 'Outdoor electrical', type: 'toggle' }],
  },
  {
    title: 'Fencing / screening',
    fields: [
      { key: 'fencing', label: 'Fence or screening', type: 'toggle' },
      { key: 'fencingLm', label: 'Linear metres', type: 'quantity', unit: 'lm' },
    ],
  },
];

const ALFRESCO_SCOPE: ScopeSection[] = [
  ...OUTDOOR_WORKS_SHELL,
  {
    title: 'Outdoor kitchen',
    fields: [
      { key: 'outdoorKitchen', label: 'Include outdoor kitchen', type: 'toggle' },
      { key: 'outdoorKitchenLm', label: 'Outdoor kitchen linear metres', type: 'quantity', unit: 'lm' },
    ],
  },
  {
    title: 'Lighting',
    fields: [{ key: 'alfLightQty', label: 'Lighting fittings qty', type: 'quantity' }],
  },
  {
    title: 'Fans',
    fields: [{ key: 'alfFanQty', label: 'Fans qty', type: 'quantity' }],
  },
  {
    title: 'Demolition',
    fields: [
      { key: 'alfDemoWalls', label: 'Walls', type: 'toggle' },
      { key: 'alfDemoCeilings', label: 'Ceilings', type: 'toggle' },
      { key: 'alfDemoConcrete', label: 'Concrete', type: 'toggle' },
      { key: 'alfDemoOther', label: 'Other', type: 'text' },
      { key: 'alfDemoLm', label: 'Linear metres', type: 'quantity', unit: 'lm' },
    ],
  },
  PAINTING_STD,
];

const EXTERNAL_SCOPE: ScopeSection[] = [
  ...OUTDOOR_WORKS_SHELL,
  {
    title: 'Landscaping & softscape',
    fields: [
      { key: 'gardenInstall', label: 'Garden install', type: 'toggle' },
      { key: 'grassInstall', label: 'Grass install', type: 'toggle' },
      { key: 'featurePaths', label: 'Feature paths', type: 'toggle' },
      { key: 'featurePathMeasure', label: 'Feature path length / area', type: 'text', placeholder: 'lm or m²' },
    ],
  },
  {
    title: 'External painting',
    fields: [
      { key: 'extPaintWalls', label: 'Walls', type: 'toggle' },
      { key: 'extPaintEaves', label: 'Eaves', type: 'toggle' },
      { key: 'extPaintGutters', label: 'Gutters', type: 'toggle' },
      { key: 'extPaintRoof', label: 'Roof', type: 'toggle' },
    ],
  },
  {
    title: 'Site works',
    fields: [
      { key: 'siteClearing', label: 'Site clearing', type: 'toggle' },
      { key: 'siteRender', label: 'Render', type: 'toggle' },
      { key: 'drivewayType', label: 'Driveway', type: 'select', options: ['Concrete', 'Paving', 'Other'] },
    ],
  },
];

const GARAGE_SCOPE: ScopeSection[] = [
  DEMOLITION,
  {
    title: 'Lighting',
    fields: [{ key: 'garageLightQty', label: 'Quantity of fittings', type: 'quantity' }],
  },
  PAINTING_STD,
  {
    title: 'Roller Door',
    fields: [
      { key: 'rollerDoorType', label: 'Type', type: 'select', options: ['Manual', 'Automatic'] },
      { key: 'rollerDoorHeight', label: 'Opening height', type: 'number', unit: 'm' },
      { key: 'rollerDoorWidth', label: 'Opening width', type: 'number', unit: 'm' },
    ],
  },
];

const BEDROOM_SCOPE: ScopeSection[] = [
  ...LIVING_CORE,
  {
    title: 'Optional',
    fields: [{ key: 'wardrobesLater', label: 'Wardrobes / builtins (later phase)', type: 'toggle' }],
  },
];

export const ROOM_SCOPE_REGISTRY: Record<string, ScopeSection[]> = {
  kitchen: KITCHEN_SCOPE,
  laundry: LAUNDRY_SCOPE,
  bathroom: BATHROOM_CORE,
  ensuite: BATHROOM_CORE,
  living: LIVING_CORE,
  dining: LIVING_CORE,
  bedroom: BEDROOM_SCOPE,
  study: BEDROOM_SCOPE,
  alfresco: ALFRESCO_SCOPE,
  outdoors: EXTERNAL_SCOPE,
  'outdoor kitchen': ALFRESCO_SCOPE,
  garage: GARAGE_SCOPE,
};

export function getRoomScopeSections(roomType: string): ScopeSection[] {
  const key = roomType.toLowerCase();
  return ROOM_SCOPE_REGISTRY[key] || ROOM_SCOPE_REGISTRY.living;
}

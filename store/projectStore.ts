
import { Project, Room, Expense, Category, User } from '../types';
import { applyRoomPricing } from '../utils/calculateRoomEstimate';
import { computeIndicativeEstimate } from '../utils/indicativeEstimate';
import { getStorageUsageKB, safeNormalizeProject, safeSetItem } from '../utils/safePersistence';
import { computeRoomCalculations } from '../utils/roomCalculations';
import { generateId } from '../utils/id';

const STORAGE_KEY = 'zorvo_iq_projects';
const USER_KEY = 'zorvo_iq_user';
const LEGACY_STORAGE_KEY = 'renovate_iq_projects';
const LEGACY_USER_KEY = 'renovate_iq_user';
let lastStorageError: string | null = null;
let memoryProjects: Project[] = [];
export const PROJECT_LIMIT_ERROR = 'Unlock another project to create additional walkthroughs.';
export { getStorageUsageKB };

export const MAX_PHOTOS_PER_ROOM = 5;
export const MAX_PHOTO_SIZE_BYTES = 1.5 * 1024 * 1024;

function estimatedBytesFromBase64DataUrl(s: string): number {
  return s.length * 0.75;
}

/** Drop oversized URL strings and excess room photos before persistence (append order → keep most recent). */
export function pruneRoomPhotos(room: Room): Room {
  const urls = room.photoUrls;
  if (!urls || urls.length === 0) return room;
  const allowed = urls.filter(
    (u): u is string =>
      typeof u === 'string' && estimatedBytesFromBase64DataUrl(u) <= MAX_PHOTO_SIZE_BYTES
  );
  const capped = allowed.slice(-MAX_PHOTOS_PER_ROOM);
  if (capped.length === urls.length && capped.every((u, i) => u === urls[i])) return room;
  return { ...room, photoUrls: capped };
}

function pruneAllProjects(list: Project[]): Project[] {
  return list.map(p => ({ ...p, rooms: p.rooms.map(pruneRoomPhotos) }));
}

export function getPhotoStorageStats(projects: Project[]): {
  totalPhotos: number;
  estimatedKB: number;
} {
  let totalPhotos = 0;
  let estBytes = 0;
  for (const p of projects) {
    for (const r of p.rooms) {
      for (const u of r.photoUrls || []) {
        if (typeof u !== 'string') continue;
        totalPhotos += 1;
        estBytes += estimatedBytesFromBase64DataUrl(u);
      }
    }
  }
  const estimatedKB = Math.round((estBytes / 1024) * 100) / 100;
  return { totalPhotos, estimatedKB };
}

/** 1 free non-demo slot + 1 slot per unlocked non-demo project (demo_* ids excluded). */
export function isAtProjectCreationLimit(projects: Project[]): boolean {
  const nonDemoProjects = projects.filter(p => !p.id.startsWith('demo-'));
  const unlockedSlots = projects.filter(p => p.isUnlocked && !p.id.startsWith('demo-')).length;
  const freeSlot = 1;
  const allowedCount = freeSlot + unlockedSlots;
  return nonDemoProjects.length >= allowedCount;
}

const normalizeProjects = (raw: unknown): Project[] => {
  return (Array.isArray(raw) ? raw : [])
    .map((p: unknown) => safeNormalizeProject(p))
    .filter((p): p is Project => p != null);
};

const writeProjectsToStorage = (projects: Project[]): { ok: boolean; error?: string } => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    if (localStorage.getItem(LEGACY_STORAGE_KEY) != null) {
      try {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        // ignore legacy cleanup failures after successful primary write
      }
    }
    lastStorageError = null;
    return { ok: true };
  } catch (e: unknown) {
    const domQuota =
      typeof DOMException !== 'undefined' &&
      e instanceof DOMException &&
      (e.code === 22 ||
        e.name === 'QuotaExceededError' ||
        e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    const namedQuota = e instanceof Error && e.name === 'QuotaExceededError';
    const isQuota = domQuota || namedQuota;
    const msg = isQuota
      ? 'Storage full. Remove old projects or reduce photos to free space.'
      : 'Failed to save projects.';
    lastStorageError = msg;
    console.error('[projectStore] writeProjectsToStorage failed', e);
    return { ok: false, error: msg };
  }
};

const createProjectRecord = (
  name: string,
  address: string,
  postcode: string,
  totalBudget: number,
  ownerEmail?: string
): Project => ({
  id: generateId(),
  name,
  description: '',
  address,
  postcode,
  totalBudget,
  rooms: [],
  createdAt: new Date().toISOString(),
  isUnlocked: false,
  ...(ownerEmail ? { ownerEmail } : {}),
});

export const saveProjects = (projects: Project[]) => {
  const normalized = normalizeProjects(projects);
  const pruned = pruneAllProjects(normalized);
  const result = writeProjectsToStorage(pruned);
  if (result.ok) {
    memoryProjects = pruned;
  } else {
    console.error(
      'Failed to save projects to storage',
      result.error ?? lastStorageError ?? 'Unknown error'
    );
    try {
      const data = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
      if (data) memoryProjects = normalizeProjects(JSON.parse(data));
    } catch {
      // keep previous memoryProjects
    }
  }
};

export const loadProjects = (options?: { forceRefresh?: boolean }): Project[] => {
  const forceRefresh = options?.forceRefresh === true;
  if (!forceRefresh && memoryProjects.length > 0) return memoryProjects;
  try {
    const primary = localStorage.getItem(STORAGE_KEY);
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    const data = primary ?? legacy;
    if (!data) {
      const seeded = seedCherryAveDemo();
      const toPersist = pruneAllProjects(seeded);
      memoryProjects = seeded;
      const w = writeProjectsToStorage(toPersist);
      if (w.ok) {
        lastStorageError = null;
        memoryProjects = toPersist;
        return toPersist;
      }
      lastStorageError = w.error ?? 'Failed to save projects. Storage may be full.';
      return seeded;
    }
    const parsed = JSON.parse(data);
    const projects = normalizeProjects(parsed);
    // Demo resilience: if storage exists but is empty/invalid, reseed starter project.
    if (projects.length === 0) {
      const seeded = seedCherryAveDemo();
      const toPersist = pruneAllProjects(seeded);
      memoryProjects = seeded;
      const w = writeProjectsToStorage(toPersist);
      if (w.ok) {
        lastStorageError = null;
        memoryProjects = toPersist;
        return toPersist;
      }
      lastStorageError = w.error ?? 'Failed to save projects. Storage may be full.';
      return seeded;
    }
    memoryProjects = projects;
    if (primary == null) {
      const pruned = pruneAllProjects(projects);
      const w = writeProjectsToStorage(pruned);
      if (w.ok) {
        lastStorageError = null;
        memoryProjects = pruned;
        return pruned;
      }
      lastStorageError = w.error ?? 'Failed to save projects. Storage may be full.';
    } else {
      lastStorageError = null;
    }
    return projects;
  } catch (e) {
    console.error("Failed to load projects from storage", e);
    lastStorageError = 'Failed to load projects from storage.';
    if (memoryProjects.length > 0) return memoryProjects;
    const seeded = seedCherryAveDemo();
    const toPersist = pruneAllProjects(seeded);
    memoryProjects = seeded;
    const w = writeProjectsToStorage(toPersist);
    if (w.ok) {
      lastStorageError = null;
      memoryProjects = toPersist;
      return toPersist;
    }
    lastStorageError = w.error ?? 'Failed to save projects. Storage may be full.';
    return seeded;
  }
};

function seedCherryAveDemo(): Project[] {
  const DEMO_PROJECT_ID = 'demo-cherry-ave-project';
  const DEMO_KITCHEN_ID = 'demo-cherry-kitchen-room';
  const DEMO_BATHROOM_ID = 'demo-cherry-bathroom-room';

  const project = createProjectRecord('Cherry Ave Renovation', '15 Cherry Ave, Melbourne', '3000', 120000);
  project.id = DEMO_PROJECT_ID;
  project.isUnlocked = true;

  const kitchenBase = createRoom('Kitchen', 'KITCHEN', 32000);
  kitchenBase.id = DEMO_KITCHEN_ID;
  const kitchenDraft: Room = {
    ...kitchenBase,
    dimensions: { length: 3, width: 3, height: 2.4 },
    calculations: computeRoomCalculations({ length: 3, width: 3, height: 2.4 }),
    scopeInputs: {
      finishQuality: 'high',
      cabinetScope: 'High-spec replacement',
      benchtopMaterial: 'Stone',
      cooktop: 'Induction premium',
      oven: 'Electric wall oven premium',
      dishwasher: true,
      lightingLevel: 'Architectural',
      plumbingScope: 'New plumbing',
    },
    scope: {
      finishQuality: 'high',
      cabinetScope: 'High-spec replacement',
      benchtopMaterial: 'Stone',
      cooktop: 'Induction premium',
      oven: 'Electric wall oven premium',
      dishwasher: true,
      lightingLevel: 'Architectural',
      plumbingScope: 'New plumbing',
    },
    intendedScope: ['Replace kitchen cabinetry', 'Install stone benchtop', 'Upgrade appliances'],
    notes: 'Demo room with estimate, quotes, and one payment.',
    quoteItems: [
      {
        id: generateId(),
        roomId: DEMO_KITCHEN_ID,
        category: 'Kitchen',
        description: 'Kitchen scope quote option A',
        supplierOrTrade: 'Northside Cabinets',
        quoteAmount: 25000,
        status: 'received',
        quoteDate: '2026-04-02',
        notes: '',
      },
      {
        id: generateId(),
        roomId: DEMO_KITCHEN_ID,
        category: 'Kitchen',
        description: 'Kitchen scope quote option B',
        supplierOrTrade: 'Urban Build Co',
        quoteAmount: 28000,
        status: 'accepted',
        quoteDate: '2026-04-05',
        notes: 'Accepted baseline quote.',
      },
    ],
    actualCostItems: [
      {
        id: generateId(),
        roomId: DEMO_KITCHEN_ID,
        category: 'Kitchen',
        description: 'Kitchen progress payment',
        amountPaid: 18000,
        paidDate: '2026-04-08',
        paymentStatus: 'paid',
        notes: '',
      },
    ],
  };
  const kitchenScoped = (() => {
    try {
      return applyRoomPricing(kitchenDraft);
    } catch {
      return { ...kitchenDraft, estimate: computeIndicativeEstimate(kitchenDraft), pricingV1: { lineItems: [], tradeBreakdown: [], source: 'placeholder' } };
    }
  })();

  const bathroomBase = createRoom('Bathroom', 'BATHROOM', 18000);
  bathroomBase.id = DEMO_BATHROOM_ID;
  const bathroomDraft: Room = {
    ...bathroomBase,
    dimensions: { length: 3, width: 3, height: 2.4 },
    calculations: computeRoomCalculations({ length: 3, width: 3, height: 2.4 }),
    scopeInputs: {
      finishQuality: 'mid',
      plumbingScope: 'Mid re-plumb',
      bathroomTapware: 'Mid-range',
      waterproofAllowance: true,
      tilingArea: 'Floor + shower',
    },
    scope: {
      finishQuality: 'mid',
      plumbingScope: 'Mid re-plumb',
      bathroomTapware: 'Mid-range',
      waterproofAllowance: true,
      tilingArea: 'Floor + shower',
    },
    intendedScope: ['Waterproof and retile bathroom'],
    notes: 'Demo bathroom for quote vs paid comparison.',
    quoteItems: [
      {
        id: generateId(),
        roomId: DEMO_BATHROOM_ID,
        category: 'Bathroom',
        description: 'Bathroom package quote',
        supplierOrTrade: 'Eastside Bathrooms',
        quoteAmount: 9000,
        status: 'accepted',
        quoteDate: '2026-04-06',
        notes: '',
      },
    ],
    actualCostItems: [
      {
        id: generateId(),
        roomId: DEMO_BATHROOM_ID,
        category: 'Bathroom',
        description: 'Bathroom progress payment',
        amountPaid: 6500,
        paidDate: '2026-04-10',
        paymentStatus: 'paid',
        notes: '',
      },
    ],
  };
  const bathroomScoped = (() => {
    try {
      return applyRoomPricing(bathroomDraft);
    } catch {
      return { ...bathroomDraft, estimate: computeIndicativeEstimate(bathroomDraft), pricingV1: { lineItems: [], tradeBreakdown: [], source: 'placeholder' } };
    }
  })();

  project.rooms = [kitchenScoped, bathroomScoped];
  return [project];
}

export const getStorageStatus = (): { ok: boolean; message: string | null } => ({
  ok: !lastStorageError,
  message: lastStorageError,
});

/** Resolve project id without console noise (for UI retry flows). */
export const findProjectById = (projectId: string): Project | null => {
  const id = String(projectId);
  const list = loadProjects({ forceRefresh: true });
  return list.find(item => item.id === id) || null;
};

export const getProjectById = (projectId: string): Project | null => {
  const id = String(projectId);
  const list = loadProjects({ forceRefresh: true });
  const project = list.find(item => item.id === id) || null;
  if (!project) {
    console.warn('[projectStore] Project lookup failed', {
      requestedId: id,
      availableProjectIds: list.map(item => item.id),
    });
  }
  return project;
};

export const getRoomById = (projectId: string, roomId: string): { project: Project; room: Room } | null => {
  const project = getProjectById(projectId);
  if (!project) return null;
  const room = project.rooms.find(item => item.id === roomId);
  if (!room) return null;
  return { project, room };
};

export const updateProjectById = (
  projectId: string,
  updater: (project: Project) => Project
): Project | null => {
  const projects = loadProjects();
  let updatedProject: Project | null = null;
  const updatedProjects = projects.map(project => {
    if (project.id !== projectId) return project;
    updatedProject = updater(project);
    return updatedProject;
  });

  if (!updatedProject) return null;
  saveProjects(updatedProjects);
  return updatedProject;
};

export const updateRoomById = (
  projectId: string,
  roomId: string,
  updater: (room: Room) => Room
): { project: Project; room: Room } | null => {
  let nextRoom: Room | null = null;
  const updatedProject = updateProjectById(projectId, project => {
    const updatedRooms = project.rooms.map(room => {
      if (room.id !== roomId) return room;
      nextRoom = updater(room);
      return nextRoom;
    });
    return { ...project, rooms: updatedRooms };
  });

  if (!updatedProject || !nextRoom) return null;
  return { project: updatedProject, room: nextRoom };
};

export const saveUser = (user: User) => {
  const result = safeSetItem(USER_KEY, JSON.stringify(user));
  if (result.ok) {
    lastStorageError = null;
  } else {
    lastStorageError = result.error ?? 'Failed to save user details.';
    console.error('Failed to save user to storage', lastStorageError);
  }
};

export const loadUser = (): User | null => {
  try {
    const data = localStorage.getItem(USER_KEY) || localStorage.getItem(LEGACY_USER_KEY);
    if (!data) return null;
    const user = JSON.parse(data);
    if (!localStorage.getItem(USER_KEY) && user) {
      safeSetItem(USER_KEY, JSON.stringify(user));
    }
    return user;
  } catch (e) {
    console.error("Failed to load user from storage", e);
    return null;
  }
};

export const logout = () => {
  try {
    localStorage.removeItem(USER_KEY);
    lastStorageError = null;
  } catch (e) {
    console.error("Failed to logout", e);
    lastStorageError = 'Failed to clear user session.';
  }
};

export const createProject = (name: string, address: string, postcode: string, totalBudget: number): Project => {
  const sessionEmail = loadUser()?.email?.trim();
  const created = createProjectRecord(
    name,
    address,
    postcode,
    totalBudget,
    sessionEmail && sessionEmail.length > 0 ? sessionEmail : undefined
  );
  const projects = loadProjects({ forceRefresh: true });
  if (isAtProjectCreationLimit(projects)) {
    throw new Error(PROJECT_LIMIT_ERROR);
  }
  const updated = [...projects, created];
  saveProjects(updated);
  if (lastStorageError) {
    throw new Error(lastStorageError);
  }
  return created;
};

export const createRoom = (name: string, type: string, budget: number): Room => {
  const dimensions = { length: 3.0, width: 3.0, height: 2.4 };
  const calculations = computeRoomCalculations(dimensions);
  const base: Room = {
    id: generateId(),
    name,
    type,
    budget,
    dimensions,
    expenses: [],
    quoteItems: [],
    actualCostItems: [],
    photoUrls: [],
    intendedScope: [],
    notes: '',
    scopeInputs: {},
    scope: {},
    calculations,
  };
  try {
    return applyRoomPricing(base);
  } catch {
    return { ...base, estimate: computeIndicativeEstimate(base), pricingV1: { lineItems: [], tradeBreakdown: [], source: 'placeholder' } };
  }
};

export const unlockProject = (projectId: string) => {
  const projects = loadProjects();
  const updated = projects.map(project =>
    project.id === projectId ? { ...project, isUnlocked: true } : project
  );
  saveProjects(updated);
  return updated;
};

// Backend-ready async API wrappers (kept local to avoid hard dependency on api folder in constrained environments).
const draftKeyPrefix = 'zorvo_iq_walkthrough_draft_';
const roomEditDraftKeyPrefix = 'zorvo_iq_room_edit_draft_';

function roomEditDraftStorageKey(projectId: string, roomId: string): string {
  return `${roomEditDraftKeyPrefix}${projectId}_${roomId}`;
}

export const projectsApi = {
  list: async (): Promise<Project[]> => loadProjects(),
  replaceAll: async (projects: Project[]): Promise<void> => saveProjects(projects),
  getById: async (projectId: string): Promise<Project | null> => getProjectById(projectId),
  updateById: async (
    projectId: string,
    updater: (project: Project) => Project
  ): Promise<Project | null> => updateProjectById(projectId, updater),
  updateRoomById: async (
    projectId: string,
    roomId: string,
    updater: (room: Room) => Room
  ): Promise<{ project: Project; room: Room } | null> => updateRoomById(projectId, roomId, updater),
  unlock: async (projectId: string): Promise<Project[]> => unlockProject(projectId),
};

export const authApi = {
  getCurrentUser: async (): Promise<User | null> => loadUser(),
  saveUser: async (user: User): Promise<void> => saveUser(user),
  logout: async (): Promise<void> => logout(),
};

async function persistDraftJson(storageKey: string, draft: unknown): Promise<void> {
  const r = safeSetItem(storageKey, JSON.stringify(draft));
  if (!r.ok) {
    lastStorageError = r.error ?? 'Failed to save draft.';
    console.error('Failed to save draft', lastStorageError);
  }
}

export const draftsApi = {
  getWalkthroughDraft: async (projectIdOrStorageKey: string): Promise<any | null> => {
    try {
      const storageKey = projectIdOrStorageKey.startsWith(roomEditDraftKeyPrefix)
        ? projectIdOrStorageKey
        : `${draftKeyPrefix}${projectIdOrStorageKey}`;
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  saveWalkthroughDraft: async (projectIdOrStorageKey: string, draft: any): Promise<void> => {
    const storageKey = projectIdOrStorageKey.startsWith(roomEditDraftKeyPrefix)
      ? projectIdOrStorageKey
      : `${draftKeyPrefix}${projectIdOrStorageKey}`;
    await persistDraftJson(storageKey, draft);
  },
  clearWalkthroughDraft: async (projectIdOrStorageKey: string): Promise<void> => {
    const storageKey = projectIdOrStorageKey.startsWith(roomEditDraftKeyPrefix)
      ? projectIdOrStorageKey
      : `${draftKeyPrefix}${projectIdOrStorageKey}`;
    localStorage.removeItem(storageKey);
  },
  getRoomEditDraft: async (projectId: string, roomId: string): Promise<any | null> => {
    return draftsApi.getWalkthroughDraft(roomEditDraftStorageKey(projectId, roomId));
  },
  saveRoomEditDraft: async (projectId: string, roomId: string, draft: any): Promise<void> => {
    await draftsApi.saveWalkthroughDraft(roomEditDraftStorageKey(projectId, roomId), draft);
  },
  clearRoomEditDraft: async (projectId: string, roomId: string): Promise<void> => {
    await draftsApi.clearWalkthroughDraft(roomEditDraftStorageKey(projectId, roomId));
  },
};

/** Debounced autosave → `draftsApi.saveRoomEditDraft` (same persistence layer as saveWalkthroughDraft). */
export function createDebouncedDraftSaver(projectId: string, delayMs = 1500): (draft: any) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return (draft: unknown) => {
    if (!draft || typeof draft !== 'object') return;
    const roomId = (draft as { roomId?: string }).roomId;
    if (typeof roomId !== 'string' || !roomId) return;
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      void draftsApi.saveRoomEditDraft(projectId, roomId, draft);
    }, delayMs);
  };
}

// Baselines for rapid scoping (Australian Market Mid-Range)
export const ROOM_BASELINES: Record<string, { budget: number, items: Partial<Expense>[] }> = {
  'Kitchen': {
    budget: 25000,
    items: [
      { description: 'Cabinetry & Hardware', amount: 12000, category: 'Materials', status: 'Estimate' },
      { description: 'Plumbing (Fit off)', amount: 1500, category: 'Labour', status: 'Estimate', isComplianceRequired: true },
      { description: 'Electrical (Rework)', amount: 1800, category: 'Labour', status: 'Estimate', isComplianceRequired: true },
      { description: 'Structural Risk Allowance (15%)', amount: 3750, category: 'Other', status: 'Estimate' }
    ]
  },
  'Bathroom': {
    budget: 15000,
    items: [
      { description: 'Tiling & Waterproofing', amount: 4500, category: 'Labour', status: 'Estimate', isComplianceRequired: true },
      { description: 'Fixtures & Tapware', amount: 3000, category: 'Materials', status: 'Estimate' },
      { description: 'Plumbing (Rough-in)', amount: 2200, category: 'Labour', status: 'Estimate', isComplianceRequired: true },
      { description: 'Wet Area Risk Allowance (10%)', amount: 1500, category: 'Other', status: 'Estimate' }
    ]
  }
};

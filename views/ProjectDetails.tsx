
import React, { useState, useEffect, useRef } from 'react';
import { Camera, FileText, Hammer, House, Images, Receipt } from 'lucide-react';
import Layout from '../components/Layout';
import RoomScopeForm from '../components/RoomScopeForm';
import PaywallModal from '../components/PaywallModal';
import { Project, Room } from '../types';
import { draftsApi, findProjectById, loadProjects, unlockProject, updateProjectById } from '../store/projectStore';
import { ESTIMATE_DISCLAIMER, ICONS, INSPECTION_SCOPE_SECTIONS, PRICING_SOURCE_AREA_LABEL, PRICING_SOURCE_V1_LABEL } from '../constants';
import { generateId } from '../utils/id';
import { calculateRoomEstimate } from '../utils/calculateRoomEstimate';
import { computeIndicativeEstimate } from '../utils/indicativeEstimate';
import { sanitizeDimensions } from '../utils/safePersistence';
import { computeRoomCalculations } from '../utils/roomCalculations';
import {
  getRoomCompletionPercent,
  getScopeCompletionForRoom,
  isRoomMissingDimensions,
  isRoomWalkthroughComplete,
  roomNeedsScopeAttention,
} from '../utils/roomStatus';
import { numberInputQuickEntryProps } from '../components/forms/quickNumericInput';
import { filesToBase64DataUrls } from '../utils/imageFiles';
import {
  aggregateActualsByCategory,
  deriveDominantBudgetStatus,
  hasRoomQuotesInPlay,
  projectBudgetSourceSummary,
  projectActualManualTotal,
  projectBudgetStatus,
  projectEstimateMidTotal,
  projectQuotedCompareTotal,
  roomActualPaidTotal,
  roomEstimateMid,
  roomQuotedCompareTotal,
} from '../utils/budgetAggregates';

interface Props { id: string; }

const ROOM_TYPES = [
  { type: 'KITCHEN', icon: ICONS.Room.Kitchen },
  { type: 'LAUNDRY', icon: ICONS.Room.Laundry },
  { type: 'BATHROOM', icon: ICONS.Room.Bathroom },
  { type: 'ENSUITE', icon: ICONS.Room.Ensuite },
  { type: 'LIVING', icon: ICONS.Room.Living },
  { type: 'DINING', icon: ICONS.Room.Dining },
  { type: 'BEDROOM', icon: ICONS.Room.Bedroom },
  { type: 'STUDY', icon: ICONS.Room.Study },
  { type: 'ALFRESCO', icon: ICONS.Room.Alfresco },
  { type: 'OUTDOORS', icon: ICONS.Room.Outdoors },
  { type: 'GARAGE', icon: ICONS.Room.Garage },
];

const QUICK_DIMENSION_PRESETS = [
  { label: 'Small', values: { length: 2.5, width: 2.5, height: 2.4 } },
  { label: 'Standard', values: { length: 3.0, width: 3.0, height: 2.4 } },
  { label: 'Large', values: { length: 4.0, width: 3.5, height: 2.7 } },
];

const QUICK_PROPERTY_PRESETS: Array<{ label: string; counts: Record<string, number> }> = [
  { label: '2 Bed / 1 Bath', counts: { BEDROOM: 2, BATHROOM: 1, KITCHEN: 1, LIVING: 1, DINING: 1 } },
  { label: '3 Bed / 2 Bath', counts: { BEDROOM: 3, BATHROOM: 1, ENSUITE: 1, KITCHEN: 1, LIVING: 1, DINING: 1 } },
  { label: 'Family + Outdoor', counts: { BEDROOM: 4, BATHROOM: 2, KITCHEN: 1, LIVING: 1, DINING: 1, OUTDOORS: 1, ALFRESCO: 1 } },
];

const QUICK_TEMPLATE_PRESETS = {
  basicRefresh: {
    lightingLevel: 'Basic',
    paintWalls: true,
    paintCeilings: true,
    electricalScope: 'Basic rewire',
  },
  standardUpdate: {
    lightingLevel: 'Architectural',
    electricalScope: 'New electrical',
    demoWalls: true,
    paintWalls: true,
  },
  fullRenovation: {
    demoWalls: true,
    demoCeilings: true,
    removeWalls: true,
    installWalls: true,
    electricalScope: 'New electrical',
    lightingLevel: 'Architectural',
    paintWalls: true,
    paintCeilings: true,
  },
} as const;

const ROLE_QUICK_TEMPLATES = {
  investor: {
    buttonLabel: "Investor Pack",
    defaults: {
      lightingLevel: "Basic",
      electricalScope: "Basic rewire",
      demoWalls: false,
      demoCeilings: false,
      paintWalls: true,
      paintCeilings: true,
    },
  },
  builder: {
    buttonLabel: "Builder Baseline",
    defaults: {
      lightingLevel: "Architectural",
      electricalScope: "New electrical",
      demoWalls: true,
      installWalls: true,
      paintWalls: true,
      paintCeilings: true,
      gyprockWalls: true,
    },
  },
  agent: {
    buttonLabel: "Agent Market-Ready",
    defaults: {
      lightingLevel: "Architectural",
      electricalScope: "Basic rewire",
      demoWalls: false,
      demoCeilings: false,
      paintWalls: true,
      paintCeilings: true,
      gyprockWalls: true,
      gyprockCeilings: true,
    },
  },
} as const;

interface WalkthroughDraft {
  walkthroughStep: 'select' | 'detail';
  selectedRoomCounts?: Record<string, number>;
  selectedRoomTypes?: string[];
  detailQueue: Room[];
  currentDetailIndex: number;
}

interface ChecklistItem {
  id: string;
  severity: 'High' | 'Medium' | 'Low';
  ok: boolean;
  text: string;
  targetIndex?: number;
}

interface DealScoreSummary {
  score: number;
  riskLabel: 'Low risk' | 'Medium risk' | 'High risk';
}

interface MissingScopeAlert {
  roomId: string;
  roomName: string;
  reason: string;
}

interface FindSourceContext {
  source: 'find';
  originalAddress: string;
  suburb: string;
  yearsHeld: number;
  opportunityScore: number;
}

function parseFindSourceContext(description: string): FindSourceContext | null {
  if (!description || !description.includes('Source context:')) return null;
  const markerIndex = description.indexOf('Source context:');
  const tail = description.slice(markerIndex + 'Source context:'.length).trim();
  const startBrace = tail.indexOf('{');
  const endBrace = tail.lastIndexOf('}');
  if (startBrace < 0 || endBrace <= startBrace) return null;
  const candidate = tail.slice(startBrace, endBrace + 1);

  try {
    const parsed = JSON.parse(candidate) as Partial<FindSourceContext>;
    if (
      parsed?.source !== 'find' ||
      typeof parsed.originalAddress !== 'string' ||
      typeof parsed.suburb !== 'string' ||
      typeof parsed.yearsHeld !== 'number' ||
      typeof parsed.opportunityScore !== 'number'
    ) {
      return null;
    }
    return {
      source: 'find',
      originalAddress: parsed.originalAddress,
      suburb: parsed.suburb,
      yearsHeld: parsed.yearsHeld,
      opportunityScore: parsed.opportunityScore,
    };
  } catch {
    return null;
  }
}

function scoreToOpportunityLevel(score: number): 'High' | 'Medium' | 'Low' {
  if (score >= 5) return 'High';
  if (score >= 3) return 'Medium';
  return 'Low';
}

function computeDealScoreSummary(input: {
  totalEstMid: number;
  totalQuotedCompare: number;
  totalActualManual: number;
  scopeCoverageRatio: number;
  completionRatio: number;
}): DealScoreSummary {
  let score = 100;
  const estBaseline = Math.max(input.totalEstMid, 1);
  const quoteCoverage = Math.max(0, Math.min(1, input.totalQuotedCompare / estBaseline));
  const overspendRatio = Math.max(0, (input.totalActualManual - input.totalEstMid) / estBaseline);

  score -= Math.min(35, overspendRatio * 100);
  score -= (1 - quoteCoverage) * 20;
  score -= (1 - Math.max(0, Math.min(1, input.scopeCoverageRatio))) * 25;
  score -= (1 - Math.max(0, Math.min(1, input.completionRatio))) * 20;

  const rounded = Math.max(0, Math.min(100, Math.round(score)));
  const riskLabel: DealScoreSummary['riskLabel'] =
    rounded >= 75 ? 'Low risk' : rounded >= 50 ? 'Medium risk' : 'High risk';

  return { score: rounded, riskLabel };
}

function deriveRoomFields(room: Room): Pick<Room, 'calculations' | 'estimate' | 'pricingV1'> {
  const calculations = computeRoomCalculations(room.dimensions);
  try {
    const { band, pricing } = calculateRoomEstimate({ ...room, calculations });
    return {
      calculations,
      estimate: band,
      pricingV1: pricing,
    };
  } catch {
    const fallback = computeIndicativeEstimate({ ...room, calculations });
    return {
      calculations,
      estimate: fallback,
      pricingV1: { lineItems: [], tradeBreakdown: [], source: 'placeholder' },
    };
  }
}

function roomTypeIcon(type: string) {
  const t = (type || '').toLowerCase();
  if (t.includes('kitchen')) return <Hammer size={18} className="text-slate-300" />;
  if (t.includes('bath') || t.includes('ensuite')) return <Receipt size={18} className="text-slate-300" />;
  if (t.includes('bed') || t.includes('study')) return <FileText size={18} className="text-slate-300" />;
  return <House size={18} className="text-slate-300" />;
}

function RoomPricingSourceBadges({ room, align }: { room: Room; align?: 'start' | 'end' }) {
  const justify = align === 'end' ? 'justify-end' : 'justify-start';
  return (
    <div className={`flex flex-wrap items-center gap-1 ${justify}`}>
      {room.pricingV1?.source === 'placeholder' && (
        <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[6px] sm:text-[7px] font-black uppercase tracking-widest text-amber-200 leading-snug">
          AREA ESTIMATE — add scope for accuracy
        </span>
      )}
      {room.pricingV1?.source === 'rules' && (
        <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-widest text-emerald-200">
          PRICING V1
        </span>
      )}
    </div>
  );
}

const isValidDraft = (draft: WalkthroughDraft): boolean => {
  const hasLegacyTypes = Array.isArray(draft?.selectedRoomTypes);
  const hasRoomCounts = Boolean(
    draft?.selectedRoomCounts &&
    typeof draft.selectedRoomCounts === 'object' &&
    !Array.isArray(draft.selectedRoomCounts)
  );
  if (!draft || (!hasLegacyTypes && !hasRoomCounts) || !Array.isArray(draft.detailQueue)) {
    return false;
  }
  if (draft.walkthroughStep === 'detail' && draft.detailQueue.length === 0) {
    return false;
  }
  if (draft.currentDetailIndex < 0 || draft.currentDetailIndex >= Math.max(draft.detailQueue.length, 1)) {
    return false;
  }
  return true;
};

const toRoomCounts = (draft: WalkthroughDraft): Record<string, number> => {
  if (draft.selectedRoomCounts && typeof draft.selectedRoomCounts === 'object') {
    return Object.entries(draft.selectedRoomCounts).reduce<Record<string, number>>((acc, [type, count]) => {
      const safeCount = Math.max(0, Number(count) || 0);
      if (safeCount > 0) acc[type] = safeCount;
      return acc;
    }, {});
  }
  return (draft.selectedRoomTypes || []).reduce<Record<string, number>>((acc, type) => {
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
};

const ProjectDetails: React.FC<Props> = ({ id }) => {
  const [project, setProject] = useState<Project | null>(null);
  const [isResolvingProject, setIsResolvingProject] = useState(true);
  const [isWalkthroughActive, setIsWalkthroughActive] = useState(false);
  const [walkthroughStep, setWalkthroughStep] = useState<'select' | 'detail'>('select');
  const [selectedRoomCounts, setSelectedRoomCounts] = useState<Record<string, number>>({});
  const [roomTypeOrder, setRoomTypeOrder] = useState<string[]>(ROOM_TYPES.map(room => room.type));
  const [detailQueue, setDetailQueue] = useState<Room[]>([]);
  const [currentDetailIndex, setCurrentDetailIndex] = useState(0);
  const [showAdvancedScope, setShowAdvancedScope] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [quickMessage, setQuickMessage] = useState<string | null>(null);
  const [autoNextEnabled, setAutoNextEnabled] = useState(true);
  const [showPreCompleteCheck, setShowPreCompleteCheck] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  const contextCaptureCameraRef = useRef<HTMLInputElement>(null);
  const contextCaptureGalleryRef = useRef<HTMLInputElement>(null);
  const currentDetailIndexRef = useRef(0);
  const autoNextTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    currentDetailIndexRef.current = currentDetailIndex;
  }, [currentDetailIndex]);

  useEffect(() => {
    let cancelled = false;
    const projectId = String(id);

    setIsResolvingProject(true);
    setProject(null);

    const tryResolve = (): Project | null => findProjectById(projectId);

    (async () => {
      await new Promise<void>(r => {
        requestAnimationFrame(() => requestAnimationFrame(() => r()));
      });
      if (cancelled) return;

      const retryDelaysMs = [0, 20, 40, 80, 160, 320];
      for (let i = 0; i < retryDelaysMs.length; i += 1) {
        if (i > 0) {
          await new Promise(r => setTimeout(r, retryDelaysMs[i]! - retryDelaysMs[i - 1]!));
        }
        if (cancelled) return;
        const found = tryResolve();
        if (found) {
          if (!cancelled) {
            setProject(found);
            setIsResolvingProject(false);
          }
          return;
        }
      }

      if (cancelled) return;
      const list = loadProjects({ forceRefresh: true });
      const final = list.find(p => p.id === projectId) || null;
      if (!final) {
        console.warn('[ProjectDetails] Project lookup failed after refresh', {
          requestedId: projectId,
          availableProjectIds: list.map(p => p.id),
        });
      }
      if (!cancelled) {
        setProject(final);
        setIsResolvingProject(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    setQuickMessage(null);
  }, [currentDetailIndex]);

  useEffect(() => {
    if (!isWalkthroughActive) return;
    (async () => {
      try {
        const draft = (await draftsApi.getWalkthroughDraft(id)) as WalkthroughDraft | null;
        if (!draft) return;
        if (!isValidDraft(draft)) {
          await draftsApi.clearWalkthroughDraft(id);
          return;
        }
        const shouldResume = window.confirm('Resume previous walk-through draft?');
        if (!shouldResume) return;
        setWalkthroughStep(draft.walkthroughStep || 'select');
        setSelectedRoomCounts(toRoomCounts(draft));
        setRoomTypeOrder(ROOM_TYPES.map(room => room.type));
        setDetailQueue(draft.detailQueue || []);
        setCurrentDetailIndex(draft.currentDetailIndex || 0);
        setIsDirty(true);
      } catch {
        // Ignore invalid draft data.
      }
    })();
  }, [isWalkthroughActive, id]);

  useEffect(() => {
    if (!isWalkthroughActive) return;
    const draft: WalkthroughDraft = {
      walkthroughStep,
      selectedRoomCounts,
      detailQueue,
      currentDetailIndex,
    };
    draftsApi.saveWalkthroughDraft(id, draft);
  }, [isWalkthroughActive, walkthroughStep, selectedRoomCounts, detailQueue, currentDetailIndex, id]);

  useEffect(() => {
    return () => {
      if (autoNextTimeoutRef.current) {
        window.clearTimeout(autoNextTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isWalkthroughActive || !isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isWalkthroughActive, isDirty]);

  const saveProject = (updated: Project) => {
    setProject(updated);
    updateProjectById(id, () => updated);
  };

  const updateRoomCount = (type: string, delta: number) => {
    setIsDirty(true);
    setSelectedRoomCounts(prev => {
      const next = { ...prev };
      const current = next[type] || 0;
      const updated = Math.max(0, current + delta);
      if (updated === 0) {
        delete next[type];
      } else {
        next[type] = updated;
      }
      return next;
    });
  };

  const startDetailing = () => {
    const queue = roomTypeOrder.flatMap((type) => {
      const count = selectedRoomCounts[type] || 0;
      return Array.from({ length: count }, (_, idx) => {
        const normalizedType = type.charAt(0) + type.slice(1).toLowerCase();
        const dimensions = { length: 3, width: 3, height: 2.4 };
        const base: Room = {
          id: generateId(),
          name: `${normalizedType} ${idx + 1}`,
          type: normalizedType,
          dimensions,
          budget: 0,
          expenses: [],
          photoUrls: [],
          intendedScope: [],
          notes: '',
          scopeInputs: {},
          scope: {},
        };
        return { ...base, ...deriveRoomFields(base) };
      });
    });
    setDetailQueue(queue);
    setWalkthroughStep('detail');
    setCurrentDetailIndex(0);
    setIsDirty(true);
  };

  const applyPropertyPreset = (counts: Record<string, number>) => {
    setIsDirty(true);
    setSelectedRoomCounts(counts);
    setRoomTypeOrder(ROOM_TYPES.map(room => room.type));
  };

  const moveRoomType = (type: string, direction: -1 | 1) => {
    setRoomTypeOrder(prev => {
      const currentIndex = prev.indexOf(type);
      if (currentIndex < 0) return prev;
      const nextIndex = currentIndex + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
      return next;
    });
  };

  const updateCurrentDetail = (updates: Partial<Room>) => {
    setIsDirty(true);
    setDetailQueue(prev => prev.map((r, i) => i === currentDetailIndex ? { ...r, ...updates } : r));
  };

  const patchScopeValues = (patch: Record<string, string | number | boolean>, options?: { allowAutoNext?: boolean }) => {
    const current = detailQueue[currentDetailIndex];
    const nextScope = { ...(current.scopeInputs || {}), ...(current.scope || {}), ...patch };
    const mergedRoom = { ...current, scopeInputs: nextScope, scope: nextScope };
    updateCurrentDetail({
      scopeInputs: nextScope,
      scope: nextScope,
      ...deriveRoomFields(mergedRoom),
    });
    const shouldAutoNext = Boolean(options?.allowAutoNext);
    if (autoNextTimeoutRef.current) {
      window.clearTimeout(autoNextTimeoutRef.current);
    }
    if (autoNextEnabled && shouldAutoNext && currentDetailIndex < detailQueue.length - 1) {
      autoNextTimeoutRef.current = window.setTimeout(() => {
        setCurrentDetailIndex(prev => (prev < detailQueue.length - 1 ? prev + 1 : prev));
      }, 250);
    }
  };

  const updateScopeInput = (
    key: string,
    value: string | number | boolean,
    options?: { allowAutoNext?: boolean }
  ) => {
    patchScopeValues({ [key]: value }, options);
  };

  const handleContextCaptureFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    try {
      const encoded = await filesToBase64DataUrls(files);
      const idx = currentDetailIndexRef.current;
      setIsDirty(true);
      setDetailQueue(prev =>
        prev.map((r, i) =>
          i === idx ? { ...r, photoUrls: [...(r.photoUrls || []), ...encoded] } : r
        )
      );
    } catch (err) {
      setQuickMessage(err instanceof Error ? err.message : 'Could not process photos.');
    }
  };

  const nextArea = () => {
    if (currentDetailIndex < detailQueue.length - 1) {
      const fromRoom = detailQueue[currentDetailIndex];
      const nextIndex = currentDetailIndex + 1;
      const nextRoom = detailQueue[nextIndex];
      if (fromRoom && nextRoom && fromRoom.type === nextRoom.type) {
        const mergedScope = { ...(fromRoom.scopeInputs || {}), ...(fromRoom.scope || {}) };
        const updatedQueue = detailQueue.map((room, idx) =>
          idx === nextIndex
            ? {
                ...room,
                dimensions: { ...fromRoom.dimensions },
                scopeInputs: mergedScope,
                scope: mergedScope,
                intendedScope: [...(fromRoom.intendedScope || [])],
                notes: fromRoom.notes || '',
                ...deriveRoomFields({ ...room, dimensions: { ...fromRoom.dimensions }, scopeInputs: mergedScope, scope: mergedScope }),
              }
            : room
        );
        setDetailQueue(updatedQueue);
        setQuickMessage('Copied defaults from previous matching room type');
      }
      setCurrentDetailIndex(nextIndex);
    } else {
      setShowPreCompleteCheck(true);
    }
  };

  const completeWalkthrough = () => {
    if (project) {
      saveProject({ ...project, rooms: [...project.rooms, ...detailQueue] });
    }
    setIsDirty(false);
    setIsWalkthroughActive(false);
    setWalkthroughStep('select');
    setSelectedRoomCounts({});
    setDetailQueue([]);
    setCurrentDetailIndex(0);
    setShowPreCompleteCheck(false);
    draftsApi.clearWalkthroughDraft(id);
  };

  const previousArea = () => {
    if (currentDetailIndex > 0) {
      setCurrentDetailIndex(prev => prev - 1);
    }
  };

  const normalizeMetres = (raw: number): number => {
    const n = Number.isFinite(raw) ? raw : 0;
    if (n <= 0) return 0;
    if (n > 50) return Math.min(50, n / 1000);
    return Math.min(50, n);
  };

  const applyQuickDimensions = (values: { length: number; width: number; height: number }) => {
    const current = detailQueue[currentDetailIndex];
    const normalized = {
      length: normalizeMetres(values.length),
      width: normalizeMetres(values.width),
      height: normalizeMetres(values.height),
    };
    const merged = { ...current, dimensions: normalized };
    updateCurrentDetail({ dimensions: normalized, ...deriveRoomFields(merged) });
  };

  const applyQuickTemplate = (templateKey: keyof typeof QUICK_TEMPLATE_PRESETS) => {
    const current = detailQueue[currentDetailIndex];
    const nextScope = {
      ...(current.scopeInputs || {}),
      ...(current.scope || {}),
      ...QUICK_TEMPLATE_PRESETS[templateKey],
    };
    const mergedRoom = { ...current, scopeInputs: nextScope, scope: nextScope };
    updateCurrentDetail({
      scopeInputs: nextScope,
      scope: nextScope,
      ...deriveRoomFields(mergedRoom),
    });
    setQuickMessage(`Applied ${templateKey === 'basicRefresh' ? 'Basic Refresh' : templateKey === 'standardUpdate' ? 'Standard Update' : 'Full Renovation'} template`);
  };

  const applyRoleTemplate = (role: keyof typeof ROLE_QUICK_TEMPLATES) => {
    const current = detailQueue[currentDetailIndex];
    const nextScope = {
      ...(current.scopeInputs || {}),
      ...(current.scope || {}),
      ...ROLE_QUICK_TEMPLATES[role].defaults,
    };
    const mergedRoom = { ...current, scopeInputs: nextScope, scope: nextScope };
    updateCurrentDetail({
      scopeInputs: nextScope,
      scope: nextScope,
      ...deriveRoomFields(mergedRoom),
    });
    setQuickMessage(`Applied ${ROLE_QUICK_TEMPLATES[role].buttonLabel}`);
  };

  const copyFromPreviousRoom = () => {
    if (currentDetailIndex === 0) return;
    const previous = detailQueue[currentDetailIndex - 1];
    const mergedScope = { ...(previous.scopeInputs || {}), ...(previous.scope || {}) };
    updateCurrentDetail({
      dimensions: { ...previous.dimensions },
      scopeInputs: mergedScope,
      scope: mergedScope,
      intendedScope: [...(previous.intendedScope || [])],
      notes: previous.notes || '',
      ...deriveRoomFields({
        ...detailQueue[currentDetailIndex],
        dimensions: { ...previous.dimensions },
        scopeInputs: mergedScope,
        scope: mergedScope,
      }),
    });
    setQuickMessage('Previous room details copied');
  };

  const handleExitWalkthrough = () => {
    if (isDirty) {
      const shouldExit = window.confirm('Discard walk-through changes? You have unsaved room details.');
      if (!shouldExit) return;
    }
    setIsWalkthroughActive(false);
    setWalkthroughStep('select');
    setSelectedRoomCounts({});
    setDetailQueue([]);
    setCurrentDetailIndex(0);
    setIsDirty(false);
    draftsApi.clearWalkthroughDraft(id);
  };

  const adjustDimension = (dimension: 'length' | 'width' | 'height', delta: number) => {
    const cur = detailQueue[currentDetailIndex];
    const raw = cur.dimensions[dimension];
    const next = normalizeMetres(Number((raw + delta).toFixed(1)));
    const nextDims = { ...cur.dimensions, [dimension]: next };
    updateCurrentDetail({
      dimensions: nextDims,
      ...deriveRoomFields({ ...cur, dimensions: nextDims }),
    });
  };

  const getCompletionLabel = (pct: number): string => {
    if (pct >= 75) return 'Capture Complete';
    if (pct >= 40) return 'Partially Captured';
    return 'Needs Capture';
  };

  const buildPreCompleteChecks = (): ChecklistItem[] => {
    const missingRoomDetails = detailQueue.filter(room => getRoomCompletionPercent(room) < 40).length;
    const getScopeValue = (room: Room, key: string) =>
      room.scope?.[key] ?? room.scopeInputs?.[key];
    const hasNonEmptyScopeSelect = (room: Room, key: string) => {
      const v = getScopeValue(room, key);
      return typeof v === 'string' && v.trim().length > 0;
    };
    /** At least one wet-area signal: avoids requiring both plumbing AND waterproof in separate sections. */
    const isWetAreaMinCaptureOk = (room: Room): boolean => {
      const t = room.type.toLowerCase();
      if (!['bathroom', 'ensuite', 'laundry'].includes(t)) return true;
      if (t === 'laundry') {
        return (
          hasNonEmptyScopeSelect(room, 'plumbingScope') ||
          hasNonEmptyScopeSelect(room, 'electricalScope') ||
          hasNonEmptyScopeSelect(room, 'laundryCabScope')
        );
      }
      const w = getScopeValue(room, 'waterproofAllowance');
      if (typeof w === 'boolean') return true;
      return (
        hasNonEmptyScopeSelect(room, 'plumbingScope') ||
        hasNonEmptyScopeSelect(room, 'electricalScope') ||
        hasNonEmptyScopeSelect(room, 'bathroomTapware')
      );
    };
    const firstRoomBelow40 = detailQueue.findIndex(room => getRoomCompletionPercent(room) < 40);

    const kitchenRooms = detailQueue.filter(room => room.type.toLowerCase() === 'kitchen');
    const firstKitchenMissing = detailQueue.findIndex(room => {
      if (room.type.toLowerCase() !== 'kitchen') return false;
      const hasCabinetry = Boolean(getScopeValue(room, 'cabinetScope'));
      const hasBenchtop = Boolean(getScopeValue(room, 'benchtopMaterial'));
      const hasAppliance = Boolean(
        getScopeValue(room, 'cooktop') ||
        getScopeValue(room, 'oven') ||
        getScopeValue(room, 'dishwasher')
      );
      return !(hasCabinetry && hasBenchtop && hasAppliance);
    });
    const kitchenCoreMissing = kitchenRooms.filter(room => {
      const hasCabinetry = Boolean(getScopeValue(room, 'cabinetScope'));
      const hasBenchtop = Boolean(getScopeValue(room, 'benchtopMaterial'));
      const hasAppliance = Boolean(
        getScopeValue(room, 'cooktop') ||
        getScopeValue(room, 'oven') ||
        getScopeValue(room, 'dishwasher')
      );
      return !(hasCabinetry && hasBenchtop && hasAppliance);
    }).length;

    const wetAreaRooms = detailQueue.filter(room =>
      ['bathroom', 'ensuite', 'laundry'].includes(room.type.toLowerCase())
    );
    const firstWetAreaMissing = detailQueue.findIndex(room => {
      if (!['bathroom', 'ensuite', 'laundry'].includes(room.type.toLowerCase())) return false;
      return !isWetAreaMinCaptureOk(room);
    });
    const wetAreaMissing = wetAreaRooms.filter(room => !isWetAreaMinCaptureOk(room)).length;

    const livingRooms = detailQueue.filter(room =>
      ['living', 'dining', 'bedroom', 'study'].includes(room.type.toLowerCase())
    );
    const firstLivingMissing = detailQueue.findIndex(room => {
      if (!['living', 'dining', 'bedroom', 'study'].includes(room.type.toLowerCase())) return false;
      const hasFlooring = Boolean(getScopeValue(room, 'floorType'));
      const hasLighting = Boolean(getScopeValue(room, 'lightingLevel'));
      return !(hasFlooring && hasLighting);
    });
    const livingMissing = livingRooms.filter(room => {
      const hasFlooring = Boolean(getScopeValue(room, 'floorType'));
      const hasLighting = Boolean(getScopeValue(room, 'lightingLevel'));
      return !(hasFlooring && hasLighting);
    }).length;

    const outdoorRooms = detailQueue.filter(room =>
      ['outdoors', 'alfresco'].includes(room.type.toLowerCase())
    );
    const firstOutdoorMissing = detailQueue.findIndex(room => {
      if (!['outdoors', 'alfresco'].includes(room.type.toLowerCase())) return false;
      const fencingLm = Number(getScopeValue(room, 'fencingLm'));
      const alfFenceLm = Number(getScopeValue(room, 'alfFencingLm'));
      const hasFence = Boolean(
        getScopeValue(room, 'fencing') ||
          (Number.isFinite(fencingLm) && fencingLm > 0) ||
          (Number.isFinite(alfFenceLm) && alfFenceLm > 0) ||
          getScopeValue(room, 'fencingScope') ||
          getScopeValue(room, 'alfFencingScope')
      );
      const deckScope = String(getScopeValue(room, 'deckingScope') || '').trim().toLowerCase();
      const paveScope = String(getScopeValue(room, 'pavingScope') || '').trim().toLowerCase();
      const hasWorks = Boolean(
        (deckScope && deckScope !== 'none') ||
          (paveScope && paveScope !== 'none') ||
          getScopeValue(room, 'pergola') ||
          getScopeValue(room, 'landscaping') ||
          getScopeValue(room, 'outdoorElectrical') ||
          getScopeValue(room, 'siteClearing') ||
          getScopeValue(room, 'deckType') ||
          getScopeValue(room, 'alfDeckType') ||
          getScopeValue(room, 'gardenInstall') ||
          getScopeValue(room, 'grassInstall') ||
          getScopeValue(room, 'featurePaths')
      );
      return !(hasFence || hasWorks);
    });
    const outdoorMissing = outdoorRooms.filter(room => {
      const fencingLm = Number(getScopeValue(room, 'fencingLm'));
      const alfFenceLm = Number(getScopeValue(room, 'alfFencingLm'));
      const hasFence = Boolean(
        getScopeValue(room, 'fencing') ||
          (Number.isFinite(fencingLm) && fencingLm > 0) ||
          (Number.isFinite(alfFenceLm) && alfFenceLm > 0) ||
          getScopeValue(room, 'fencingScope') ||
          getScopeValue(room, 'alfFencingScope')
      );
      const deckScope = String(getScopeValue(room, 'deckingScope') || '').trim().toLowerCase();
      const paveScope = String(getScopeValue(room, 'pavingScope') || '').trim().toLowerCase();
      const hasWorks = Boolean(
        (deckScope && deckScope !== 'none') ||
          (paveScope && paveScope !== 'none') ||
          getScopeValue(room, 'pergola') ||
          getScopeValue(room, 'landscaping') ||
          getScopeValue(room, 'outdoorElectrical') ||
          getScopeValue(room, 'siteClearing') ||
          getScopeValue(room, 'deckType') ||
          getScopeValue(room, 'alfDeckType') ||
          getScopeValue(room, 'gardenInstall') ||
          getScopeValue(room, 'grassInstall') ||
          getScopeValue(room, 'featurePaths')
      );
      return !(hasFence || hasWorks);
    }).length;

    const garageRooms = detailQueue.filter(room => room.type.toLowerCase() === 'garage');
    const firstGarageMissing = detailQueue.findIndex(room => {
      if (room.type.toLowerCase() !== 'garage') return false;
      const hasRollerDoor = Boolean(getScopeValue(room, 'rollerDoorType'));
      const hasLighting = Boolean(getScopeValue(room, 'garageLightQty'));
      return !(hasRollerDoor || hasLighting);
    });
    const garageMissing = garageRooms.filter(room => {
      const hasRollerDoor = Boolean(getScopeValue(room, 'rollerDoorType'));
      const hasLighting = Boolean(getScopeValue(room, 'garageLightQty'));
      return !(hasRollerDoor || hasLighting);
    }).length;

    return [
      { id: 'rooms', severity: 'High', ok: detailQueue.length > 0, text: 'At least one room captured' },
      { id: 'photos', severity: 'Medium', ok: detailQueue.some(room => (room.photoUrls?.length || 0) > 0), text: 'At least one room photo added' },
      { id: 'scope', severity: 'Medium', ok: detailQueue.some(room => (room.intendedScope?.length || 0) > 0), text: 'Scope items selected' },
      { id: 'completion', severity: 'Low', ok: missingRoomDetails === 0, text: `Rooms below 40% completion: ${missingRoomDetails}`, targetIndex: firstRoomBelow40 >= 0 ? firstRoomBelow40 : undefined },
      { id: 'kitchen', severity: 'Medium', ok: kitchenCoreMissing === 0, text: `Kitchen core inputs missing: ${kitchenCoreMissing}`, targetIndex: firstKitchenMissing >= 0 ? firstKitchenMissing : undefined },
      { id: 'wet', severity: 'High', ok: wetAreaMissing === 0, text: `Wet area key decisions missing: ${wetAreaMissing}`, targetIndex: firstWetAreaMissing >= 0 ? firstWetAreaMissing : undefined },
      { id: 'living', severity: 'Low', ok: livingMissing === 0, text: `Living area basics missing: ${livingMissing}`, targetIndex: firstLivingMissing >= 0 ? firstLivingMissing : undefined },
      { id: 'outdoor', severity: 'Low', ok: outdoorMissing === 0, text: `Outdoor scope signals missing: ${outdoorMissing}`, targetIndex: firstOutdoorMissing >= 0 ? firstOutdoorMissing : undefined },
      { id: 'garage', severity: 'Low', ok: garageMissing === 0, text: `Garage basics missing: ${garageMissing}`, targetIndex: firstGarageMissing >= 0 ? firstGarageMissing : undefined },
    ];
  };

  const jumpToChecklistItem = (item: ChecklistItem) => {
    if (item.ok || item.targetIndex === undefined) return;
    setCurrentDetailIndex(item.targetIndex);
    setShowPreCompleteCheck(false);
    setQuickMessage(`Jumped to room ${item.targetIndex + 1} to fix: ${item.text}`);
  };

  if (isResolvingProject) {
    return (
      <Layout title="Loading project" showBack onBack={() => { window.location.hash = '#/'; }}>
        <div className="rounded-3xl border border-[#1f2e1f] bg-[#111810] p-6 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Please wait</p>
          <p className="text-sm text-slate-300">Loading project...</p>
          <div className="h-2 w-full rounded-full bg-[#1f2e1f] overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-[#3ddb6f]/80 animate-pulse" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!project) {
    return (
      <Layout title="Project Not Found" showBack onBack={() => { window.location.hash = '#/'; }}>
        <div className="rounded-3xl border border-[#1f2e1f] bg-[#111810] p-6 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Missing Data</p>
          <p className="text-sm text-slate-300">This project is unavailable or the link is outdated.</p>
          <button
            onClick={() => { window.location.hash = '#/'; }}
            className="w-full rounded-2xl bg-[#3ddb6f] text-black py-3 text-[11px] font-black uppercase tracking-widest"
          >
            Back To Dashboard
          </button>
        </div>
      </Layout>
    );
  }

  const roomEstimateOrCompute = (r: Room) => {
    try {
      if (r.estimate) return r.estimate;
      const calcs = r.calculations || computeRoomCalculations(sanitizeDimensions(r.dimensions));
      return calculateRoomEstimate({ ...r, dimensions: sanitizeDimensions(r.dimensions), calculations: calcs }).band;
    } catch {
      const calcs = computeRoomCalculations(sanitizeDimensions(r.dimensions));
      return computeIndicativeEstimate({ ...r, dimensions: sanitizeDimensions(r.dimensions), calculations: calcs });
    }
  };

  const calculateRoomRange = (r: Room) => {
    const e = roomEstimateOrCompute(r);
    return `$${e.low.toLocaleString()}–$${e.high.toLocaleString()}`;
  };

  const totalLowEstimate = project.rooms.reduce((sum, r) => sum + roomEstimateOrCompute(r).low, 0);
  const totalHighEstimate = project.rooms.reduce((sum, r) => sum + roomEstimateOrCompute(r).high, 0);
  const totalEstMid = projectEstimateMidTotal(project);
  const totalQuotedCompare = projectQuotedCompareTotal(project);
  const totalActualManual = projectActualManualTotal(project);
  const budgetSourceSummary = projectBudgetSourceSummary(project);
  const varQuoteVsActualProj = totalActualManual - totalQuotedCompare;
  const budgetStatus = projectBudgetStatus(project);
  const dominantStatus = deriveDominantBudgetStatus(budgetStatus);
  const topActualCategory = aggregateActualsByCategory(project)[0];
  const exposureRangeLabel = totalLowEstimate > 0 || totalHighEstimate > 0
    ? `$${totalLowEstimate.toLocaleString()}–$${totalHighEstimate.toLocaleString()}`
    : '$0';
  const activeBudgetBaselineLabel =
    budgetSourceSummary.mode === 'quote-only'
      ? 'Quote baseline'
      : budgetSourceSummary.mode === 'estimate-only'
        ? 'AI estimate baseline'
        : 'Hybrid baseline';
  const activeBudgetBaselineHelper =
    budgetSourceSummary.mode === 'hybrid'
      ? `${budgetSourceSummary.quoteRooms} rooms on quotes · ${budgetSourceSummary.estimateRooms} still on AI estimate`
      : budgetSourceSummary.mode === 'quote-only'
        ? 'All rooms are now quote-driven'
        : 'No real quotes yet, using AI estimate baseline';
  const quoteRecords = project.rooms.reduce((sum, r) => sum + (r.quoteItems || []).length, 0);
  const paidRecords = project.rooms.reduce(
    (sum, r) => sum + (r.actualCostItems || []).length + (r.quoteItems || []).reduce((qSum, q) => qSum + (q.payments || []).filter(p => p.status === 'paid').length, 0),
    0
  );
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const weeklyQuoteChanges = project.rooms.flatMap(r => (r.quoteItems || []).filter(q => q.quoteDate && new Date(q.quoteDate) >= weekAgo));
  const weeklyPaymentChanges = project.rooms.flatMap(r => (r.quoteItems || []).flatMap(q => (q.payments || []).filter(p => p.paidDate && new Date(p.paidDate) >= weekAgo)));
  const dueNextWeek = project.rooms.flatMap(r => (r.quoteItems || []).flatMap(q => (q.payments || []).filter(p => p.status === 'scheduled' && p.paidDate && new Date(p.paidDate) >= new Date() && new Date(p.paidDate) <= nextWeek)));
  const roomRiskFlags = project.rooms.filter(r => roomActualPaidTotal(r) > Math.max(roomEstimateMid(r), roomQuotedCompareTotal(r))).length;

  const currentRoom = walkthroughStep === 'detail' ? detailQueue[currentDetailIndex] : null;
  const totalSelectedRooms = Object.values(selectedRoomCounts).reduce((sum, count) => sum + count, 0);
  const selectedRoomTypeCount = Object.keys(selectedRoomCounts).length;
  const queuePreview = roomTypeOrder.flatMap(type => {
    const count = selectedRoomCounts[type] || 0;
    const normalizedType = type.charAt(0) + type.slice(1).toLowerCase();
    return Array.from({ length: count }, (_, idx) => `${normalizedType} ${idx + 1}`);
  });
  const currentScopeOptions = currentRoom
    ? INSPECTION_SCOPE_SECTIONS
    : { "MVP Included": [], "MVP Excluded": [] };
  const currentRoomCompletion = currentRoom
    ? getRoomCompletionPercent(currentRoom)
    : 0;
  const checklistItems = buildPreCompleteChecks();
  const hasBlockingIssues = checklistItems.some(item => !item.ok && item.severity === 'High');

  if (isWalkthroughActive) {
    return (
      <div className="fixed inset-0 z-[100] bg-[#0f150f] flex flex-col animate-in slide-in-from-bottom duration-300">
        <header className="px-6 py-8 flex justify-between items-start border-b border-[#1f2e1f]">
          <div className="pt-2">
            <h2 className="text-3xl font-black text-slate-100 tracking-tighter uppercase leading-none">Walk-through</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-3">
              {walkthroughStep === 'select' ? 'Inventory Property Areas' : `Detailing ${(currentRoom?.name || 'Selected Room').toUpperCase()}`}
            </p>
            {walkthroughStep === 'detail' && (
              <p className="text-[9px] text-[#3ddb6f] font-black uppercase tracking-widest mt-2">
                Room Completion: {currentRoomCompletion}% • {getCompletionLabel(currentRoomCompletion)}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <button onClick={handleExitWalkthrough} className="px-6 py-3 bg-[#111810] border border-[#1f2e1f] text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest">Exit</button>
            {walkthroughStep === 'detail' && (
              <button
                onClick={() => setAutoNextEnabled(prev => !prev)}
                className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border ${
                  autoNextEnabled ? 'bg-[#3ddb6f] text-black border-[#3ddb6f]' : 'bg-[#111810] text-slate-400 border-[#1f2e1f]'
                }`}
              >
                Auto-next {autoNextEnabled ? 'ON' : 'OFF'}
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overscroll-contain p-5 scrollbar-hide pb-40 bg-[#0f150f]" style={{ WebkitOverflowScrolling: 'touch' }}>
          {walkthroughStep === 'select' ? (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {QUICK_PROPERTY_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => applyPropertyPreset(preset.counts)}
                    className="px-4 py-2 rounded-xl border border-[#1f2e1f] bg-[#111810] text-[9px] font-black uppercase tracking-widest text-[#3ddb6f]"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
              {roomTypeOrder.map(type => {
                const room = ROOM_TYPES.find(item => item.type === type);
                if (!room) return null;
                return (
                <div
                  key={room.type}
                  className={`p-6 rounded-[32px] transition-all border ${
                    (selectedRoomCounts[room.type] || 0) > 0
                      ? 'bg-[#111810] border-[#3ddb6f] shadow-2xl shadow-emerald-900/20'
                      : 'bg-[#111810] border-[#1f2e1f] text-slate-500 shadow-sm'
                  }`}
                >
                  <div className={`flex flex-col items-center gap-3 ${(selectedRoomCounts[room.type] || 0) > 0 ? 'text-[#3ddb6f]' : 'text-slate-500'}`}>
                    {room.icon()}
                    <span className="text-[11px] font-black uppercase tracking-[0.2em]">{room.type}</span>
                  </div>
                  <div className="mt-5 flex items-center justify-center gap-3">
                    <button
                      onClick={() => updateRoomCount(room.type, -1)}
                      className="w-11 h-11 rounded-xl border border-[#1f2e1f] bg-[#0f150f] text-slate-200 font-black text-base"
                    >
                      -
                    </button>
                    <div className="min-w-[44px] text-center text-lg font-black text-slate-100">
                      {selectedRoomCounts[room.type] || 0}
                    </div>
                    <button
                      onClick={() => updateRoomCount(room.type, 1)}
                      className="w-11 h-11 rounded-xl border border-[#3ddb6f] bg-[#3ddb6f] text-black font-black text-base"
                    >
                      +
                    </button>
                    <button
                      onClick={() => updateRoomCount(room.type, 2)}
                      className="px-3 h-11 rounded-xl border border-[#1f2e1f] bg-[#0f150f] text-[9px] font-black uppercase tracking-widest text-slate-300"
                    >
                      +2
                    </button>
                    <button
                      onClick={() => updateRoomCount(room.type, 3)}
                      className="px-3 h-11 rounded-xl border border-[#1f2e1f] bg-[#0f150f] text-[9px] font-black uppercase tracking-widest text-slate-300"
                    >
                      +3
                    </button>
                  </div>
                  <div className="mt-4 flex justify-center gap-2">
                    <button
                      onClick={() => moveRoomType(room.type, -1)}
                      className="px-2 py-1 rounded-lg border border-[#1f2e1f] text-[8px] font-black uppercase tracking-widest text-slate-400"
                    >
                      Up
                    </button>
                    <button
                      onClick={() => moveRoomType(room.type, 1)}
                      className="px-2 py-1 rounded-lg border border-[#1f2e1f] text-[8px] font-black uppercase tracking-widest text-slate-400"
                    >
                      Down
                    </button>
                  </div>
                </div>
                );
              })}
              </div>
              {queuePreview.length > 0 && (
                <div className="rounded-[24px] border border-[#1f2e1f] bg-[#111810] p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Walk Path Preview</p>
                  <div className="flex flex-wrap gap-2">
                    {queuePreview.map(name => (
                      <span key={name} className="px-3 py-2 rounded-xl bg-[#0f150f] border border-[#1f2e1f] text-[9px] font-black uppercase tracking-widest text-slate-300">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-12 animate-in fade-in duration-300">
              <section className="bg-[#111810] p-8 rounded-[44px] shadow-sm border border-[#1f2e1f]">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Context Captures ({detailQueue[currentDetailIndex].photoUrls?.length || 0})</h4>
                <div className="flex flex-wrap gap-3 mb-4">
                  <button
                    type="button"
                    onClick={() => contextCaptureCameraRef.current?.click()}
                    className="min-h-[44px] flex-1 min-w-[140px] rounded-2xl border-2 border-dashed border-[#1f2e1f] bg-[#0f150f] px-4 py-3 flex flex-col items-center justify-center gap-1 text-slate-300 shadow-sm active:scale-[0.98] transition-transform"
                  >
                    <Camera className="w-5 h-5" strokeWidth={2} />
                    <span className="text-[9px] font-black uppercase tracking-widest leading-none">Take photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => contextCaptureGalleryRef.current?.click()}
                    className="min-h-[44px] flex-1 min-w-[140px] rounded-2xl border-2 border-dashed border-[#1f2e1f] bg-[#111810] px-4 py-3 flex flex-col items-center justify-center gap-1 text-slate-400 shadow-sm active:scale-[0.98] transition-transform"
                  >
                    <Images className="w-5 h-5 opacity-90" strokeWidth={2} />
                    <span className="text-[9px] font-black uppercase tracking-widest leading-none">Choose photos</span>
                  </button>
                  <input
                    ref={contextCaptureCameraRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    capture="environment"
                    onChange={handleContextCaptureFiles}
                  />
                  <input
                    ref={contextCaptureGalleryRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    multiple
                    onChange={handleContextCaptureFiles}
                  />
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                  {detailQueue[currentDetailIndex].photoUrls?.map((url, i) => (
                    <img key={i} src={url} className="w-32 h-32 rounded-[36px] object-cover flex-shrink-0 border border-[#1f2e1f] shadow-sm" />
                  ))}
                </div>
              </section>

              <section className="bg-[#111810] p-8 rounded-[44px] shadow-sm border border-[#1f2e1f]">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Room Dimensions (m)</h4>
                <div className="mb-5 flex flex-wrap gap-2">
                  {QUICK_DIMENSION_PRESETS.map(preset => (
                    <button
                      key={preset.label}
                      onClick={() => applyQuickDimensions(preset.values)}
                      className="px-4 py-2 rounded-xl border border-[#1f2e1f] bg-[#0f150f] text-[10px] font-black uppercase tracking-widest text-slate-400 active:scale-95 transition-all"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {['length', 'width', 'height'].map(dim => (
                    <div key={dim} className="bg-[#0f150f] p-6 rounded-3xl border border-[#1f2e1f]">
                      <label className="block text-[8px] font-black text-slate-400 uppercase mb-2 leading-none">{dim}</label>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => adjustDimension(dim as 'length' | 'width' | 'height', -0.1)}
                      className="w-10 h-10 rounded-lg bg-[#111810] border border-[#1f2e1f] text-slate-400 font-black text-base"
                        >
                          -
                        </button>
                        <input 
                          type="number"
                          step="0.1"
                          value={(detailQueue[currentDetailIndex].dimensions as any)[dim]} 
                          onChange={(e) => {
                            const cur = detailQueue[currentDetailIndex];
                            const nextDims = { ...cur.dimensions, [dim]: normalizeMetres(Number(e.target.value) || 0) };
                            updateCurrentDetail({ dimensions: nextDims, ...deriveRoomFields({ ...cur, dimensions: nextDims }) });
                          }}
                          className="w-full bg-transparent font-black text-2xl text-slate-100 outline-none text-center" 
                          {...numberInputQuickEntryProps}
                        />
                        <button
                          onClick={() => adjustDimension(dim as 'length' | 'width' | 'height', 0.1)}
                      className="w-10 h-10 rounded-lg bg-[#111810] border border-[#1f2e1f] text-slate-400 font-black text-base"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-[#111810] p-8 rounded-[44px] shadow-sm border border-[#1f2e1f] space-y-5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Walk-through scope</h4>
                  <span className="text-[9px] font-black text-[#3ddb6f] uppercase tracking-widest">Templates + full form</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => applyQuickTemplate('basicRefresh')} className="px-4 py-2 rounded-xl border border-[#1f2e1f] bg-[#0f150f] text-[9px] font-black uppercase tracking-widest text-slate-300">Basic Refresh</button>
                  <button onClick={() => applyQuickTemplate('standardUpdate')} className="px-4 py-2 rounded-xl border border-[#1f2e1f] bg-[#0f150f] text-[9px] font-black uppercase tracking-widest text-slate-300">Standard Update</button>
                  <button onClick={() => applyQuickTemplate('fullRenovation')} className="px-4 py-2 rounded-xl border border-[#1f2e1f] bg-[#0f150f] text-[9px] font-black uppercase tracking-widest text-slate-300">Full Renovation</button>
                  <button onClick={copyFromPreviousRoom} disabled={currentDetailIndex === 0} className="px-4 py-2 rounded-xl border border-[#1f2e1f] bg-[#0f150f] text-[9px] font-black uppercase tracking-widest text-[#3ddb6f] disabled:opacity-30">Copy Previous Room</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => applyRoleTemplate('investor')} className="px-4 py-2 rounded-xl border border-[#1f2e1f] bg-[#0f150f] text-[9px] font-black uppercase tracking-widest text-[#3ddb6f]">Investor Pack</button>
                  <button onClick={() => applyRoleTemplate('builder')} className="px-4 py-2 rounded-xl border border-[#1f2e1f] bg-[#0f150f] text-[9px] font-black uppercase tracking-widest text-[#3ddb6f]">Builder Baseline</button>
                  <button onClick={() => applyRoleTemplate('agent')} className="px-4 py-2 rounded-xl border border-[#1f2e1f] bg-[#0f150f] text-[9px] font-black uppercase tracking-widest text-[#3ddb6f]">Agent Market-Ready</button>
                </div>
                {quickMessage && (
                  <div className="rounded-xl border border-[#1f2e1f] bg-[#0f150f] px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#3ddb6f]">
                    {quickMessage}
                  </div>
                )}
                <div className="rounded-2xl border border-[#1f2e1f] bg-[#0f150f] px-4 py-4 space-y-2">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Shell geometry (auto)</p>
                  <p className="text-xs text-slate-200 font-bold leading-relaxed">
                    Floor ≈ {detailQueue[currentDetailIndex].calculations?.floorArea ?? 0} m² · Walls ≈{' '}
                    {detailQueue[currentDetailIndex].calculations?.wallArea ?? 0} m² · Perimeter ≈{' '}
                    {detailQueue[currentDetailIndex].calculations?.linearMetres ?? 0} m
                  </p>
                  <p className="text-[10px] text-[#3ddb6f] font-black uppercase tracking-widest">
                    Indicative band: $
                    {(detailQueue[currentDetailIndex].estimate?.low ?? 0).toLocaleString()} – $
                    {(detailQueue[currentDetailIndex].estimate?.high ?? 0).toLocaleString()} AUD
                  </p>
                  <p className="text-[8px] text-slate-500 leading-relaxed">
                    {detailQueue[currentDetailIndex].pricingV1?.source === 'rules' ? PRICING_SOURCE_V1_LABEL : PRICING_SOURCE_AREA_LABEL}
                    {' · '}
                    {ESTIMATE_DISCLAIMER}
                  </p>
                </div>
                <RoomScopeForm
                  roomType={detailQueue[currentDetailIndex].type}
                  values={{
                    ...(detailQueue[currentDetailIndex].scopeInputs || {}),
                    ...(detailQueue[currentDetailIndex].scope || {}),
                  }}
                  onPatch={patchScopeValues}
                />
                <textarea
                  value={detailQueue[currentDetailIndex].notes || ''}
                  onChange={(e) => updateCurrentDetail({ notes: e.target.value })}
                  placeholder="Quick notes (access, defects, urgency...)"
                  className="w-full min-h-[88px] bg-[#0f150f] border border-[#1f2e1f] text-slate-100 rounded-2xl p-4 text-sm outline-none"
                />
              </section>

              <section className="space-y-12 bg-[#111810] p-8 rounded-[44px] shadow-sm border border-[#1f2e1f]">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">MVP Scope (Inspection)</h4>
                  <button
                    onClick={() => setShowAdvancedScope(prev => !prev)}
                    className="text-[9px] font-black uppercase tracking-widest text-[#3ddb6f]"
                  >
                    {showAdvancedScope ? 'Hide Advanced' : 'Show Advanced'}
                  </button>
                </div>
                {showAdvancedScope && Object.entries(currentScopeOptions).map(([cat, items]) => (
                  <div key={cat} className="space-y-5">
                    <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] opacity-80 border-b border-slate-50 pb-2">{cat}</h5>
                    <div className="flex flex-wrap gap-2">
                      {items.map(item => (
                        <button 
                          key={item} 
                          onClick={() => {
                            if (cat === 'MVP Excluded') return;
                            const current = detailQueue[currentDetailIndex].intendedScope || [];
                            updateCurrentDetail({ intendedScope: current.includes(item) ? current.filter(i => i !== item) : [...current, item] });
                          }}
                          className={`px-7 py-4 rounded-[22px] text-[11px] font-black uppercase tracking-tight transition-all active:scale-95 border ${
                            cat === 'MVP Excluded'
                              ? 'bg-[#0f150f] border-[#1f2e1f] text-slate-500 cursor-not-allowed'
                              : detailQueue[currentDetailIndex].intendedScope?.includes(item)
                                ? 'bg-[#3ddb6f] border-[#3ddb6f] text-black shadow-xl'
                                : 'bg-[#0f150f] border-[#1f2e1f] text-slate-400 hover:border-[#3ddb6f]/40'
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            </div>
          )}
        </main>

        <footer className="p-4 pb-6 bg-[#111810]/95 backdrop-blur border-t border-[#1f2e1f] flex justify-center fixed bottom-0 left-0 right-0">
          {walkthroughStep === 'select' ? (
            <button 
              disabled={totalSelectedRooms === 0}
              onClick={startDetailing}
              className={`w-full max-w-sm p-6 rounded-[24px] font-black uppercase text-xs tracking-[0.14em] shadow-2xl transition-all ${
                totalSelectedRooms === 0 ? 'bg-[#1f2e1f] text-slate-500' : 'bg-[#3ddb6f] text-black shadow-emerald-900/40 active:scale-95'
              }`}
            >
              Detail Captured Areas ({totalSelectedRooms} rooms / {selectedRoomTypeCount} types)
            </button>
          ) : (
            <div className="w-full max-w-sm flex gap-3">
              <button
                onClick={previousArea}
                disabled={currentDetailIndex === 0}
                className="flex-1 p-5 rounded-[20px] font-black uppercase text-[12px] tracking-widest border border-[#1f2e1f] text-slate-400 disabled:opacity-30"
              >
                Previous
              </button>
              <button 
                onClick={nextArea}
                className={`flex-[2] p-5 rounded-[20px] font-black uppercase text-[12px] tracking-widest shadow-2xl transition-all ${
                  currentDetailIndex === detailQueue.length - 1 ? 'bg-[#3ddb6f] text-black shadow-emerald-900/40' : 'bg-[#111810] text-white border border-[#1f2e1f] shadow-slate-300 active:scale-95'
                }`}
              >
                {currentDetailIndex === detailQueue.length - 1 ? 'Complete' : 'Next'}
              </button>
            </div>
          )}
        </footer>

        {showPreCompleteCheck && (
          <div className="fixed inset-0 bg-black/60 z-[120] flex items-end justify-center px-4">
            <div className="w-full max-w-md bg-[#111810] border border-[#1f2e1f] rounded-t-[36px] p-6 space-y-5">
              <h3 className="text-lg font-black text-slate-100 uppercase tracking-widest">Pre-Complete Check</h3>
              {hasBlockingIssues && (
                <p className="text-[9px] text-slate-400 leading-relaxed">
                  High items block finishing. Tap a row to jump to that room, or use Review missing items to keep editing.
                  For bathroom / ensuite / laundry, expand scope and set at least one field (e.g. plumbing scope, tapware, or
                  waterproofing toggle).
                </p>
              )}
              <div className="space-y-2">
                {checklistItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => jumpToChecklistItem(item)}
                    className={`w-full flex items-center justify-between bg-[#0f150f] border border-[#1f2e1f] rounded-xl px-4 py-3 text-left ${
                      item.ok || item.targetIndex === undefined ? 'cursor-default' : 'hover:border-[#3ddb6f]/40'
                    }`}
                  >
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">{item.text}</span>
                    <span className={`text-[9px] font-black uppercase tracking-widest ${item.ok ? 'text-[#3ddb6f]' : item.severity === 'High' ? 'text-red-400' : 'text-amber-400'}`}>
                      {item.ok ? 'OK' : item.severity}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowPreCompleteCheck(false)} className="flex-1 p-4 rounded-2xl border border-[#1f2e1f] text-slate-300 text-[10px] font-black uppercase tracking-widest">Review Missing Items</button>
                <button
                  onClick={completeWalkthrough}
                  disabled={hasBlockingIssues}
                  className={`flex-1 p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest ${
                    hasBlockingIssues ? 'bg-[#1f2e1f] text-slate-500' : 'bg-[#3ddb6f] text-black'
                  }`}
                >
                  {hasBlockingIssues ? 'Resolve High Severity Items' : 'Complete Walk-through'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const completedRoomCount = project.rooms.filter(r => isRoomWalkthroughComplete(r)).length;
  const findSourceContext = parseFindSourceContext(project.description || '');
  const findOpportunityLevel = findSourceContext ? scoreToOpportunityLevel(findSourceContext.opportunityScore) : null;
  const scopeCoverageAverage = project.rooms.length
    ? project.rooms.reduce((sum, room) => sum + getScopeCompletionForRoom(room).percent, 0) / (project.rooms.length * 100)
    : 0;
  const completionRatio = project.rooms.length ? completedRoomCount / project.rooms.length : 0;
  const dealScoreSummary = computeDealScoreSummary({
    totalEstMid,
    totalQuotedCompare,
    totalActualManual,
    scopeCoverageRatio: scopeCoverageAverage,
    completionRatio,
  });
  const missingScopeAlerts: MissingScopeAlert[] = project.rooms
    .map(room => {
      const scope = getScopeCompletionForRoom(room);
      if (isRoomMissingDimensions(room)) {
        return { roomId: room.id, roomName: room.name, reason: 'Dimensions incomplete' };
      }
      if (scope.percent < 55 || roomNeedsScopeAttention(room)) {
        return { roomId: room.id, roomName: room.name, reason: `Scope capture ${scope.percent}%` };
      }
      return null;
    })
    .filter((item): item is MissingScopeAlert => item != null)
    .slice(0, 4);
  const isLockedProject = !project.isUnlocked;
  const showPaywalls = isLockedProject;
  const lockedOverlay = (
    <div className="absolute inset-0 z-10 rounded-[28px] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-xs text-center space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-200">
          Unlock full cost breakdown & profit insights
        </p>
        <button
          onClick={() => setShowPaywall(true)}
          className="px-5 py-2.5 rounded-2xl bg-[#3ddb6f] text-black text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-900/40 transition-transform duration-200 hover:scale-[1.02]"
        >
          Unlock for $69
        </button>
      </div>
    </div>
  );

  return (
    <Layout 
      title={project.name} 
      showBack 
      onBack={() => window.location.hash = '#/'}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { window.location.hash = `#/project/${encodeURIComponent(project.id)}/estimate`; }}
            className="px-4 py-2.5 rounded-[16px] border border-[#1f2e1f] bg-[#0f150f] text-[9px] font-black uppercase tracking-widest text-slate-200 hover:border-[#3ddb6f]/50"
          >
            Summary
          </button>
          <button
            type="button"
            onClick={() => setIsWalkthroughActive(true)}
            className="flex items-center gap-2 px-5 py-3 bg-[#3ddb6f] text-black rounded-[18px] text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-900/40 active:scale-95 transition-all"
          >
            <ICONS.Camera /> Walk-through
          </button>
        </div>
      }
    >
      <div className="space-y-8 pb-32">
        {findSourceContext && (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-amber-200">Created from Find</p>
            <p className="mt-1 text-[11px] font-black text-slate-100">
              {findSourceContext.originalAddress} · {findSourceContext.suburb}
            </p>
            <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-amber-100/90">
              Held {Math.max(0, Math.round(findSourceContext.yearsHeld))} years · {findOpportunityLevel} opportunity
            </p>
          </div>
        )}
        <div className="rounded-2xl border border-[#1f2e1f] bg-[#111810] px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">
            {isLockedProject ? 'Advanced insights are locked for this project' : 'Project unlocked for full financial clarity'}
          </p>
          {showPaywalls && (
            <button
              type="button"
              onClick={() => setShowPaywall(true)}
              className="px-4 py-2 rounded-xl border border-[#3ddb6f]/50 bg-[#0f150f] text-[10px] font-black uppercase tracking-widest text-[#3ddb6f] transition-transform duration-200 hover:scale-[1.02]"
            >
              Unlock for $69
            </button>
          )}
        </div>
        <section className="rounded-2xl border border-[#1f2e1f] bg-[#111810] p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="rounded-2xl border border-[#1f2e1f] bg-[#0f150f] px-3 py-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Deal Score</p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <p className="text-2xl font-black text-slate-100 tabular-nums">{dealScoreSummary.score}</p>
                <span
                  className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-md border ${
                    dealScoreSummary.riskLabel === 'Low risk'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                      : dealScoreSummary.riskLabel === 'Medium risk'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                        : 'border-red-500/30 bg-red-500/10 text-red-200'
                  }`}
                >
                  {dealScoreSummary.riskLabel}
                </span>
              </div>
              <p className="text-[8px] text-slate-500 mt-1">Budget variance, quote coverage, and scope capture.</p>
            </div>
            <div className="rounded-2xl border border-[#1f2e1f] bg-[#0f150f] px-3 py-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Missing scope alerts</p>
              {missingScopeAlerts.length === 0 ? (
                <p className="mt-2 text-[10px] font-black text-[#3ddb6f]">No critical gaps detected.</p>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {missingScopeAlerts.map(alert => (
                    <button
                      key={alert.roomId}
                      type="button"
                      onClick={() => { window.location.hash = `#/project/${id}/room/${alert.roomId}`; }}
                      className="w-full text-left rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 hover:border-amber-500/40"
                    >
                      <p className="text-[9px] font-black uppercase tracking-widest text-amber-100">{alert.roomName}</p>
                      <p className="text-[8px] text-amber-200/80">{alert.reason}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
        <section className="rounded-2xl border border-[#1f2e1f] bg-[#111810] p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="rounded-2xl border border-[#1f2e1f] bg-[#0f150f] px-3 py-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5"><FileText size={16} className="opacity-70" />Estimate (mid)</p>
              <p className="text-lg font-black text-slate-100 tabular-nums">${Math.round(totalEstMid).toLocaleString()}</p>
            </div>
            <div className="rounded-2xl border border-[#1f2e1f] bg-[#0f150f] px-3 py-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5"><Receipt size={16} className="opacity-70" />Active baseline</p>
              <p className="text-lg font-black text-slate-100 tabular-nums">${Math.round(budgetSourceSummary.activeBaselineTotal).toLocaleString()}</p>
              <p className="text-[7px] font-bold text-slate-500 normal-case leading-tight mt-1">{activeBudgetBaselineLabel}</p>
            </div>
            <div className="rounded-2xl border border-[#1f2e1f] bg-[#0f150f] px-3 py-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5"><Hammer size={16} className="opacity-70" />Actual paid</p>
              <p className="text-lg font-black text-[#3ddb6f] tabular-nums">${Math.round(totalActualManual).toLocaleString()}</p>
            </div>
          </div>
          <p className="text-[8px] text-slate-500 leading-relaxed">
            {activeBudgetBaselineHelper}. Actual paid includes quote payments plus legacy actual-cost entries.
          </p>
          <p className="text-[8px] text-slate-500">
            Based on {quoteRecords} quote records · {paidRecords} payment/actual records
          </p>
          {quoteRecords === 0 && <p className="text-[9px] text-amber-200">Missing quotes: Not captured yet.</p>}
          {paidRecords === 0 && <p className="text-[9px] text-amber-200">Missing payments: Not captured yet.</p>}
          <p className={`text-[11px] font-black uppercase tracking-widest ${
            budgetStatus.isOverBudget ? 'text-red-300' : 'text-[#3ddb6f]'
          }`}>
            {dominantStatus} · {budgetStatus.label}
          </p>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
            {budgetStatus.helper}
          </p>
        </section>
        <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest px-1 -mt-2">
          &ldquo;Complete&rdquo; = all dimensions set and capture score ≥ 55
        </p>
        <p className="text-[8px] text-amber-200/80 leading-relaxed px-1 -mt-2">
          {ESTIMATE_DISCLAIMER}
        </p>
        <p className="text-[7px] text-slate-500/70 leading-relaxed px-1 -mt-1">
          Indicative estimate only · Based on your room inputs · Live calculation
        </p>
        <div className="rounded-2xl border border-[#1f2e1f] bg-[#111810] px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#3ddb6f]">Demo Project — Example data for walkthrough</p>
        </div>
        <section className="relative bg-[#151d15] border border-[#2a3a2a] rounded-[28px] p-4 space-y-3 shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Project Insights</h3>
          <p className={`text-[11px] font-black ${
            totalQuotedCompare <= 0 ? 'text-amber-200' : varQuoteVsActualProj <= 0 ? 'text-[#3ddb6f]' : 'text-red-300'
          }`}>
            {totalQuotedCompare <= 0 ? 'Missing quotes: Not captured yet' : varQuoteVsActualProj <= 0 ? 'Tracking under accepted quotes' : 'Over accepted quotes'}
          </p>
          <p className="text-[11px] font-black text-slate-200 flex items-center gap-2">
            <House size={16} className="text-slate-400" />
            Biggest cost: {topActualCategory ? `${topActualCategory.category} ($${Math.round(topActualCategory.amount).toLocaleString()})` : 'No costs yet ($0)'}
          </p>
          {showPaywalls && isLockedProject && lockedOverlay}
        </section>
        <section className="rounded-2xl border border-[#1f2e1f] bg-[#111810] p-4 space-y-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Weekly tradie summary</p>
          <p className="text-[9px] text-slate-400">Changed this week: {weeklyQuoteChanges.length} quotes · {weeklyPaymentChanges.length} payments</p>
          <p className="text-[9px] text-slate-400">Due next week: {dueNextWeek.length} scheduled payments</p>
          <p className="text-[9px] text-slate-400">Risk flags: {roomRiskFlags} room{roomRiskFlags === 1 ? '' : 's'} over quote/budget</p>
        </section>
        <div className="bg-[#111810] border border-[#1f2e1f] p-6 rounded-[32px] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Room Select</h3>
            <span className="text-[9px] font-black uppercase tracking-widest text-[#3ddb6f]">{project.rooms.length} rooms</span>
          </div>
          {project.rooms.length === 0 ? (
            <p className="text-[10px] text-slate-500">No room chips yet — use Walk-through to add rooms.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {project.rooms.map(room => (
                <button
                  key={`picker-${room.id}`}
                  onClick={() => { window.location.hash = `#/project/${id}/room/${room.id}`; }}
                  className="px-3 py-2 rounded-xl border border-[#1f2e1f] bg-[#0f150f] text-[9px] font-black uppercase tracking-widest text-slate-300 hover:border-[#3ddb6f]/50"
                >
                  {room.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#111810] border border-[#1f2e1f] p-10 rounded-[44px] shadow-sm">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Estimate Summary (Low–High)</span>
            <p className="text-2xl font-black text-[#3ddb6f] tracking-tighter leading-none">{exposureRangeLabel}</p>
            <p className="text-[8px] text-slate-500 mt-2 leading-relaxed">{ESTIMATE_DISCLAIMER}</p>
            <button
              type="button"
              onClick={() => { window.location.hash = `#/project/${encodeURIComponent(project.id)}/estimate`; }}
              className="mt-3 text-[9px] font-black uppercase tracking-widest text-[#3ddb6f] underline decoration-[#3ddb6f]/40 underline-offset-4"
            >
              Open full estimate summary
            </button>
          </div>
          <div className="bg-[#111810] border border-[#1f2e1f] p-10 rounded-[44px] shadow-sm">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Actual paid</span>
            <p className="text-2xl font-black text-emerald-500 tracking-tighter leading-none">${Math.round(totalActualManual).toLocaleString()}</p>
          </div>
        </div>
        {project.rooms.length > 0 && (
          <div className="relative bg-[#111810] border border-[#1f2e1f] rounded-[32px] p-6">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Estimate Breakdown</h4>
            <div className="space-y-2">
              {project.rooms.map(room => (
                <div key={`summary-${room.id}`} className="bg-[#0f150f] border border-[#1f2e1f] rounded-2xl px-4 py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-200 truncate">{room.name}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{room.type}</p>
                    <p className="text-[7px] font-bold uppercase text-slate-500 mt-1">
                      {room.pricingV1?.source === 'rules' ? PRICING_SOURCE_V1_LABEL : PRICING_SOURCE_AREA_LABEL}
                    </p>
                  </div>
                  <div className="flex-shrink-0 flex flex-col items-end gap-1 min-w-0 max-w-[55%] sm:max-w-none">
                    <p className="text-[11px] font-black text-[#3ddb6f] tabular-nums text-right">{calculateRoomRange(room)}</p>
                    <RoomPricingSourceBadges room={room} align="end" />
                  </div>
                </div>
              ))}
            </div>
            {showPaywalls && isLockedProject && lockedOverlay}
          </div>
        )}

        {project.rooms.length === 0 ? (
          <div className="text-center py-24 px-10 border-2 border-dashed border-[#1f2e1f] rounded-[64px] space-y-6 bg-[#111810]">
            <p className="text-slate-300 font-bold uppercase text-[12px] tracking-[0.2em] leading-relaxed px-4">No rooms yet</p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
              Start a walk-through to add rooms, then set dimensions and structured scope for indicative estimates.
            </p>
            <button
              onClick={() => setIsWalkthroughActive(true)}
              className="px-14 py-8 bg-[#3ddb6f] text-black rounded-[28px] font-black uppercase text-xs tracking-[0.2em] shadow-2xl shadow-emerald-900/40 active:scale-95 transition-all"
            >
              Launch Walk-through
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {project.rooms.map(room => {
              const dimBad = isRoomMissingDimensions(room);
              const scopeLow = roomNeedsScopeAttention(room);
              const sc = getScopeCompletionForRoom(room);
              const capturePct = getRoomCompletionPercent(room);
              const captureBarTone =
                capturePct >= 70 ? 'bg-[#3ddb6f]' : capturePct >= 40 ? 'bg-amber-400' : 'bg-red-500';
              const roomEstMid = roomEstimateMid(room);
              const roomActualPaid = roomActualPaidTotal(room);
              const roomUsesQuotes = hasRoomQuotesInPlay(room);
              const isOverEstimate = roomActualPaid > roomEstMid && roomEstMid > 0;
              const hasEstimateComparison = roomEstMid > 0;
              const borderAccent = dimBad
                ? 'border-l-4 border-l-amber-500'
                : scopeLow
                  ? 'border-l-4 border-l-orange-500/80'
                  : 'border-l-4 border-l-transparent';
              return (
                <div
                  key={room.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => { window.location.hash = `#/project/${id}/room/${room.id}`; }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      window.location.hash = `#/project/${id}/room/${room.id}`;
                    }
                  }}
                  className={`bg-[#111810] border border-[#1f2e1f] p-4 sm:p-5 rounded-[32px] shadow-sm flex flex-col gap-3 active:scale-[0.99] transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 hover:border-[#3ddb6f]/50 ${borderAccent}`}
                >
                  <div className="flex items-stretch gap-4 w-full">
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-[#0f150f] flex-shrink-0 shadow-inner self-center border border-[#1f2e1f]">
                    {room.photoUrls && room.photoUrls.length > 0 ? (
                      <>
                        <img
                          src={room.photoUrls[0]}
                          alt=""
                          className="w-full h-full object-cover rounded-xl"
                        />
                        {room.photoUrls.length > 1 && (
                          <span className="absolute bottom-0 right-0 min-w-[1.25rem] px-1 py-0.5 rounded-tl-md rounded-br-md bg-black/80 text-[8px] font-black leading-none text-white text-center tabular-nums">
                            +{room.photoUrls.length - 1}
                          </span>
                        )}
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-200">
                        {roomTypeIcon(room.type)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-black text-[14px] sm:text-[15px] text-slate-100 uppercase tracking-tight leading-tight truncate">
                        {room.name}
                      </h4>
                      {hasEstimateComparison && !roomUsesQuotes && (
                        <span
                          className={`shrink-0 text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${
                            isOverEstimate
                              ? 'bg-red-500/15 text-red-200 border-red-500/30'
                              : 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30'
                          }`}
                        >
                          {isOverEstimate ? 'Over estimate' : 'Under estimate'}
                        </span>
                      )}
                      {roomUsesQuotes && (
                        <span className="shrink-0 text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border bg-sky-500/15 text-sky-200 border-sky-500/30">
                          Quote-driven
                        </span>
                      )}
                      {dimBad && (
                        <span className="shrink-0 text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-200 border border-amber-500/30">
                          Dims
                        </span>
                      )}
                      {!dimBad && scopeLow && (
                        <span className="shrink-0 text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-orange-500/15 text-orange-200 border border-orange-500/30">
                          Scope
                        </span>
                      )}
                    </div>
                    <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">
                      {room.type} · {room.calculations?.floorArea ?? 0} m² floor
                    </p>
                    <p className="text-[8px] text-slate-500">
                      Baseline ${Math.round(Math.max(roomEstimateMid(room), roomQuotedCompareTotal(room))).toLocaleString()} · Quoted ${Math.round(roomQuotedCompareTotal(room)).toLocaleString()} · Paid ${Math.round(roomActualPaidTotal(room)).toLocaleString()} · Variance {roomActualPaidTotal(room) - Math.max(roomEstimateMid(room), roomQuotedCompareTotal(room)) > 0 ? '+' : ''}${Math.round(roomActualPaidTotal(room) - Math.max(roomEstimateMid(room), roomQuotedCompareTotal(room))).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right self-center pl-1 flex flex-col items-end justify-center gap-1 min-w-0 max-w-[42%] sm:max-w-[36%]">
                    <span className="text-[11px] sm:text-xs font-black text-[#3ddb6f] tracking-tight tabular-nums">
                      {calculateRoomRange(room)}
                    </span>
                    <RoomPricingSourceBadges room={room} align="end" />
                    {isRoomWalkthroughComplete(room) && (
                      <span className="text-[7px] font-black uppercase text-[#3ddb6f]/80">On track</span>
                    )}
                  </div>
                  </div>
                  <div className="w-full border-t border-[#1f2e1f] pt-2 -mx-0">
                    {dimBad ? (
                      <p className="text-[8px] font-black uppercase tracking-widest text-red-400">
                        DIMENSIONS MISSING
                      </p>
                    ) : (
                      <>
                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                          CAPTURE {capturePct}% · FORM SCOPE {sc.percent}%
                        </p>
                        <div className="h-1 w-full bg-[#1f2e1f] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${captureBarTone}`}
                            style={{ width: `${Math.min(100, Math.max(0, capturePct))}%` }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <PaywallModal
        isOpen={showPaywalls && showPaywall}
        onClose={() => setShowPaywall(false)}
        onUnlock={() => {
          unlockProject(project.id);
          const refreshed = findProjectById(id);
          if (refreshed) setProject(refreshed);
          setShowPaywall(false);
        }}
        projectId={project.id}
        clientBudget={project.totalBudget}
        estimateMid={totalEstMid}
        statusLabel={budgetStatus.label}
      />
    </Layout>
  );
};

export default ProjectDetails;


import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, FileText, Hammer, Images, Receipt } from 'lucide-react';
import Layout from '../components/Layout';
import PaywallModal from '../components/PaywallModal';
import QuotesActualsTab from '../components/QuotesActualsTab';
import RoomScopeForm from '../components/RoomScopeForm';
import { Project, Room, Dimensions, Expense, Category, ExpenseStatus, ExpenseInstallment } from '../types';
import { ESTIMATE_DISCLAIMER, ICONS, PRICING_SOURCE_AREA_LABEL, PRICING_SOURCE_V1_LABEL } from '../constants';
import { applyRoomPricing, calculateRoomEstimate } from '../utils/calculateRoomEstimate';
import { computeIndicativeEstimate } from '../utils/indicativeEstimate';
import { computeRoomCalculations } from '../utils/roomCalculations';
import {
  hasRoomQuotesInPlay,
  roomEstimateMid,
  roomActualPaidTotal,
  roomBudgetBaselineTotal,
  roomQuotedCompareTotal,
} from '../utils/budgetAggregates';
import { getScopeCompletionForRoom, isRoomMissingDimensions } from '../utils/roomStatus';
import { numberInputQuickEntryProps } from '../components/forms/quickNumericInput';
import { createDebouncedDraftSaver, draftsApi, getProjectById, loadProjects, unlockProject, updateRoomById } from '../store/projectStore';
import { filesToBase64DataUrls } from '../utils/imageFiles';
import { sanitizeDimensions } from '../utils/safePersistence';

interface Props { projectId: string; roomId: string; }

const PLAN_DRAFT_ACTIONS = new Set([
  'Scope updated',
  'Dimensions updated',
  'Room notes saved',
  'Work item added',
  'Work item removed',
]);

function buildRoomDraftSnapshot(r: Room): Record<string, unknown> {
  return {
    roomId: r.id,
    scopeInputs: { ...(r.scopeInputs || {}) },
    scope: { ...(r.scope || {}) },
    dimensions: { ...r.dimensions },
    notes: r.notes || '',
    intendedScope: [...(r.intendedScope || [])],
    savedAt: Date.now(),
  };
}

const RoomDetails: React.FC<Props> = ({ projectId, roomId }) => {
  const [project, setProject] = useState<Project | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [activeTab, setActiveTab] = useState<'plan' | 'tracker' | 'quotes' | 'discovery'>('plan');
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [newScopeItem, setNewScopeItem] = useState('');
  const [loadError, setLoadError] = useState<'ok' | 'no_project' | 'no_room'>('ok');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [lastSavedAction, setLastSavedAction] = useState<string>('Room updated');

  const planCameraInputRef = useRef<HTMLInputElement>(null);
  const planGalleryInputRef = useRef<HTMLInputElement>(null);
  const quoteFileInputRef = useRef<HTMLInputElement>(null);
  const receiptFileInputRef = useRef<HTMLInputElement>(null);
  const draftSaverRef = useRef<(d: unknown) => void>(() => {});
  const [recoverableDraft, setRecoverableDraft] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    draftSaverRef.current = createDebouncedDraftSaver(projectId);
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const draft = await draftsApi.getRoomEditDraft(projectId, roomId);
      if (cancelled || !draft || typeof draft !== 'object') return;
      if ((draft as { roomId?: string }).roomId !== roomId) return;
      setRecoverableDraft(draft as Record<string, unknown>);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, roomId]);

  useEffect(() => {
    const proj = getProjectById(projectId);
    if (!proj) {
      setLoadError('no_project');
      setProject(null);
      setRoom(null);
      return;
    }
    const r = proj.rooms.find(x => x.id === roomId);
    if (!r) {
      setLoadError('no_room');
      setProject(proj);
      setRoom(null);
      return;
    }
    setLoadError('ok');
    setProject(proj);
    setRoom(r);
  }, [projectId, roomId]);

  useEffect(() => {
    setActionMessage(null);
  }, [selectedExpenseId]);

  const hasTransientInput = Boolean(
    selectedExpenseId ||
    newScopeItem.trim() ||
    invoiceAmount.trim() ||
    paymentAmount.trim()
  );

  useEffect(() => {
    if (!hasTransientInput) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasTransientInput]);

  const saveRoom = (updated: Room, action: string = 'Room updated') => {
    const result = updateRoomById(projectId, roomId, () => updated);
    if (!result) return;
    setRoom(result.room);
    setProject(result.project);
    setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setLastSavedAction(action);
    if (PLAN_DRAFT_ACTIONS.has(action)) {
      draftSaverRef.current(buildRoomDraftSnapshot(result.room));
    }
  };

  const patchScope = (patch: Record<string, string | number | boolean>) => {
    if (!room) return;
    if (!project?.isUnlocked) {
      setActionMessage('Unlock to edit full room scope and selections');
      return;
    }
    const nextScope = { ...(room.scopeInputs || {}), ...(room.scope || {}), ...patch };
    const calculations = computeRoomCalculations(room.dimensions);
    try {
      const priced = applyRoomPricing({
        ...room,
        scopeInputs: nextScope,
        scope: nextScope,
        calculations,
      });
      saveRoom(priced, 'Scope updated');
    } catch {
      setActionMessage('Scope saved. Estimate reverted to area band—try again.');
      const est = computeIndicativeEstimate({
        ...room,
        scopeInputs: nextScope,
        scope: nextScope,
        calculations,
      });
      saveRoom({
        ...room,
        scopeInputs: nextScope,
        scope: nextScope,
        calculations,
        estimate: est,
        pricingV1: { lineItems: [], tradeBreakdown: [], source: 'placeholder' },
      }, 'Scope updated');
    }
  };

  const updateDimensionsField = (dim: 'length' | 'width' | 'height', value: number) => {
    if (!room) return;
    const normalizeDimensionEdit = (raw: number): { metres: number; fromMm: boolean } => {
      const n = Number.isFinite(raw) ? raw : 0;
      if (n <= 0) return { metres: 0, fromMm: false };
      if (n > 50) return { metres: Math.min(50, n / 1000), fromMm: true };
      return { metres: Math.min(50, n), fromMm: false };
    };
    const shell = {
      length: room.dimensions.length,
      width: room.dimensions.width,
      height: room.dimensions.height,
    };
    const { metres, fromMm } = normalizeDimensionEdit(value);
    const nextDims: Dimensions = {
      ...shell,
      [dim]: metres,
      ...(fromMm ? { _autoConverted: true } : {}),
    };
    const calculations = computeRoomCalculations(nextDims);
    try {
      const priced = applyRoomPricing({ ...room, dimensions: nextDims, calculations });
      saveRoom(priced, 'Dimensions updated');
    } catch {
      setActionMessage('Could not recalc; dimensions saved with area-based band.');
      saveRoom({
        ...room,
        dimensions: nextDims,
        calculations,
        estimate: computeIndicativeEstimate({ ...room, dimensions: nextDims, calculations }),
        pricingV1: { lineItems: [], tradeBreakdown: [], source: 'placeholder' },
      }, 'Dimensions updated');
    }
  };

  const updateExpense = (expId: string, updates: Partial<Expense>) => {
    if (!room) return;
    const updatedExpenses = room.expenses.map(e => e.id === expId ? { ...e, ...updates } : e);
    saveRoom({ ...room, expenses: updatedExpenses }, 'Tracker updated');
  };

  const saveNotes = (nextNotes: string) => {
    if (!room) return;
    saveRoom({ ...room, notes: nextNotes }, 'Room notes saved');
  };

  const handleUpdateQuote = () => {
    if (!selectedExpenseId || !invoiceAmount) {
      setActionMessage('Enter a quote amount first.');
      return;
    }
    const amount = parseFloat(invoiceAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setActionMessage('Quote amount must be greater than 0.');
      return;
    }
    updateExpense(selectedExpenseId, { 
      quoteAmount: amount, 
      amount: amount, 
      status: (room?.expenses.find(e => e.id === selectedExpenseId)?.paidAmount || 0) > 0 ? 'Partial' : 'Quote' 
    });
    setInvoiceAmount('');
    setActionMessage('Quote updated.');
  };

  const handleRecordPayment = () => {
    if (!selectedExpenseId || !paymentAmount) {
      setActionMessage('Enter a payment amount first.');
      return;
    }
    const amount = parseFloat(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setActionMessage('Payment amount must be greater than 0.');
      return;
    }
    const exp = room?.expenses.find(e => e.id === selectedExpenseId);
    if (!exp) return;
    const remaining = Math.max((exp.quoteAmount || exp.amount || 0) - (exp.paidAmount || 0), 0);
    if (remaining > 0 && amount > remaining) {
      setActionMessage(`Payment exceeds remaining amount ($${remaining.toLocaleString()}).`);
      return;
    }

    const newInstallment: ExpenseInstallment = {
      date: new Date().toLocaleDateString('en-GB'),
      amount: amount
    };

    const newPaidAmount = (exp.paidAmount || 0) + amount;
    const newInstallments = [...(exp.installments || []), newInstallment];
    const totalQuote = exp.quoteAmount || exp.amount || 0;
    
    let newStatus: ExpenseStatus = 'Quote';
    if (newPaidAmount >= totalQuote) newStatus = 'Paid';
    else if (newPaidAmount > 0) newStatus = 'Partial';

    updateExpense(selectedExpenseId, { 
      paidAmount: newPaidAmount, 
      installments: newInstallments,
      status: newStatus 
    });
    setPaymentAmount('');
    setActionMessage('Payment recorded.');
  };

  const handlePlanRoomPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    try {
      const encoded = await filesToBase64DataUrls(files);
      const result = updateRoomById(projectId, roomId, r => ({
        ...r,
        photoUrls: [...(r.photoUrls || []), ...encoded],
      }));
      if (result) {
        setRoom(result.room);
        setProject(result.project);
        draftSaverRef.current(buildRoomDraftSnapshot(result.room));
      }
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Could not process one or more photos.');
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'quotePhotoUrls' | 'paymentPhotoUrls') => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !selectedExpenseId) return;

    const oversized = files.find(file => file.size > 2 * 1024 * 1024);
    if (oversized) {
      setActionMessage('Photo too large. Use images under 2MB.');
      e.target.value = '';
      return;
    }

    const toBase64 = (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

    try {
      const encoded = await Promise.all(files.map(toBase64));
      const exp = room?.expenses.find(ex => ex.id === selectedExpenseId);
      if (exp) {
        updateExpense(selectedExpenseId, {
          [field]: [...(exp[field] || []), ...encoded],
        });
      }
    } catch {
      setActionMessage('Could not process one or more photos.');
    } finally {
      e.target.value = '';
    }
  };

  const addScopeItem = () => {
    const trimmed = newScopeItem.trim();
    if (!room || !trimmed) return;
    if (!project?.isUnlocked) {
      setActionMessage('Unlock to edit full room scope and selections');
      return;
    }
    if ((room.intendedScope || []).includes(trimmed)) {
      setActionMessage('Scope item already exists.');
      return;
    }
    saveRoom({ ...room, intendedScope: [...(room.intendedScope || []), trimmed] }, 'Work item added');
    setNewScopeItem('');
    setActionMessage('Scope item added.');
  };

  const removeScopeItem = (item: string) => {
    if (!room) return;
    if (!project?.isUnlocked) {
      setActionMessage('Unlock to edit full room scope and selections');
      return;
    }
    saveRoom({ ...room, intendedScope: (room.intendedScope || []).filter(scope => scope !== item) }, 'Work item removed');
  };

  const deleteExpense = (id: string) => {
    if (!room) return;
    saveRoom({ ...room, expenses: room.expenses.filter(e => e.id !== id) }, 'Expense removed');
    setSelectedExpenseId(null);
  };

  if (loadError === 'no_project') {
    return (
      <Layout title="Project" showBack onBack={() => { window.location.hash = '#/'; }}>
        <div className="rounded-3xl border border-[#1f2e1f] bg-[#111810] p-6 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Not found</p>
          <p className="text-sm text-slate-300">This project does not exist or the link is invalid.</p>
          <button
            type="button"
            onClick={() => { window.location.hash = '#/'; }}
            className="w-full rounded-2xl bg-[#3ddb6f] text-black py-3 text-[11px] font-black uppercase tracking-widest"
          >
            Back to projects
          </button>
        </div>
      </Layout>
    );
  }

  if (loadError === 'no_room' && project) {
    return (
      <Layout title="Room" showBack onBack={() => { window.location.hash = `#/project/${projectId}`; }}>
        <div className="rounded-3xl border border-[#1f2e1f] bg-[#111810] p-6 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Not found</p>
          <p className="text-sm text-slate-300">This room is not in the project, or the link is outdated.</p>
          <button
            type="button"
            onClick={() => { window.location.hash = `#/project/${projectId}`; }}
            className="w-full rounded-2xl bg-[#3ddb6f] text-black py-3 text-[11px] font-black uppercase tracking-widest"
          >
            Back to project
          </button>
        </div>
      </Layout>
    );
  }

  if (!room || !project) {
    return (
      <Layout title="Loading" showBack onBack={() => { window.location.hash = '#/'; }}>
        <div className="rounded-3xl border border-[#1f2e1f] bg-[#111810] p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loading…</p>
        </div>
      </Layout>
    );
  }

  const totalExposure = room.expenses.reduce((s, e) => s + (e.estimateAmount || e.amount || 0), 0);
  const paidToDate = room.expenses.reduce((s, e) => s + (e.paidAmount || 0), 0);
  const selectedExpense = room.expenses.find(e => e.id === selectedExpenseId);
  const selectedQuoteAmount = selectedExpense?.quoteAmount || selectedExpense?.amount || 0;
  const selectedRemaining = Math.max(selectedQuoteAmount - (selectedExpense?.paidAmount || 0), 0);
  const roomCalculations = room.calculations || computeRoomCalculations(room.dimensions);
  const roomEstimate =
    room.estimate ||
    calculateRoomEstimate({ ...room, calculations: roomCalculations }).band;
  const dimMissing = isRoomMissingDimensions(room);
  const scopeRegistry = getScopeCompletionForRoom(room);
  const showEmptyScopeHint = scopeRegistry.total > 0 && scopeRegistry.filled === 0;
  const estMidSummary = roomEstimateMid(room);
  const roomHasQuotesInPlay = hasRoomQuotesInPlay(room);
  const activeBaselineSummary = roomBudgetBaselineTotal(room);
  const actualManualSummary = roomActualPaidTotal(room);
  const quotedSummary = roomQuotedCompareTotal(room);
  const remainingSummary = activeBaselineSummary - actualManualSummary;
  const isLockedProject = !project.isUnlocked;
  const hasAnyUnlockedProject = loadProjects().some(p => p.isUnlocked);
  const showPaywalls = !hasAnyUnlockedProject;
  const closeoutChecklist = [
    { label: 'Dimensions captured', ok: !dimMissing },
    { label: 'Scope captured', ok: scopeRegistry.percent >= 40 || (room.intendedScope || []).length > 0 },
    { label: 'Quote or payment captured', ok: quotedSummary > 0 || actualManualSummary > 0 },
  ];

  const openUnlockPaywall = () => {
    if (!isLockedProject) return;
    setShowPaywall(true);
  };

  const handleRestoreDraft = () => {
    if (!room || !recoverableDraft) return;
    const si = recoverableDraft.scopeInputs;
    const sc = recoverableDraft.scope;
    const scopeInputs =
      si && typeof si === 'object' && !Array.isArray(si) ? (si as Record<string, string | number | boolean>) : {};
    const scopeObj =
      sc && typeof sc === 'object' && !Array.isArray(sc) ? (sc as Record<string, string | number | boolean>) : {};
    const mergedScope = { ...scopeInputs, ...scopeObj };
    const nextDims = sanitizeDimensions(recoverableDraft.dimensions ?? room.dimensions);
    const calculations = computeRoomCalculations(nextDims);
    const rawIntent = recoverableDraft.intendedScope;
    const intendedScope = Array.isArray(rawIntent)
      ? (rawIntent as unknown[]).filter((x): x is string => typeof x === 'string')
      : room.intendedScope || [];
    const notes = typeof recoverableDraft.notes === 'string' ? recoverableDraft.notes : room.notes || '';
    const base: Room = {
      ...room,
      scopeInputs: mergedScope,
      scope: mergedScope,
      dimensions: nextDims,
      notes,
      intendedScope,
      calculations,
    };
    try {
      saveRoom(applyRoomPricing(base), 'Scope updated');
    } catch {
      saveRoom(
        {
          ...base,
          estimate: computeIndicativeEstimate(base),
          pricingV1: { lineItems: [], tradeBreakdown: [], source: 'placeholder' },
        },
        'Scope updated'
      );
    }
    setRecoverableDraft(null);
    void draftsApi.clearRoomEditDraft(projectId, roomId);
  };

  const handleSaveRoomAndReturn = () => {
    const calculations = computeRoomCalculations(room.dimensions);
    try {
      saveRoom(applyRoomPricing({ ...room, calculations }));
    } catch {
      saveRoom({
        ...room,
        calculations,
        estimate: computeIndicativeEstimate({ ...room, calculations }),
        pricingV1: { lineItems: [], tradeBreakdown: [], source: 'placeholder' },
      });
    }
    void draftsApi.clearRoomEditDraft(projectId, roomId);
    setRecoverableDraft(null);
    window.location.hash = `#/project/${projectId}`;
  };

  return (
    <Layout title={room.name} showBack onBack={() => { window.location.hash = `#/project/${projectId}`; }}>
      <>
        <div className="space-y-4">
          <div className="sticky top-0 z-20 -mx-2 px-2 pt-1 pb-3 space-y-3 bg-[#0f150f]/95 backdrop-blur-sm border-b border-[#1f2e1f]">
            {recoverableDraft && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-100">
                  Unsaved draft recovered — tap to restore
                </p>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleRestoreDraft}
                    className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-[#3ddb6f] text-black text-[10px] font-black uppercase tracking-widest"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecoverableDraft(null)}
                    className="flex-1 sm:flex-none px-4 py-2 rounded-xl border border-amber-500/50 text-[10px] font-black uppercase tracking-widest text-amber-100/90"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap p-0.5 bg-[#111810] border border-[#1f2e1f] rounded-[28px] shadow-sm gap-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('plan')}
                className={`flex-1 min-w-[28%] min-h-[48px] py-3 text-[10px] font-black uppercase tracking-widest rounded-[20px] transition-all duration-300 ${
                  activeTab === 'plan' ? 'bg-[#0f150f] text-[#3ddb6f] shadow-inner' : 'text-slate-400'
                }`}
              >
                1. Plan
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isLockedProject) {
                    setActionMessage('Unlock to edit full room scope and selections');
                    return;
                  }
                  setActiveTab('tracker');
                }}
                className={`flex-1 min-w-[28%] min-h-[48px] py-3 text-[10px] font-black uppercase tracking-widest rounded-[20px] transition-all duration-300 ${
                  activeTab === 'tracker' ? 'bg-[#0f150f] text-[#3ddb6f] shadow-inner' : 'text-slate-400'
                }`}
              >
                2. Tracker
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isLockedProject) {
                    setActionMessage('Unlock to edit full room scope and selections');
                    return;
                  }
                  setActiveTab('quotes');
                }}
                className={`flex-1 min-w-[28%] min-h-[48px] py-3 text-[10px] font-black uppercase tracking-widest rounded-[20px] transition-all duration-300 ${
                  activeTab === 'quotes' ? 'bg-[#0f150f] text-[#3ddb6f] shadow-inner' : 'text-slate-400'
                }`}
              >
                3. Est / Quote / Paid
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('discovery');
                  if (isLockedProject) {
                    setActionMessage('Unlock to use AI Discovery');
                    openUnlockPaywall();
                  }
                }}
                className={`flex-1 min-w-[28%] min-h-[48px] py-3 text-[10px] font-black uppercase tracking-widest rounded-[20px] transition-all duration-300 ${
                  activeTab === 'discovery' ? 'bg-[#0f150f] text-[#3ddb6f] shadow-inner' : 'text-slate-400'
                }`}
              >
                AI Discovery
              </button>
            </div>
            <section className="bg-[#111810] border border-[#1f2e1f] rounded-[24px] p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">
                Auto · indicative band ({room.type})
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-[#0f150f] border border-[#1f2e1f] p-3">
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Floor</p>
                  <p className="text-base font-black text-slate-100">{roomCalculations.floorArea} m²</p>
                </div>
                <div className="rounded-xl bg-[#0f150f] border border-[#1f2e1f] p-3">
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Walls</p>
                  <p className="text-base font-black text-slate-100">{roomCalculations.wallArea} m²</p>
                </div>
                <div className="rounded-xl bg-[#0f150f] border border-[#1f2e1f] p-3">
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Low</p>
                  <p className="text-base font-black text-[#3ddb6f]">${roomEstimate.low.toLocaleString()}</p>
                </div>
                <div className="rounded-xl bg-[#0f150f] border border-[#1f2e1f] p-3">
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">High</p>
                  <p className="text-base font-black text-emerald-400">${roomEstimate.high.toLocaleString()}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
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
              <p className="text-[8px] text-slate-500 mt-2 leading-snug flex flex-wrap items-center gap-2">
                <span>Source:</span>
                {room.pricingV1?.source === 'rules' ? (
                  <span className="rounded-md border border-[#1f2e1f] bg-[#0f150f] px-1.5 py-0.5 text-[7px] font-black uppercase tracking-widest text-slate-400">
                    {PRICING_SOURCE_V1_LABEL}
                  </span>
                ) : (
                  <span className="rounded-md border border-[#1f2e1f] bg-[#0f150f] px-1.5 py-0.5 text-[7px] font-black uppercase tracking-widest text-slate-500">
                    {PRICING_SOURCE_AREA_LABEL}
                  </span>
                )}
              </p>
              <p className="text-[8px] text-slate-500 mt-1.5 leading-relaxed">{ESTIMATE_DISCLAIMER}</p>
              <p className="text-[7px] text-slate-500/70 mt-1 leading-relaxed">
                Indicative estimate only · Based on your room inputs · Live calculation
              </p>
              <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                <div className="rounded-lg border border-[#1f2e1f] bg-[#0f150f] p-1.5">
                  <p className="text-[6px] font-black uppercase text-slate-500 flex items-center justify-center gap-1"><FileText size={16} className="opacity-70" />Estimate (mid)</p>
                  <p className="text-[10px] font-black text-slate-200 tabular-nums">${Math.round(estMidSummary).toLocaleString()}</p>
                </div>
                <div className="rounded-lg border border-[#1f2e1f] bg-[#0f150f] p-1.5">
                  <p className="text-[6px] font-black uppercase text-slate-500 flex items-center justify-center gap-1"><Receipt size={16} className="opacity-70" />Active baseline</p>
                  <p className="text-[10px] font-black text-slate-200 tabular-nums">${Math.round(activeBaselineSummary).toLocaleString()}</p>
                </div>
                <div className="rounded-lg border border-[#1f2e1f] bg-[#0f150f] p-1.5">
                  <p className="text-[6px] font-black uppercase text-slate-500 flex items-center justify-center gap-1"><Hammer size={16} className="opacity-70" />Actual paid</p>
                  <p className="text-[10px] font-black text-[#3ddb6f] tabular-nums">${Math.round(actualManualSummary).toLocaleString()}</p>
                </div>
              </div>
              <p className="text-[8px] text-slate-500 mt-1 leading-relaxed">
                Remaining vs {roomHasQuotesInPlay ? 'quotes' : 'AI estimate'}: ${Math.abs(Math.round(remainingSummary)).toLocaleString()}
              </p>
              <div className="mt-2 rounded-xl border border-[#1f2e1f] bg-[#111810] px-2 py-2 space-y-1">
                <p className="text-[7px] font-black uppercase tracking-widest text-slate-500">Required before closeout</p>
                {closeoutChecklist.map(item => (
                  <p key={item.label} className={`text-[8px] font-black uppercase tracking-widest ${item.ok ? 'text-[#3ddb6f]' : 'text-amber-200'}`}>
                    {item.ok ? 'OK' : 'Missing'} · {item.label}
                  </p>
                ))}
              </div>
              <p className="text-[8px] text-slate-500">
                Baseline ${Math.round(activeBaselineSummary).toLocaleString()} · Quoted ${Math.round(quotedSummary).toLocaleString()} · Paid ${Math.round(actualManualSummary).toLocaleString()} · Variance {actualManualSummary - activeBaselineSummary > 0 ? '+' : ''}${Math.round(actualManualSummary - activeBaselineSummary).toLocaleString()}
              </p>
              <button
                type="button"
                onClick={() => { window.location.hash = `#/project/${encodeURIComponent(projectId)}/estimate`; }}
                className="mt-2 w-full py-2.5 rounded-xl border border-[#1f2e1f] bg-[#0f150f] text-[9px] font-black uppercase tracking-widest text-slate-200"
              >
                Open project estimate summary
              </button>
              <button
                type="button"
                onClick={() => { window.location.hash = `#/project/${projectId}/walkthrough/${roomId}`; }}
                className="mt-2 w-full min-h-[48px] py-3 rounded-xl border border-[#3ddb6f]/40 bg-[#0f150f] text-[10px] font-black uppercase tracking-widest text-[#3ddb6f]"
              >
                Walkthrough mode
              </button>
            </section>
          </div>

        {activeTab === 'plan' ? (
          <div className="space-y-10 pb-56">
            {dimMissing && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-950/25 px-4 py-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-amber-200/90">Set room dimensions</p>
                <p className="text-xs text-amber-100/85 mt-1">
                  Add length, width, and height so the shell area drives the placeholder estimate band.
                </p>
              </div>
            )}
            <section>
              <div className="flex justify-between items-center mb-6 px-1">
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Step 1: Visual Discovery</h4>
                 <span className="text-[10px] font-black text-[#3ddb6f] uppercase tracking-widest">{room.photoUrls?.length || 0} Snaps</span>
              </div>
              <div className="flex flex-wrap gap-3 mb-3 px-1">
                <button
                  type="button"
                  onClick={() => planCameraInputRef.current?.click()}
                  className="min-h-[44px] flex-1 min-w-[140px] rounded-2xl border-2 border-dashed border-[#1f2e1f] bg-[#111810] px-4 py-3 flex flex-col items-center justify-center gap-1 text-slate-300 shadow-sm active:scale-[0.98] transition-transform"
                >
                  <ICONS.Camera />
                  <span className="text-[9px] font-black uppercase tracking-widest leading-none">Take photo</span>
                </button>
                <button
                  type="button"
                  onClick={() => planGalleryInputRef.current?.click()}
                  className="min-h-[44px] flex-1 min-w-[140px] rounded-2xl border-2 border-dashed border-[#1f2e1f] bg-[#0f150f] px-4 py-3 flex flex-col items-center justify-center gap-1 text-slate-400 shadow-sm active:scale-[0.98] transition-transform"
                >
                  <Images className="w-5 h-5 opacity-80" />
                  <span className="text-[9px] font-black uppercase tracking-widest leading-none">Choose photos</span>
                </button>
                <input
                  ref={planCameraInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePlanRoomPhotos}
                />
                <input
                  ref={planGalleryInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  multiple
                  onChange={handlePlanRoomPhotos}
                />
              </div>
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                 {room.photoUrls?.map((url, i) => (
                    <img key={i} src={url} className="w-32 h-32 rounded-[40px] object-cover flex-shrink-0 border border-[#1f2e1f] shadow-sm" />
                 ))}
              </div>
            </section>

            <section>
              <div className="flex justify-between items-center mb-6 px-1">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Step 2: Work List</h4>
                <span className="text-[10px] font-black text-[#3ddb6f] uppercase tracking-widest">Editable</span>
              </div>
              <div className="relative">
                <div className={isLockedProject ? 'pointer-events-none opacity-50 blur-[1px]' : ''}>
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={newScopeItem}
                      onChange={(e) => setNewScopeItem(e.target.value)}
                      placeholder="Add scope item"
                      className="flex-1 min-h-[48px] p-4 bg-[#111810] border border-[#1f2e1f] rounded-2xl outline-none font-black text-slate-100 text-sm"
                    />
                    <button onClick={addScopeItem} className="px-6 min-h-[48px] bg-[#3ddb6f] text-black rounded-2xl font-black uppercase text-[10px] tracking-widest">
                      Add
                    </button>
                  </div>
                  <div className="space-y-4">
                    {(!room.intendedScope || room.intendedScope.length === 0) && (
                      <p className="px-1 text-center text-xs text-slate-500">No work list items yet. Add free-form line items, or use structured scope below.</p>
                    )}
                    {room.intendedScope?.map(item => (
                      <div key={item} className="bg-[#111810] border border-[#1f2e1f] p-7 rounded-[32px] shadow-sm flex items-center justify-between group active:scale-[0.98] transition-all">
                        <span className="text-[14px] font-black uppercase text-slate-100 tracking-tight leading-none">{item}</span>
                        <button
                          onClick={() => removeScopeItem(item)}
                          className="px-3 py-2 rounded-xl border border-[#1f2e1f] text-[9px] font-black uppercase tracking-widest text-red-300"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                {isLockedProject && (
                  <div className="absolute inset-0 flex items-center justify-center p-4">
                    <p className="rounded-xl border border-[#3ddb6f]/40 bg-[#0f150f]/95 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[#3ddb6f] text-center">
                      Unlock to edit full room scope and selections
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Room shell (m)</h4>
              <div className="bg-[#111810] border border-[#1f2e1f] rounded-[32px] p-6 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {(['length', 'width', 'height'] as const).map(dim => (
                    <div key={dim} className="bg-[#0f150f] p-4 rounded-2xl border border-[#1f2e1f]">
                      <label className="block text-[8px] font-black text-slate-400 uppercase mb-2">{dim}</label>
                      <input
                        type="number"
                        step={0.01}
                        value={room.dimensions[dim]}
                        onChange={e => updateDimensionsField(dim, parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent font-black text-xl text-slate-100 outline-none text-center min-h-[44px]"
                        {...numberInputQuickEntryProps}
                      />
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={0.1}
                        value={room.dimensions[dim]}
                        onChange={e => updateDimensionsField(dim, parseFloat(e.target.value) || 0)}
                        className="w-full mt-2 accent-[#3ddb6f]"
                      />
                    </div>
                  ))}
                </div>
                {room.dimensions._autoConverted && (
                  <p className="text-[9px] font-bold uppercase tracking-wide text-amber-200/95 bg-amber-500/15 border border-amber-500/35 rounded-xl px-3 py-2">
                    Dimensions auto-converted from mm to metres
                  </p>
                )}
                <p className="text-[10px] text-slate-400">
                  Perimeter ≈ {room.calculations?.linearMetres ?? computeRoomCalculations(room.dimensions).linearMetres} m
                  (detail band stays pinned at the top)
                </p>
              </div>

              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1 pt-2">Structured scope</h4>
              {showEmptyScopeHint && (
                <p className="text-[9px] text-slate-500 px-1 -mt-1 mb-1 leading-relaxed">
                  No scope options selected yet—the estimate uses the {PRICING_SOURCE_AREA_LABEL} until you add selections.
                </p>
              )}
              <div className="relative bg-[#111810] border border-[#1f2e1f] rounded-[32px] p-6">
                <div className={isLockedProject ? 'pointer-events-none opacity-50 blur-[1px]' : ''}>
                  <RoomScopeForm
                    roomType={room.type}
                    values={{ ...(room.scopeInputs || {}), ...(room.scope || {}) }}
                    onPatch={patchScope}
                  />
                </div>
                {isLockedProject && (
                  <div className="absolute inset-0 flex items-center justify-center p-4">
                    <p className="rounded-xl border border-[#3ddb6f]/40 bg-[#0f150f]/95 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[#3ddb6f] text-center">
                      Unlock to edit full room scope and selections
                    </p>
                  </div>
                )}
              </div>
              <textarea
                value={room.notes || ''}
                onChange={(e) => saveNotes(e.target.value)}
                placeholder="Room notes (access, defects, urgency, exclusions...)"
                className="w-full min-h-[120px] bg-[#111810] border border-[#1f2e1f] text-slate-100 rounded-[24px] p-4 text-sm outline-none"
              />
            </section>

          </div>
        ) : activeTab === 'quotes' ? (
          <QuotesActualsTab room={room} onSave={saveRoom} />
        ) : activeTab === 'discovery' ? (
          <section className="pb-56">
            <div className="relative rounded-[32px] border border-[#1f2e1f] bg-[#111810] p-6 space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Optional inspiration</p>
              <p className="text-sm text-slate-300 leading-relaxed">
                Optional inspiration from room photos. Use AI Discovery to suggest ideas before you lock scope and pricing.
              </p>
              <div className={isLockedProject ? 'pointer-events-none opacity-50 blur-[1px]' : ''}>
                <button
                  type="button"
                  onClick={() => { window.location.hash = `#/insights?projectId=${projectId}&roomId=${roomId}`; }}
                  className="w-full min-h-[56px] p-5 bg-[#3ddb6f] text-black rounded-[24px] font-black uppercase text-xs tracking-[0.12em] flex items-center justify-center gap-4 shadow-2xl shadow-emerald-900/40 active:scale-95 transition-all"
                >
                  <ICONS.Sparkles /> Open AI Discovery
                </button>
              </div>
              {isLockedProject && (
                <div className="absolute inset-0 z-10 rounded-[32px] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="max-w-xs text-center space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-200">
                      Unlock to use AI Discovery inspiration
                    </p>
                    {showPaywalls ? (
                      <button
                        type="button"
                        onClick={openUnlockPaywall}
                        className="px-5 py-2.5 rounded-2xl bg-[#3ddb6f] text-black text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-900/40 transition-transform duration-200 hover:scale-[1.02]"
                      >
                        Unlock for $69
                      </button>
                    ) : (
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">
                        Locked on this project
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : (
          <div className="space-y-8 pb-32 animate-in fade-in duration-500">
             <div className="bg-slate-900 text-white p-12 rounded-[56px] shadow-2xl space-y-12">
                <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-4 opacity-80">Total Exposure</p>
                   <p className="text-5xl font-black tracking-tighter leading-none">${totalExposure.toLocaleString()}–${(totalExposure * 1.2).toLocaleString()}</p>
                </div>
                <div className="grid grid-cols-2 gap-12 border-t border-white/10 pt-12">
                   <div>
                      <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-3 leading-none">Paid to date</p>
                      <p className="text-3xl font-black tracking-tighter">${paidToDate.toLocaleString()}</p>
                   </div>
                   <div>
                      <p className="text-[10px] font-black text-amber-400 uppercase tracking-[0.2em] mb-3 leading-none">Balance owing</p>
                      <p className="text-3xl font-black tracking-tighter">${(totalExposure - paidToDate).toLocaleString()}</p>
                   </div>
                </div>
             </div>

             <div className="space-y-5">
               {room.expenses.map(exp => {
                 const quote = exp.quoteAmount || exp.amount || 0;
                 const paid = exp.paidAmount || 0;
                 const isPaidFull = quote > 0 && paid >= quote;
                 const hasPartial = paid > 0 && paid < quote;
                 const hasQuote = exp.status === 'Quote' || exp.status === 'Partial' || exp.status === 'Paid';

                 if (!hasQuote) {
                   return (
                    <div key={exp.id} onClick={() => setSelectedExpenseId(exp.id)} className="bg-[#111810] border border-[#1f2e1f] p-8 rounded-[44px] flex items-center gap-8 shadow-sm cursor-pointer active:scale-95 transition-all">
                      <div className="w-14 h-14 bg-[#0f150f] rounded-3xl flex items-center justify-center text-amber-500 shadow-inner"><AlertTriangle size={18} strokeWidth={2} /></div>
                        <div className="flex-1">
                           <h5 className="text-[13px] font-black uppercase text-slate-100 tracking-tight leading-tight">{exp.description.toUpperCase()}</h5>
                           <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-2 block">Needs Quote</span>
                        </div>
                        <div className="text-right">
                           <p className="text-[14px] font-black text-slate-400 tracking-tighter">${(exp.amount * 0.9).toLocaleString()}–${(exp.amount * 1.1).toLocaleString()}</p>
                        </div>
                     </div>
                   );
                 }

                 const statusBg = isPaidFull ? 'bg-emerald-600' : hasPartial ? 'bg-orange-500' : 'bg-red-500';
                 const statusLabel = isPaidFull ? 'PAID FULL' : hasPartial ? 'PARTIAL' : 'UNPAID QUOTE';
                const amountOwing = Math.max(quote - paid, 0);
                const subLabel = isPaidFull ? '' : `OWING: $${amountOwing.toLocaleString()}`;
                const progressPercent = quote > 0 ? Math.min((paid / quote) * 100, 100) : 0;

                 return (
                   <div key={exp.id} onClick={() => setSelectedExpenseId(exp.id)} className={`${statusBg} p-10 rounded-[52px] text-white flex flex-col gap-4 shadow-xl shadow-slate-100 active:scale-[0.98] transition-all cursor-pointer relative overflow-hidden`}>
                      <div className="flex items-center justify-between z-10">
                        <div className="space-y-4">
                           <h5 className="text-[16px] font-black uppercase tracking-tight leading-none">{exp.description.toUpperCase()}</h5>
                           <div className="flex items-center gap-4">
                             <span className="px-4 py-1.5 bg-white/20 rounded-xl text-[10px] font-black uppercase tracking-widest">{statusLabel}</span>
                             {subLabel && <span className="text-[11px] font-bold uppercase opacity-85 tracking-tight">{subLabel}</span>}
                           </div>
                        </div>
                        <div className="text-right pl-6">
                           <p className="text-3xl font-black tracking-tighter leading-none">${quote.toLocaleString()}</p>
                        </div>
                      </div>
                      
                      {/* Visual Progress Bar on Card */}
                      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mt-2">
                        <div className="h-full bg-white transition-all duration-1000" style={{ width: `${progressPercent}%` }} />
                      </div>
                   </div>
                 );
               })}
             </div>
          </div>
        )}
        </div>

        {(activeTab === 'plan' || activeTab === 'quotes') && (
          <div className="pointer-events-none fixed bottom-16 left-1/2 z-[8] w-full max-w-[448px] -translate-x-1/2 px-4 max-h-[38vh] overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div
              className="pointer-events-auto space-y-2 rounded-[24px] border border-[#1f2e1f] bg-[#111810]/95 p-3 shadow-xl backdrop-blur"
              style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
            >
              <p className="text-center text-[8px] font-bold uppercase tracking-widest text-slate-500">
                {lastSavedAt ? `Saved ${lastSavedAt} · ${lastSavedAction}` : "Saves as you go - tap below when you're done with this room"}
              </p>
              <button
                type="button"
                onClick={handleSaveRoomAndReturn}
                className="w-full min-h-[56px] rounded-2xl bg-[#3ddb6f] py-4 text-[11px] font-black uppercase tracking-[0.14em] text-black shadow-lg shadow-emerald-900/30"
              >
                Save room & return to project
              </button>
              <p className="text-center text-[8px] text-slate-500 leading-relaxed px-0.5">{ESTIMATE_DISCLAIMER}</p>
            </div>
          </div>
        )}

        {/* Expense Detail Modal with "Partial Payment Spot" */}
      {selectedExpenseId && selectedExpense && (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-end justify-center px-4 animate-in fade-in duration-300">
          <div className="bg-[#111810] border border-[#1f2e1f] w-full max-w-md rounded-t-[56px] p-10 animate-in slide-in-from-bottom duration-500 shadow-2xl max-h-[95vh] overflow-y-auto overscroll-contain scrollbar-hide pb-20" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="w-14 h-1.5 bg-[#1f2e1f] rounded-full mx-auto mb-10" />
            
            <header className="flex justify-between items-start mb-10">
              <div>
                <h3 className="text-2xl font-black text-slate-100 tracking-tighter uppercase leading-none">{selectedExpense.description}</h3>
                <div className="flex items-center gap-3 mt-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{selectedExpense.category}</span>
                  <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${selectedExpense.status === 'Paid' ? 'bg-emerald-100 text-emerald-600' : selectedExpense.status === 'Partial' ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-600'}`}>{selectedExpense.status}</span>
                </div>
              </div>
              <button onClick={() => setSelectedExpenseId(null)} className="p-4 bg-[#0f150f] rounded-2xl text-slate-400"><ICONS.ArrowLeft /></button>
            </header>

            {/* Visual Progress Circle/Bar for Partial Payments */}
            <div className="mb-10 bg-slate-900 rounded-[44px] p-8 text-white">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Paid</p>
                  <p className="text-3xl font-black text-emerald-400 tracking-tighter leading-none">${(selectedExpense.paidAmount || 0).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Remaining</p>
                  <p className="text-2xl font-black tracking-tighter leading-none">${Math.max((selectedExpense.quoteAmount || selectedExpense.amount || 0) - (selectedExpense.paidAmount || 0), 0).toLocaleString()}</p>
                </div>
              </div>
              <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${Math.min(((selectedExpense.paidAmount || 0) / (selectedExpense.quoteAmount || selectedExpense.amount || 1)) * 100, 100)}%` }} />
              </div>
            </div>

            <div className="space-y-10">
              {actionMessage && (
                 <div className="rounded-2xl border border-[#1f2e1f] bg-[#0f150f] px-5 py-3 text-[10px] font-black uppercase tracking-widest text-[#3ddb6f]">
                  {actionMessage}
                </div>
              )}
              {/* Quote Snaps Area */}
              <section>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Firm Quote / Invoice Capture</h4>
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                   <button onClick={() => quoteFileInputRef.current?.click()} className="w-24 h-24 border-2 border-dashed border-slate-200 rounded-[28px] flex flex-col items-center justify-center gap-2 text-slate-400 bg-slate-50/50 flex-shrink-0">
                      <ICONS.Camera />
                      <span className="text-[8px] font-black uppercase tracking-widest leading-none">Add Snap</span>
                   </button>
                   {selectedExpense.quotePhotoUrls?.map((url, i) => (
                      <img key={i} src={url} className="w-24 h-24 rounded-[28px] object-cover flex-shrink-0 border border-slate-100" />
                   ))}
                   <input type="file" ref={quoteFileInputRef} className="hidden" accept="image/*" capture="environment" onChange={(e) => handlePhotoUpload(e, 'quotePhotoUrls')} />
                </div>
              </section>

              {/* Partial Payment Spot - NEW SECTION FOR RECEIPTS */}
              <section className="p-8 bg-slate-50/50 rounded-[44px] border border-slate-100">
                <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-6">Partial Payment Receipts</h4>
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                   <button onClick={() => receiptFileInputRef.current?.click()} className="w-24 h-24 border-2 border-dashed border-emerald-100 rounded-[28px] flex flex-col items-center justify-center gap-2 text-emerald-400 bg-white flex-shrink-0">
                      <ICONS.Camera />
                      <span className="text-[8px] font-black uppercase tracking-widest leading-none">Add Receipt</span>
                   </button>
                   {selectedExpense.paymentPhotoUrls?.map((url, i) => (
                      <img key={i} src={url} className="w-24 h-24 rounded-[28px] object-cover flex-shrink-0 border border-emerald-50 shadow-sm" />
                   ))}
                   <input type="file" ref={receiptFileInputRef} className="hidden" accept="image/*" capture="environment" onChange={(e) => handlePhotoUpload(e, 'paymentPhotoUrls')} />
                </div>
              </section>

              {/* Input Spot: RECORD PARTIAL PAYMENT */}
              <section className="space-y-6">
                <div className="bg-[#111810] border-2 border-[#1f2e1f] p-8 rounded-[44px] shadow-sm">
                  <p className="text-[11px] font-black text-emerald-600 uppercase tracking-widest mb-5">Record Partial Payment</p>
                  <div className="mb-4 flex flex-wrap gap-2">
                    <button onClick={() => setPaymentAmount(String(Number((selectedRemaining * 0.25).toFixed(2))))} className="px-3 py-2 rounded-xl border border-[#1f2e1f] text-[9px] font-black uppercase tracking-widest text-slate-300">25%</button>
                    <button onClick={() => setPaymentAmount(String(Number((selectedRemaining * 0.5).toFixed(2))))} className="px-3 py-2 rounded-xl border border-[#1f2e1f] text-[9px] font-black uppercase tracking-widest text-slate-300">50%</button>
                    <button onClick={() => setPaymentAmount(String(selectedRemaining))} className="px-3 py-2 rounded-xl border border-[#1f2e1f] text-[9px] font-black uppercase tracking-widest text-slate-300">100% Remaining</button>
                  </div>
                  <div className="flex gap-4">
                    <div className="relative flex-1">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">$</span>
                      <input 
                        type="number" 
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder="0.00" 
                        className="w-full pl-8 p-5 bg-[#0f150f] border border-[#1f2e1f] rounded-2xl outline-none font-black text-slate-100 text-xl" 
                        {...numberInputQuickEntryProps}
                      />
                    </div>
                    <button onClick={handleRecordPayment} className="px-10 bg-emerald-600 text-white rounded-[24px] font-black uppercase text-[11px] tracking-widest shadow-2xl shadow-emerald-100 active:scale-95 transition-all">Record</button>
                  </div>
                </div>

                <div className="bg-[#111810] border border-[#1f2e1f] p-8 rounded-[44px] shadow-sm">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-5">Finalize/Update Quote</p>
                  <div className="mb-4 flex flex-wrap gap-2">
                    <button onClick={() => setInvoiceAmount(String(selectedExpense?.estimateAmount || selectedExpense?.amount || 0))} className="px-3 py-2 rounded-xl border border-[#1f2e1f] text-[9px] font-black uppercase tracking-widest text-slate-300">Set = Estimate</button>
                    <button onClick={() => setInvoiceAmount(String(Number(((selectedExpense?.estimateAmount || selectedExpense?.amount || 0) * 1.1).toFixed(2))))} className="px-3 py-2 rounded-xl border border-[#1f2e1f] text-[9px] font-black uppercase tracking-widest text-slate-300">+10%</button>
                    <button onClick={() => setInvoiceAmount(String(Number(((selectedExpense?.estimateAmount || selectedExpense?.amount || 0) * 0.9).toFixed(2))))} className="px-3 py-2 rounded-xl border border-[#1f2e1f] text-[9px] font-black uppercase tracking-widest text-slate-300">-10%</button>
                  </div>
                  <div className="flex gap-4">
                    <input 
                      type="number" 
                      value={invoiceAmount}
                      onChange={(e) => setInvoiceAmount(e.target.value)}
                      placeholder="Total Quote ($)" 
                      className="flex-1 p-5 bg-[#0f150f] border border-[#1f2e1f] rounded-2xl outline-none font-black text-slate-100" 
                      {...numberInputQuickEntryProps}
                    />
                    <button onClick={handleUpdateQuote} className="px-10 bg-slate-900 text-white rounded-[24px] font-black uppercase text-[11px] tracking-widest">Set</button>
                  </div>
                </div>
              </section>

              {selectedExpense.installments && selectedExpense.installments.length > 0 && (
                <section className="bg-slate-50/30 p-8 rounded-[40px]">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Payment History</p>
                  <div className="space-y-5">
                    {selectedExpense.installments.map((inst, i) => (
                      <div key={i} className="flex justify-between items-center bg-[#0f150f] p-5 rounded-2xl shadow-sm border border-[#1f2e1f]">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-black text-slate-900 uppercase">Milestone Payment</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">{inst.date}</span>
                        </div>
                        <span className="text-[14px] font-black text-emerald-500">+ ${inst.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div className="mt-14 flex flex-col gap-4">
              <button onClick={() => deleteExpense(selectedExpense.id)} className="text-red-500 font-black text-[11px] uppercase tracking-widest py-4 hover:opacity-70 transition-opacity">Delete Expense Item</button>
              <button onClick={() => { setSelectedExpenseId(null); setActionMessage(null); }} className="w-full p-10 bg-slate-900 text-white rounded-[44px] font-black uppercase text-sm tracking-[0.2em] shadow-2xl active:scale-95 transition-all">Close & Save</button>
            </div>
          </div>
        </div>
      )}
      <PaywallModal
        isOpen={showPaywalls && showPaywall}
        onClose={() => setShowPaywall(false)}
        onUnlock={() => {
          unlockProject(project.id);
          const refreshed = getProjectById(projectId);
          if (refreshed) {
            setProject(refreshed);
            const refreshedRoom = refreshed.rooms.find(x => x.id === roomId);
            if (refreshedRoom) setRoom(refreshedRoom);
          }
          setShowPaywall(false);
        }}
        projectId={project.id}
        clientBudget={project.totalBudget}
        estimateMid={estMidSummary}
      />
      </>
    </Layout>
  );
};

export default RoomDetails;

import type { ActualCostItem, Project, QuoteItem, QuotePayment, Room } from '../types';
import { calculateRoomEstimate } from './calculateRoomEstimate';
import { computeIndicativeEstimate } from './indicativeEstimate';
import { computeRoomCalculations } from './roomCalculations';
import { sanitizeDimensions } from './safePersistence';

function roomEstimateBand(room: Room) {
  if (room.estimate) return room.estimate;
  try {
    const dims = sanitizeDimensions(room.dimensions);
    const calcs = room.calculations || computeRoomCalculations(dims);
    return calculateRoomEstimate({ ...room, dimensions: dims, calculations: calcs }).band;
  } catch {
    const dims = sanitizeDimensions(room.dimensions);
    const calcs = computeRoomCalculations(dims);
    return computeIndicativeEstimate({ ...room, dimensions: dims, calculations: calcs });
  }
}

/** Midpoint of indicative band (for single-number comparisons). */
export function roomEstimateMid(room: Room): number {
  const b = roomEstimateBand(room);
  if (Number.isFinite(b.mid) && b.mid > 0) return b.mid;
  return (b.low + b.high) / 2;
}

export function sumQuotesInPlay(quoteItems: QuoteItem[] | undefined): number {
  if (!quoteItems?.length) return 0;
  return quoteItems
    .filter(q => q.status === 'received' || q.status === 'accepted')
    .reduce((s, q) => s + Math.max(0, q.quoteAmount), 0);
}

export type BudgetSource = 'estimate' | 'quote';

export function hasRoomQuotesInPlay(room: Room): boolean {
  return sumQuotesInPlay(room.quoteItems) > 0;
}

export function roomBudgetSource(room: Room): BudgetSource {
  return hasRoomQuotesInPlay(room) ? 'quote' : 'estimate';
}

/** Active room baseline: quote once real quotes exist, otherwise AI indicative estimate. */
export function roomBudgetBaselineTotal(room: Room): number {
  return roomBudgetSource(room) === 'quote' ? roomQuotedCompareTotal(room) : roomEstimateMid(room);
}

export function sumQuotesAccepted(quoteItems: QuoteItem[] | undefined): number {
  if (!quoteItems?.length) return 0;
  return quoteItems
    .filter(q => q.status === 'accepted')
    .reduce((s, q) => s + Math.max(0, q.quoteAmount), 0);
}

/** For variance: prefer accepted total; else quotes in play (received+accepted). */
export function roomQuotedCompareTotal(room: Room): number {
  const acc = sumQuotesAccepted(room.quoteItems);
  if (acc > 0) return acc;
  return sumQuotesInPlay(room.quoteItems);
}

export function sumActualPaidItems(items: ActualCostItem[] | undefined): number {
  if (!items?.length) return 0;
  return items.reduce((s, a) => s + Math.max(0, a.amountPaid), 0);
}

export function sumQuotePayments(quote: QuoteItem | undefined): number {
  if (!quote?.payments?.length) return 0;
  return quote.payments
    .filter(p => p.status === 'paid')
    .reduce((s, p) => s + Math.max(0, p.amount), 0);
}

export function sumPaymentsByType(quoteItems: QuoteItem[] | undefined, type: QuotePayment['paymentType']): number {
  if (!quoteItems?.length) return 0;
  return quoteItems.reduce((sum, q) => {
    const sub = (q.payments || [])
      .filter(p => p.status === 'paid' && p.paymentType === type)
      .reduce((s, p) => s + Math.max(0, p.amount), 0);
    return sum + sub;
  }, 0);
}

export function roomPaidFromQuotes(room: Room): number {
  if (!room.quoteItems?.length) return 0;
  return room.quoteItems.reduce((s, q) => s + sumQuotePayments(q), 0);
}

/** Preferred paid total: quote payments + legacy actual paid items. */
export function roomActualPaidTotal(room: Room): number {
  return roomPaidFromQuotes(room) + sumActualPaidItems(room.actualCostItems);
}

export function roomRemainingToPay(room: Room): number {
  return roomQuotedCompareTotal(room) - roomActualPaidTotal(room);
}

export function projectEstimateMidTotal(project: Project): number {
  return project.rooms.reduce((s, r) => s + roomEstimateMid(r), 0);
}

export type ProjectBudgetSourceSummary = {
  estimateRooms: number;
  quoteRooms: number;
  mode: 'estimate-only' | 'quote-only' | 'hybrid';
  activeBaselineTotal: number;
};

export function projectBudgetSourceSummary(project: Project): ProjectBudgetSourceSummary {
  const summary = project.rooms.reduce(
    (acc, room) => {
      if (roomBudgetSource(room) === 'quote') {
        acc.quoteRooms += 1;
      } else {
        acc.estimateRooms += 1;
      }
      acc.activeBaselineTotal += roomBudgetBaselineTotal(room);
      return acc;
    },
    { estimateRooms: 0, quoteRooms: 0, activeBaselineTotal: 0 }
  );

  const mode: ProjectBudgetSourceSummary['mode'] =
    summary.quoteRooms === 0
      ? 'estimate-only'
      : summary.estimateRooms === 0
        ? 'quote-only'
        : 'hybrid';

  return { ...summary, mode };
}

export function projectQuotedCompareTotal(project: Project): number {
  return project.rooms.reduce((s, r) => s + roomQuotedCompareTotal(r), 0);
}

export function projectAcceptedQuotesTotal(project: Project): number {
  return project.rooms.reduce((s, r) => s + sumQuotesAccepted(r.quoteItems), 0);
}

export function projectActualManualTotal(project: Project): number {
  return project.rooms.reduce((s, r) => s + roomActualPaidTotal(r), 0);
}

export function projectQuotesInPlayTotal(project: Project): number {
  return project.rooms.reduce((s, r) => s + sumQuotesInPlay(r.quoteItems), 0);
}

export type CategoryRollup = { category: string; amount: number };
export type BudgetBaseline = 'client-budget' | 'quote' | 'estimate';

export type BudgetStatus = {
  status: 'on_budget' | 'over_budget';
  amount: number;
  label: string;
  helper: string;
  basis: 'Actual paid' | 'Estimate' | 'Quoted' | 'Remaining' | 'Tracking';
  baseline: BudgetBaseline;
  baselineLabel: 'Client Budget' | 'Quote' | 'Estimate';
  baselineAmount: number;
  actualPaid: number;
  estimateMid: number;
  varianceAmount: number;
  isOverBudget: boolean;
  statusTitle: 'Over Budget' | 'On Budget';
  statusCopy: string;
  reason: 'estimate' | 'actual' | 'on-track';
};

export type DominantBudgetStatus = 'On track' | 'At risk' | 'Over';

export function deriveDominantBudgetStatus(status: BudgetStatus): DominantBudgetStatus {
  if (status.isOverBudget) return 'Over';
  const baseline = Math.max(0, status.baselineAmount || 0);
  if (baseline > 0 && status.varianceAmount <= baseline * 0.1) return 'At risk';
  return 'On track';
}

export type BudgetDataGaps = {
  missingQuote: boolean;
  missingEstimate: boolean;
  missingPayments: boolean;
};

export function detectBudgetDataGaps(input: {
  quoted: number;
  estimateMid: number;
  actualPaid: number;
}): BudgetDataGaps {
  return {
    missingQuote: !(input.quoted > 0),
    missingEstimate: !(input.estimateMid > 0),
    missingPayments: !(input.actualPaid > 0),
  };
}

export function resolveBudgetStatus(input: {
  clientBudget?: number;
  quoted: number;
  estimateMid: number;
  actualPaid: number;
  activeBaseline?: number;
  activeBaselineLabel?: 'Quote' | 'Estimate' | 'Mixed (quotes + estimate)';
}): BudgetStatus {
  const clientBudget = Math.max(0, input.clientBudget || 0);
  const quoted = Math.max(0, input.quoted || 0);
  const estimateMid = Math.max(0, input.estimateMid || 0);
  const actualPaid = Math.max(0, input.actualPaid || 0);
  const activeBaseline = Math.max(0, input.activeBaseline ?? (quoted > 0 ? quoted : estimateMid));
  const activeBaselineLabel = input.activeBaselineLabel ?? (quoted > 0 ? 'Quote' : 'Estimate');

  if (clientBudget > 0) {
    let varianceAmount = 0;
    let isOverBudget = false;
    let reason: BudgetStatus['reason'] = 'on-track';
    let basis: BudgetStatus['basis'] = 'Remaining';

    if (actualPaid > clientBudget) {
      isOverBudget = true;
      varianceAmount = Math.round(actualPaid - clientBudget);
      reason = 'actual';
      basis = 'Actual paid';
    } else if (activeBaseline > clientBudget) {
      isOverBudget = true;
      varianceAmount = Math.round(activeBaseline - clientBudget);
      reason = activeBaselineLabel === 'Estimate' ? 'estimate' : 'actual';
      basis = activeBaselineLabel === 'Estimate' ? 'Estimate' : 'Quoted';
    } else {
      isOverBudget = false;
      varianceAmount = Math.round(clientBudget - Math.max(actualPaid, activeBaseline));
      reason = 'on-track';
      basis = 'Remaining';
    }

    const label = isOverBudget
      ? `Over Budget · $${varianceAmount.toLocaleString()} above client budget`
      : `On Budget · $${varianceAmount.toLocaleString()} remaining`;
    const helper = isOverBudget ? `Based on ${basis}` : 'Baseline: Client Budget';

    return {
      status: isOverBudget ? 'over_budget' : 'on_budget',
      amount: varianceAmount,
      label,
      helper,
      basis,
      baseline: 'client-budget',
      baselineLabel: 'Client Budget',
      baselineAmount: clientBudget,
      actualPaid,
      estimateMid,
      varianceAmount,
      isOverBudget,
      statusTitle: isOverBudget ? 'Over Budget' : 'On Budget',
      statusCopy: label,
      reason,
    };
  }

  const baseline: BudgetBaseline = activeBaselineLabel === 'Estimate' ? 'estimate' : 'quote';
  const baselineLabel: BudgetStatus['baselineLabel'] = activeBaselineLabel === 'Estimate' ? 'Estimate' : 'Quote';
  const baselineAmount = activeBaseline;
  const varianceAmount = Math.abs(Math.round(actualPaid - baselineAmount));
  const isOverBudget = actualPaid > baselineAmount;
  const statusTitle: BudgetStatus['statusTitle'] = isOverBudget ? 'Over Budget' : 'On Budget';
  const statusCopy =
    baseline === 'quote'
      ? isOverBudget
        ? `Over Budget · $${varianceAmount.toLocaleString()} over quote`
        : `On Budget · $${varianceAmount.toLocaleString()} under quote`
      : isOverBudget
        ? `Over Budget · $${varianceAmount.toLocaleString()} over estimate`
        : actualPaid === 0 && quoted <= 0 && estimateMid > 0
          ? 'Tracking against estimate'
          : `On Budget · $${varianceAmount.toLocaleString()} under estimate`;
  const basis: BudgetStatus['basis'] = baseline === 'quote' ? (isOverBudget ? 'Actual paid' : 'Remaining') : (actualPaid === 0 && quoted <= 0 ? 'Tracking' : isOverBudget ? 'Actual paid' : 'Remaining');
  const helper = `Baseline: ${baselineLabel}`;

  return {
    status: isOverBudget ? 'over_budget' : 'on_budget',
    amount: varianceAmount,
    label: statusCopy,
    helper,
    basis,
    baseline,
    baselineLabel,
    baselineAmount,
    actualPaid,
    estimateMid,
    varianceAmount,
    isOverBudget,
    statusTitle,
    statusCopy,
    reason: isOverBudget ? 'actual' : 'on-track',
  };
}

export function projectBudgetStatus(project: Project): BudgetStatus {
  const sourceSummary = projectBudgetSourceSummary(project);
  const activeBaselineLabel: 'Quote' | 'Estimate' | 'Mixed (quotes + estimate)' =
    sourceSummary.mode === 'quote-only'
      ? 'Quote'
      : sourceSummary.mode === 'estimate-only'
        ? 'Estimate'
        : 'Mixed (quotes + estimate)';
  return resolveBudgetStatus({
    clientBudget: project.totalBudget,
    quoted: projectQuotedCompareTotal(project),
    estimateMid: projectEstimateMidTotal(project),
    actualPaid: projectActualManualTotal(project),
    activeBaseline: sourceSummary.activeBaselineTotal,
    activeBaselineLabel,
  });
}

export function projectsBudgetStatus(projects: Project[]): BudgetStatus {
  return resolveBudgetStatus({
    clientBudget: projects.reduce((s, p) => s + Math.max(0, p.totalBudget || 0), 0),
    quoted: projects.reduce((s, p) => s + projectQuotedCompareTotal(p), 0),
    estimateMid: projects.reduce((s, p) => s + projectEstimateMidTotal(p), 0),
    actualPaid: projects.reduce((s, p) => s + projectActualManualTotal(p), 0),
  });
}

export function aggregateActualsByCategory(project: Project): CategoryRollup[] {
  const map = new Map<string, number>();
  for (const room of project.rooms) {
    for (const q of room.quoteItems || []) {
      for (const p of q.payments || []) {
        if (p.status !== 'paid') continue;
        const key = (q.category || 'Other').trim() || 'Other';
        map.set(key, (map.get(key) || 0) + Math.max(0, p.amount));
      }
    }
    for (const a of room.actualCostItems || []) {
      const key = (a.category || 'Other').trim() || 'Other';
      map.set(key, (map.get(key) || 0) + Math.max(0, a.amountPaid));
    }
  }
  return Array.from(map.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function aggregateActualsByCategoryProjects(projects: Project[]): CategoryRollup[] {
  const map = new Map<string, number>();
  for (const project of projects) {
    for (const room of project.rooms) {
      for (const q of room.quoteItems || []) {
        for (const p of q.payments || []) {
          if (p.status !== 'paid') continue;
          const key = (q.category || 'Other').trim() || 'Other';
          map.set(key, (map.get(key) || 0) + Math.max(0, p.amount));
        }
      }
      for (const a of room.actualCostItems || []) {
        const key = (a.category || 'Other').trim() || 'Other';
        map.set(key, (map.get(key) || 0) + Math.max(0, a.amountPaid));
      }
    }
  }
  return Array.from(map.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function projectRemainingToPayTotal(project: Project): number {
  return projectQuotedCompareTotal(project) - projectActualManualTotal(project);
}

export function projectsRemainingToPayTotal(projects: Project[]): number {
  return projects.reduce((sum, p) => sum + projectRemainingToPayTotal(p), 0);
}

export function projectsPaymentsByType(projects: Project[], type: QuotePayment['paymentType']): number {
  return projects.reduce((sum, project) => {
    return sum + project.rooms.reduce((roomSum, room) => roomSum + sumPaymentsByType(room.quoteItems, type), 0);
  }, 0);
}

export function countRoomsWithOutstandingBalance(projects: Project[]): number {
  return projects.reduce((sum, project) => {
    return sum + project.rooms.filter(r => roomRemainingToPay(r) > 0).length;
  }, 0);
}

export function formatVariance(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}$${Math.round(value).toLocaleString()}`;
}

import React, { useEffect, useState } from 'react';
import { Activity, Download, FileText, Receipt, TrendingDown, TrendingUp } from 'lucide-react';
import Layout from '../components/Layout';
import PaywallModal from '../components/PaywallModal';
import { ESTIMATE_DISCLAIMER, PRICING_SOURCE_AREA_LABEL, PRICING_SOURCE_V1_LABEL } from '../constants';
import { Project, Room } from '../types';
import { getProjectById, loadProjects, unlockProject } from '../store/projectStore';
import { computeIndicativeEstimate } from '../utils/indicativeEstimate';
import { aggregateProjectTradeBreakdown } from '../utils/calculateRoomEstimate';
import { computeRoomCalculations } from '../utils/roomCalculations';
import { sanitizeDimensions } from '../utils/safePersistence';
import {
  aggregateActualsByCategory,
  deriveDominantBudgetStatus,
  formatVariance,
  projectActualManualTotal,
  projectBudgetStatus,
  projectEstimateMidTotal,
  projectQuotedCompareTotal,
  roomActualPaidTotal,
  roomEstimateMid,
  roomQuotedCompareTotal,
} from '../utils/budgetAggregates';

const ZORVO_ACCENT = '#3ddb6f';

/** Matches ProjectEstimateSummary room row baseline vs paid variance. */
function roomEstimateSpendStatus(room: Room): 'UNDER ESTIMATE' | 'OVER' | 'ON TRACK' {
  const baseline = Math.max(roomQuotedCompareTotal(room), roomEstimateMid(room));
  const paid = roomActualPaidTotal(room);
  const diff = paid - baseline;
  if (diff > 0) return 'OVER';
  if (diff < 0) return 'UNDER ESTIMATE';
  return 'ON TRACK';
}

interface Props {
  projectId: string;
}

const ProjectEstimateSummary: React.FC<Props> = ({ projectId }) => {
  const [project, setProject] = useState<Project | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    const p = getProjectById(projectId);
    if (p) setProject(p);
  }, [projectId]);

  if (!project) {
    return (
      <Layout title="Estimate" showBack onBack={() => { window.location.hash = '#/'; }}>
        <div className="rounded-3xl border border-[#1f2e1f] bg-[#111810] p-6 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Not found</p>
          <p className="text-sm text-slate-300">This project could not be loaded.</p>
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

  const rooms = project.rooms;
  const rows = rooms.map(room => {
    const dims = sanitizeDimensions(room.dimensions);
    const calcs = room.calculations || computeRoomCalculations(dims);
    const est = room.estimate || computeIndicativeEstimate({ ...room, dimensions: dims, calculations: calcs });
    return { room, est };
  });
  const totalLow = rows.reduce((s, r) => s + r.est.low, 0);
  const totalHigh = rows.reduce((s, r) => s + r.est.high, 0);
  const estMidProject = projectEstimateMidTotal(project);
  const quotedProj = projectQuotedCompareTotal(project);
  const actualProj = projectActualManualTotal(project);
  const budgetStatus = projectBudgetStatus(project);
  const dominantStatus = deriveDominantBudgetStatus(budgetStatus);
  const remainingProj = quotedProj - actualProj;
  const byCategory = aggregateActualsByCategory(project);
  const roomCostRollup = rows
    .map(({ room }) => ({
      label: room.name || room.type || 'Unknown',
      amount: roomActualPaidTotal(room),
    }))
    .sort((a, b) => b.amount - a.amount);
  const topRoomCategory = roomCostRollup[0]?.label || rows[0]?.room.name || 'N/A';
  const tradeProject = aggregateProjectTradeBreakdown(project);
  const generatedAt = new Date().toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
  const addressLine = [project.address?.trim(), project.postcode?.trim()].filter(Boolean).join(', ') || '—';
  const v1RoomCount = rooms.filter(r => r.pricingV1?.source === 'rules').length;
  const quoteRecords = rooms.reduce((sum, r) => sum + (r.quoteItems || []).length, 0);
  const paidRecords = rooms.reduce((sum, r) => sum + (r.actualCostItems || []).length + (r.quoteItems || []).reduce((qSum, q) => qSum + (q.payments || []).filter(p => p.status === 'paid').length, 0), 0);
  const formatAboveBelow = (value: number) => {
    const abs = Math.abs(Math.round(value)).toLocaleString();
    if (value > 0) return `$${abs} above`;
    if (value < 0) return `$${abs} below`;
    return '$0 in line with';
  };
  const formatUnderOver = (value: number) => {
    const abs = Math.abs(Math.round(value)).toLocaleString();
    if (value > 0) return `over estimate by $${abs}`;
    if (value < 0) return `under estimate by $${abs}`;
    return 'in line with estimate';
  };
  const hasAnyUnlockedProject = loadProjects().some(p => p.isUnlocked);
  const showPaywalls = !hasAnyUnlockedProject;
  const isLockedProject = !project.isUnlocked;
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
      title="Estimate summary"
      showBack
      onBack={() => { window.location.hash = `#/project/${projectId}`; }}
      actions={(
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-xl border border-[#3ddb6f]/40 bg-[#0f150f] px-2 sm:px-3 py-2 text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-[#3ddb6f]"
          aria-label="Download PDF"
        >
          <Download size={14} strokeWidth={2.5} className="shrink-0" />
          <span className="leading-tight text-left">Download PDF</span>
        </button>
      )}
    >
      <style>
        {`
          .estimate-print-only { display: none; }
          @media print {
            @page { margin: 14mm; size: auto; }
            .estimate-screen-only { display: none !important; }
            body * { visibility: hidden !important; }
            #estimate-print-root,
            #estimate-print-root * {
              visibility: visible !important;
            }
            #estimate-print-root {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              display: block !important;
              background: #fff !important;
              color: #000 !important;
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
          }
        `}
      </style>
      <div className="estimate-screen-only">
      <div className="space-y-6 pb-28">
        <p className="text-[8px] font-bold uppercase tracking-widest text-slate-500 px-0.5">
          {PRICING_SOURCE_V1_LABEL}: scope-driven lines where present; other rooms use {PRICING_SOURCE_AREA_LABEL} split.
        </p>
        <div className="rounded-[28px] border border-amber-500/30 bg-amber-950/20 p-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-200/90">Indicative only</p>
          <p className="text-xs text-amber-100/90 font-semibold leading-relaxed">{ESTIMATE_DISCLAIMER}</p>
          <p className="text-[10px] text-amber-100/80 leading-relaxed">
            Rule-based and/or area bands. Not a schedule or contract. No GST — for planning and discussion only.
          </p>
        </div>
        <div className="rounded-2xl border border-[#1f2e1f] bg-[#111810] px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">
            {isLockedProject ? 'Detailed breakdown is locked for this project' : 'Project unlocked for detailed breakdown'}
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

        {rooms.length === 0 ? (
          <div className="text-center py-16 px-6 border-2 border-dashed border-[#1f2e1f] rounded-[40px] bg-[#111810] space-y-4">
            <p className="text-slate-400 font-bold uppercase text-[11px] tracking-widest">No rooms in this project</p>
            <p className="text-xs text-slate-500">Add rooms from the project screen, then enter dimensions and scope.</p>
            <button
              type="button"
              onClick={() => { window.location.hash = `#/project/${projectId}`; }}
              className="px-8 py-4 bg-[#3ddb6f] text-black rounded-2xl font-black uppercase text-[10px] tracking-widest"
            >
              Go to project
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[#1f2e1f] bg-[#111810] p-5">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Total low</p>
                <p className="text-2xl font-black text-[#3ddb6f] tracking-tighter">${totalLow.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-[#1f2e1f] bg-[#111810] p-5">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Total high</p>
                <p className="text-2xl font-black text-emerald-400 tracking-tighter">${totalHigh.toLocaleString()}</p>
              </div>
            </div>
            <p className="text-[8px] text-slate-500 text-center leading-relaxed px-1">{ESTIMATE_DISCLAIMER}</p>
            <p className="text-[7px] text-slate-500/70 text-center leading-relaxed px-1 -mt-1">
              Indicative estimate only · Based on your room inputs · Live calculation
            </p>

            <div className="relative rounded-[28px] border border-[#1f2e1f] bg-[#111810] p-5 space-y-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Estimate (mid) · Quoted · Actual paid · Remaining</h3>
              <p className="text-[8px] text-slate-500">Quoted uses accepted quotes first; if none are accepted, it uses received quotes. Actual paid includes payments plus legacy actual items.</p>
              <p className={`text-[9px] font-black uppercase tracking-widest ${budgetStatus.isOverBudget ? 'text-red-300' : 'text-[#3ddb6f]'}`}>
                {dominantStatus} · {budgetStatus.label}
              </p>
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">
                {budgetStatus.helper}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[9px]">
                <div>
                  <p className="text-slate-500 font-black uppercase flex items-center gap-1.5"><FileText size={16} className="opacity-70" />Estimate (mid)</p>
                  <p className="text-lg font-black text-slate-100 tabular-nums">${Math.round(estMidProject).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-slate-500 font-black uppercase flex items-center gap-1.5"><Receipt size={16} className="opacity-70" />Quoted</p>
                  <p className="text-lg font-black text-slate-200 tabular-nums">${Math.round(quotedProj).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-slate-500 font-black uppercase flex items-center gap-1.5"><Activity size={16} className="opacity-70" />Actual paid</p>
                  <p className="text-lg font-black text-[#3ddb6f] tabular-nums">${Math.round(actualProj).toLocaleString()}</p>
                </div>
                <p className="text-slate-400 col-span-2 sm:col-span-3">Remaining: ${Math.abs(Math.round(remainingProj)).toLocaleString()} · Variance (Estimate vs Quote): {formatVariance(quotedProj - estMidProject)} · Variance (Quote vs Actual): {formatVariance(actualProj - quotedProj)} · Variance (Estimate vs Actual): {formatVariance(actualProj - estMidProject)}</p>
                <p className="text-slate-500 col-span-2 sm:col-span-3">Based on {quoteRecords} quote records · {paidRecords} payment/actual records</p>
                {quoteRecords === 0 && <p className="text-amber-200 col-span-2 sm:col-span-3">Missing quotes: Not captured yet.</p>}
                {paidRecords === 0 && <p className="text-amber-200 col-span-2 sm:col-span-3">Missing payments: Not captured yet.</p>}
              </div>
              {showPaywalls && isLockedProject && lockedOverlay}
            </div>

            <div className="relative rounded-[28px] border border-[#1f2e1f] bg-[#111810] p-5 space-y-3">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Project Insights</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-xl border border-[#1f2e1f] bg-[#0f150f] px-3 py-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Variance (Estimate vs Quote)</p>
                  <p className="text-[11px] text-slate-200 mt-1">Quoted total is {formatAboveBelow(quotedProj - estMidProject)} estimate.</p>
                </div>
                <div className="rounded-xl border border-[#1f2e1f] bg-[#0f150f] px-3 py-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Variance (Quote vs Actual)</p>
                  <p className="text-[11px] text-slate-200 mt-1">Actual spend is {formatAboveBelow(actualProj - quotedProj)} quoted.</p>
                </div>
                <div className="rounded-xl border border-[#1f2e1f] bg-[#0f150f] px-3 py-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Variance (Estimate vs Actual)</p>
                  <p className={`text-[11px] mt-1 flex items-center gap-1.5 ${actualProj - estMidProject <= 0 ? 'text-[#3ddb6f]' : 'text-red-400'}`}>{actualProj - estMidProject <= 0 ? <TrendingDown size={16} /> : <TrendingUp size={16} />}You are currently {formatUnderOver(actualProj - estMidProject)}.</p>
                </div>
                <div className="rounded-xl border border-[#1f2e1f] bg-[#0f150f] px-3 py-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Top Category</p>
                  <p className="text-[11px] text-slate-200 mt-1">Highest cost category: {topRoomCategory}</p>
                </div>
              </div>
              {showPaywalls && isLockedProject && lockedOverlay}
            </div>

            {v1RoomCount > 0 && (
              <p className="text-[8px] text-slate-500 text-center">
                {v1RoomCount} of {rooms.length} room{rooms.length === 1 ? '' : 's'} with rule-based line items
              </p>
            )}

            <div className="relative bg-[#111810] border border-[#1f2e1f] rounded-[28px] p-5 space-y-3">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Room by room</h3>
              <ul className="space-y-2">
                {rows.map(({ room, est }) => (
                  <li
                    key={room.id}
                    className="flex items-start justify-between gap-3 rounded-2xl bg-[#0f150f] border border-[#1f2e1f] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-tight text-slate-100 truncate">{room.name}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">{room.type}</p>
                      <p className="text-[8px] text-slate-500 mt-1">
                        {room.pricingV1?.source === 'rules' ? PRICING_SOURCE_V1_LABEL : PRICING_SOURCE_AREA_LABEL}
                        {room.pricingV1?.source === 'rules' && room.pricingV1.lineItems.length > 0 && (
                          <> · {room.pricingV1.lineItems.length} line item{room.pricingV1.lineItems.length === 1 ? '' : 's'}</>
                        )}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 space-y-0.5">
                      <p className="text-[11px] font-black text-slate-200 tabular-nums">Baseline: ${Math.round(Math.max(roomQuotedCompareTotal(room), roomEstimateMid(room))).toLocaleString()}</p>
                      <p className="text-[9px] text-slate-400 tabular-nums">Quoted: ${Math.round(roomQuotedCompareTotal(room)).toLocaleString()}</p>
                      <p className="text-[9px] text-[#3ddb6f] tabular-nums">Paid: ${Math.round(roomActualPaidTotal(room)).toLocaleString()}</p>
                      <p className="text-[8px] text-slate-500">Variance: {formatVariance(roomActualPaidTotal(room) - Math.max(roomQuotedCompareTotal(room), roomEstimateMid(room)))}</p>
                    </div>
                  </li>
                ))}
              </ul>
              {showPaywalls && isLockedProject && lockedOverlay}
            </div>

            {byCategory.length > 0 && (
              <div className="relative bg-[#111810] border border-[#1f2e1f] rounded-[28px] p-5 space-y-3">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Actual paid by category</h3>
                <ul className="space-y-1">
                  {byCategory.slice(0, 10).map(row => (
                    <li key={row.category} className="flex justify-between text-[10px] text-slate-300">
                      <span className="font-bold">{row.category}</span>
                      <span className="font-black text-[#3ddb6f] tabular-nums">${Math.round(row.amount).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
                {showPaywalls && isLockedProject && lockedOverlay}
              </div>
            )}

            <div className="relative bg-[#111810] border border-[#1f2e1f] rounded-[28px] p-5 space-y-3">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Trade / category (v1 + fillers)</h3>
              <p className="text-[8px] text-slate-500 leading-relaxed">{ESTIMATE_DISCLAIMER}</p>
              <p className="text-[9px] text-slate-500 leading-relaxed">
                Sums v1 category buckets for rooms on rules; for rooms still on the area band only, a simple 4-bucket
                split is used for that room&rsquo;s share.
              </p>
              <ul className="space-y-2">
                {tradeProject.map(line => (
                  <li
                    key={line.label}
                    className="flex items-center justify-between gap-2 rounded-xl bg-[#0f150f] border border-[#1f2e1f] px-3 py-2.5"
                  >
                    <span className="text-[10px] font-bold text-slate-200">{line.label}</span>
                    <span className="text-[10px] font-black text-slate-300 tabular-nums">
                      ${line.low.toLocaleString()} – ${line.high.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
              {showPaywalls && isLockedProject && lockedOverlay}
            </div>
          </>
        )}
      </div>

      <PaywallModal
        isOpen={showPaywalls && showPaywall}
        onClose={() => setShowPaywall(false)}
        onUnlock={() => {
          unlockProject(project.id);
          const refreshed = getProjectById(projectId);
          if (refreshed) setProject(refreshed);
          setShowPaywall(false);
        }}
        projectId={project.id}
        clientBudget={project.totalBudget}
        estimateMid={estMidProject}
        statusLabel={budgetStatus.label}
      />
      </div>

      <div id="estimate-print-root" className="estimate-print-only" style={{ fontFamily: 'system-ui, Segoe UI, sans-serif' }}>
        <header style={{ borderBottom: `2px solid ${ZORVO_ACCENT}`, paddingBottom: 12, marginBottom: 20 }}>
          <p style={{ color: ZORVO_ACCENT, fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: '0.06em' }}>Zorvo IQ</p>
          <p style={{ fontSize: 11, color: '#222', margin: '8px 0 0', fontWeight: 600 }}>Project estimate summary</p>
        </header>

        <section style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: 17, color: '#000', fontWeight: 800, margin: '0 0 6px' }}>{project.name}</h2>
          <p style={{ fontSize: 11, color: '#111', margin: '4px 0', lineHeight: 1.45 }}>{addressLine}</p>
          <p style={{ fontSize: 10, color: '#444', margin: '6px 0 0' }}>Generated: {generatedAt}</p>
        </section>

        <section style={{ marginBottom: 22 }}>
          <h3 style={{ fontSize: 11, color: ZORVO_ACCENT, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 10px' }}>Summary</h3>
          <p style={{ fontSize: 11, margin: '5px 0', color: '#000' }}>
            <strong>Total estimate range:</strong>{' '}
            ${totalLow.toLocaleString()} – ${totalHigh.toLocaleString()}
          </p>
          <p style={{ fontSize: 11, margin: '5px 0', color: '#000' }}>
            <strong>Mid estimate:</strong> ${Math.round(estMidProject).toLocaleString()}
          </p>
          <p style={{ fontSize: 11, margin: '5px 0', color: '#000' }}>
            <strong>Actual paid:</strong> ${Math.round(actualProj).toLocaleString()}
          </p>
        </section>

        <section style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 11, color: ZORVO_ACCENT, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 10px' }}>Rooms</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '8px 6px',
                    borderBottom: `2px solid ${ZORVO_ACCENT}`,
                    fontWeight: 800,
                    color: '#000',
                  }}
                >
                  Room
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '8px 6px',
                    borderBottom: `2px solid ${ZORVO_ACCENT}`,
                    fontWeight: 800,
                    color: '#000',
                  }}
                >
                  Estimate range
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '8px 6px',
                    borderBottom: `2px solid ${ZORVO_ACCENT}`,
                    fontWeight: 800,
                    color: '#000',
                  }}
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ padding: '10px 6px', color: '#555' }}>
                    No rooms in this project.
                  </td>
                </tr>
              ) : (
                rows.map(({ room, est }) => (
                  <tr key={`print-${room.id}`}>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid #e5e5e5', verticalAlign: 'top' }}>
                      {room.name || room.type || 'Room'}
                    </td>
                    <td
                      style={{
                        padding: '8px 6px',
                        borderBottom: '1px solid #e5e5e5',
                        textAlign: 'right',
                        whiteSpace: 'nowrap',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      ${est.low.toLocaleString()} – ${est.high.toLocaleString()}
                    </td>
                    <td
                      style={{
                        padding: '8px 6px',
                        borderBottom: '1px solid #e5e5e5',
                        textAlign: 'right',
                        fontWeight: 700,
                      }}
                    >
                      {roomEstimateSpendStatus(room)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <footer style={{ marginTop: 24, paddingTop: 14, borderTop: '1px solid #ccc', fontSize: 9, color: '#333', lineHeight: 1.5 }}>
          <p style={{ margin: 0 }}>Indicative estimate only. Not a professional quote.</p>
        </footer>
      </div>
    </Layout>
  );
};

export default ProjectEstimateSummary;

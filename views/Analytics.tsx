
import React, { useState, useEffect, useMemo } from 'react';
import { Activity, Receipt, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Layout from '../components/Layout';
import PaywallModal from '../components/PaywallModal';
import { Project } from '../types';
import { loadProjects, unlockProject } from '../store/projectStore';
import {
  aggregateActualsByCategoryProjects,
  deriveDominantBudgetStatus,
  projectsBudgetStatus,
  projectActualManualTotal,
  projectEstimateMidTotal,
  projectQuotedCompareTotal,
  resolveBudgetStatus,
  roomActualPaidTotal,
  roomEstimateMid,
  roomQuotedCompareTotal,
} from '../utils/budgetAggregates';

const Analytics: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    setProjects(loadProjects());
  }, []);

  const unlockedProjects = projects.filter(p => p.isUnlocked);
  const lockedProjects = projects.filter(p => !p.isUnlocked);
  const hasUnlockedProjects = unlockedProjects.length > 0;
  const showPaywalls = !hasUnlockedProjects;
  const summaryProjects = hasUnlockedProjects ? unlockedProjects : projects;

  const portfolioEstMid = summaryProjects.reduce((s, p) => s + projectEstimateMidTotal(p), 0);
  const portfolioQuoted = summaryProjects.reduce((s, p) => s + projectQuotedCompareTotal(p), 0);
  const allActualCategories = aggregateActualsByCategoryProjects(summaryProjects);
  const hasLockedProjects = lockedProjects.length > 0;
  const budgetStatus = projectsBudgetStatus(summaryProjects);
  const dominantStatus = deriveDominantBudgetStatus(budgetStatus);
  const paywallTargetProject = lockedProjects[0] || null;
  const paywallTargetStatus = paywallTargetProject ? projectsBudgetStatus([paywallTargetProject]) : null;
  const UNREALISTIC_ESTIMATE_THRESHOLD = 100_000_000;
  const estimateLooksUnrealistic = portfolioEstMid > UNREALISTIC_ESTIMATE_THRESHOLD;
  const canShowEstimate = portfolioEstMid > 0 && !estimateLooksUnrealistic;
  const topCategory = allActualCategories[0];
  const roomsOverBudgetCount = summaryProjects.reduce((sum, project) => {
    return sum + project.rooms.filter(room => {
      const roomStatus = resolveBudgetStatus({
        quoted: roomQuotedCompareTotal(room),
        estimateMid: roomEstimateMid(room),
        actualPaid: roomActualPaidTotal(room),
      });
      return roomStatus.isOverBudget;
    }).length;
  }, 0);
  const quoteRecords = summaryProjects.reduce((sum, p) => sum + p.rooms.reduce((roomSum, r) => roomSum + (r.quoteItems || []).length, 0), 0);
  const paidRecords = summaryProjects.reduce(
    (sum, p) =>
      sum +
      p.rooms.reduce(
        (roomSum, r) =>
          roomSum + (r.actualCostItems || []).length + (r.quoteItems || []).reduce((qSum, q) => qSum + (q.payments || []).filter(pay => pay.status === 'paid').length, 0),
        0
      ),
    0
  );
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const weeklyNewQuotes = summaryProjects.flatMap(p =>
    p.rooms.flatMap(r => (r.quoteItems || []).filter(q => q.quoteDate && new Date(q.quoteDate) >= weekAgo).map(q => `${p.name}: ${r.name} quote ${q.supplierOrTrade || q.description}`))
  );
  const weeklyNewPayments = summaryProjects.flatMap(p =>
    p.rooms.flatMap(r =>
      (r.quoteItems || []).flatMap(q => (q.payments || []).filter(pay => pay.paidDate && new Date(pay.paidDate) >= weekAgo).map(pay => `${p.name}: ${r.name} ${pay.paymentType} $${Math.round(pay.amount).toLocaleString()}`))
    )
  );
  const dueNextWeek = summaryProjects.flatMap(p =>
    p.rooms.flatMap(r =>
      (r.quoteItems || []).flatMap(q =>
        (q.payments || [])
          .filter(pay => pay.status === 'scheduled' && pay.paidDate && new Date(pay.paidDate) >= new Date() && new Date(pay.paidDate) <= nextWeek)
          .map(pay => `${p.name}: ${r.name} ${pay.paymentType} due ${pay.paidDate}`)
      )
    )
  );

  const chartColors = {
    estimate: '#94a3b8',
    quoted: '#ffffff',
    actualPaid: '#3ddb6f',
  } as const;

  const pieCategoryFills = [
    '#3ddb6f',
    '#22c55e',
    '#86efac',
    '#94a3b8',
    '#cbd5e1',
    '#fbbf24',
    '#fb923c',
    '#a78bfa',
    '#38bdf8',
  ];

  const barChartData = useMemo(
    () =>
      summaryProjects.map(p => {
        const label = p.name.trim() || 'Untitled';
        const short = label.length > 14 ? `${label.slice(0, 12)}…` : label;
        return {
          name: short,
          estimate: Math.round(projectEstimateMidTotal(p)),
          quoted: Math.round(projectQuotedCompareTotal(p)),
          actualPaid: Math.round(projectActualManualTotal(p)),
        };
      }),
    [summaryProjects]
  );

  const pieChartData = useMemo(
    () =>
      allActualCategories.map(row => ({
        name: row.category,
        value: Math.round(row.amount),
      })),
    [allActualCategories]
  );

  const chartTooltipStyle = {
    backgroundColor: '#0f150f',
    border: '1px solid #2a3a2a',
    borderRadius: 12,
    fontSize: 11,
    color: '#e2e8f0',
  };

  const renderInsightsPaywallOverlay = (roundedClassName: string) => (
    <div
      className={`absolute inset-0 z-10 ${roundedClassName} bg-black/55 backdrop-blur-sm flex items-center justify-center p-4`}
    >
      <div className="max-w-xs text-center space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-200">
          Unlock full project insights - $69
        </p>
        <button
          type="button"
          onClick={() => setShowPaywall(true)}
          className="px-5 py-2.5 rounded-2xl bg-[#3ddb6f] text-black text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-900/40 transition-transform duration-200 hover:scale-[1.02]"
        >
          Unlock for $69
        </button>
      </div>
    </div>
  );

  return (
    <Layout title="Zorvo IQ Analytics">
      <div className="space-y-6">
        <section className="relative bg-[#151d15] border border-[#2a3a2a] p-5 rounded-3xl space-y-4 shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
          <div
            className={`rounded-2xl border px-4 py-6 text-center ${
              budgetStatus.isOverBudget ? 'border-red-500/35 bg-red-500/10' : 'border-emerald-500/35 bg-emerald-500/10'
            }`}
          >
            <p
              className={`text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 ${
                budgetStatus.isOverBudget ? 'text-red-200' : 'text-emerald-200'
              }`}
            >
              {budgetStatus.isOverBudget ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              {dominantStatus}
            </p>
            <p
              className={`mt-2 text-3xl font-black ${
                budgetStatus.isOverBudget ? 'text-red-300' : 'text-[#3ddb6f]'
              }`}
            >
              ${budgetStatus.varianceAmount.toLocaleString()}
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              {budgetStatus.label}
            </p>
            <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-slate-500">
              {budgetStatus.helper}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-[9px] text-slate-500 font-black uppercase flex items-center gap-1.5">
                <Wallet size={16} className="opacity-70" />Estimate (mid)
              </p>
              <p className="font-black text-slate-100 tabular-nums">
                {canShowEstimate ? `$${Math.round(portfolioEstMid).toLocaleString()}` : 'Estimate unavailable'}
              </p>
            </div>
            <div>
              <p className="text-[9px] text-slate-500 font-black uppercase flex items-center gap-1.5">
                <Receipt size={16} className="opacity-70" />Quoted
              </p>
              <p className="font-black text-slate-200 tabular-nums">${Math.round(portfolioQuoted).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[9px] text-slate-500 font-black uppercase flex items-center gap-1.5">
                <Activity size={16} className="opacity-70" />Actual paid
              </p>
              <p className="font-black text-[#3ddb6f] tabular-nums">${Math.round(budgetStatus.actualPaid).toLocaleString()}</p>
            </div>
          </div>
          <p className="text-[9px] text-slate-500">
            Based on {quoteRecords} quote records · {paidRecords} payment/actual records
          </p>
          {quoteRecords === 0 && (
            <p className="text-[10px] text-amber-200">Missing quotes: Not captured yet.</p>
          )}
          {paidRecords === 0 && (
            <p className="text-[10px] text-amber-200">Missing payments: Not captured yet.</p>
          )}

          <div className="relative rounded-xl border border-[#1f2e1f] bg-[#0f150f] px-3 py-3 space-y-1">
            <div className={!hasUnlockedProjects ? 'pointer-events-none opacity-50 blur-[1px]' : ''}>
              <p className="text-[10px] text-slate-300">
                {topCategory
                  ? `Biggest cost category: ${topCategory.category} ($${Math.round(topCategory.amount).toLocaleString()})`
                  : 'Biggest cost category: No paid categories yet'}
              </p>
              <p className="text-[10px] text-slate-400">
                Rooms over budget: <span className="font-black text-slate-200">{roomsOverBudgetCount}</span>
              </p>
            </div>
            {!hasUnlockedProjects && (
              <div className="absolute inset-0 flex items-center justify-center p-2">
                <button
                  onClick={() => setShowPaywall(true)}
                  className="px-4 py-2 rounded-xl bg-[#3ddb6f] text-black text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-900/40 transition-transform duration-200 hover:scale-[1.02]"
                >
                  Unlock full project insights - $69
                </button>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-[#1f2e1f] bg-[#0f150f] px-3 py-3 space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Weekly tradie summary</p>
            <p className="text-[9px] text-slate-400">Changed this week: {weeklyNewQuotes.length + weeklyNewPayments.length === 0 ? 'No new quotes/payments' : `${weeklyNewQuotes.length} quotes, ${weeklyNewPayments.length} payments`}</p>
            <p className="text-[9px] text-slate-400">Due next week: {dueNextWeek.length === 0 ? 'No scheduled payments' : `${dueNextWeek.length} scheduled payments`}</p>
            <p className="text-[9px] text-slate-400">Risk flags: {roomsOverBudgetCount} room{roomsOverBudgetCount === 1 ? '' : 's'} over quote/budget</p>
          </div>

          <div className="space-y-4 pt-2">
            <div className="relative rounded-2xl border border-[#1f2e1f] bg-[#111810] p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">
                Estimate vs quoted vs actual (by project)
              </p>
              {barChartData.length === 0 ? (
                <p className="text-[10px] text-slate-500 py-16 text-center">No projects to display.</p>
              ) : (
                <div className="h-[min(380px,52vh)] w-full min-h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={barChartData}
                      margin={{ top: 6, right: 10, left: 4, bottom: barChartData.length > 4 ? 52 : 16 }}
                    >
                      <CartesianGrid stroke="#2a3a2a" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        interval={0}
                        angle={barChartData.length > 4 ? -32 : 0}
                        textAnchor={barChartData.length > 4 ? 'end' : 'middle'}
                        height={barChartData.length > 4 ? 56 : 28}
                      />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `$${Number(v).toLocaleString()}`} width={56} />
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        formatter={(value: number | string) => [`$${Math.round(Number(value)).toLocaleString()}`, undefined]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, color: '#cbd5e1' }} />
                      <Bar dataKey="estimate" name="Estimate (mid)" fill={chartColors.estimate} radius={[3, 3, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="quoted" name="Quoted" fill={chartColors.quoted} radius={[3, 3, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="actualPaid" name="Actual paid" fill={chartColors.actualPaid} radius={[3, 3, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {!hasUnlockedProjects && renderInsightsPaywallOverlay('rounded-2xl')}
            </div>

            <div className="relative rounded-2xl border border-[#1f2e1f] bg-[#111810] p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Actual paid by category</p>
              {pieChartData.length === 0 ? (
                <p className="text-[10px] text-slate-500 py-16 text-center">No paid categories yet.</p>
              ) : (
                <div className="h-[min(340px,48vh)] w-full min-h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius="42%"
                        outerRadius="72%"
                        paddingAngle={2}
                      >
                        {pieChartData.map((_, i) => (
                          <Cell key={`cat-${i}`} fill={pieCategoryFills[i % pieCategoryFills.length]} stroke="#111810" strokeWidth={1} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        formatter={(value: number | string) => `$${Math.round(Number(value)).toLocaleString()}`}
                      />
                      <Legend
                        layout="vertical"
                        align="right"
                        verticalAlign="middle"
                        wrapperStyle={{ fontSize: 10, color: '#cbd5e1', paddingLeft: 8 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              {!hasUnlockedProjects && renderInsightsPaywallOverlay('rounded-2xl')}
            </div>
          </div>

          {showPaywalls && hasLockedProjects && (
            <div className="rounded-2xl border border-[#1f2e1f] bg-[#111810] p-4 flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                {lockedProjects.length} project{lockedProjects.length === 1 ? '' : 's'} locked for advanced analytics
              </p>
              <button
                onClick={() => setShowPaywall(true)}
                className="px-4 py-2 rounded-xl border border-[#3ddb6f]/50 bg-[#0f150f] text-[10px] font-black uppercase tracking-widest text-[#3ddb6f] transition-transform duration-200 hover:scale-[1.02]"
              >
                Unlock for $69
              </button>
            </div>
          )}
          {showPaywalls && hasLockedProjects && renderInsightsPaywallOverlay('rounded-[28px]')}
        </section>
      </div>

      <PaywallModal
        isOpen={showPaywalls && showPaywall}
        onClose={() => setShowPaywall(false)}
        onUnlock={() => {
          if (lockedProjects.length > 0) {
            unlockProject(lockedProjects[0].id);
            setProjects(loadProjects());
          }
          setShowPaywall(false);
        }}
        projectId={paywallTargetProject?.id}
        clientBudget={paywallTargetProject?.totalBudget}
        estimateMid={paywallTargetProject ? projectEstimateMidTotal(paywallTargetProject) : undefined}
        statusLabel={paywallTargetStatus?.label}
      />
    </Layout>
  );
};

export default Analytics;


import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, House, Settings, TrendingUp, Wallet } from 'lucide-react';
import Layout from '../components/Layout';
import SettingsSheet from '../components/SettingsSheet';
import { Project, User } from '../types';
import { loadProjects, createProject, loadUser, getStorageStatus, PROJECT_LIMIT_ERROR, saveUser, unlockProject, updateProjectById, isAtProjectCreationLimit } from '../store/projectStore';
import { ICONS } from '../constants';
import { numberInputQuickEntryProps } from '../components/forms/quickNumericInput';
import PaywallModal from '../components/PaywallModal';
import OnboardingOverlay, { ZORVO_IQ_ONBOARDING_DONE_KEY } from '../components/OnboardingOverlay';
import { deriveDominantBudgetStatus, projectActualManualTotal, projectBudgetSourceSummary, projectBudgetStatus, projectEstimateMidTotal, projectQuotedCompareTotal } from '../utils/budgetAggregates';
import { safeSetItem } from '../utils/safePersistence';

const Dashboard: React.FC = () => {
  const MAILCHIMP_LINK = 'http://eepurl.com/gp1di15SCU';
  const EMAIL_CAPTURE_DONE_KEY = 'zorvo_iq_email_capture_done';
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const [projects, setProjects] = useState<Project[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newPostcode, setNewPostcode] = useState('');
  const [newBudget, setNewBudget] = useState(0);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [unlockTargetProjectId, setUnlockTargetProjectId] = useState<string | null>(null);
  const [showProjectLimitModal, setShowProjectLimitModal] = useState(false);
  const [showEmailCaptureModal, setShowEmailCaptureModal] = useState(false);
  const [emailCaptureProjectId, setEmailCaptureProjectId] = useState<string | null>(null);
  const [captureEmail, setCaptureEmail] = useState('');
  const [captureEmailError, setCaptureEmailError] = useState<string | null>(null);
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const headerAddButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const u = loadUser();
    if (!u) {
      window.location.hash = '#/login';
      return;
    }
    setUser(u);
    setProjects(loadProjects());
    const status = getStorageStatus();
    if (!status.ok) {
      setStorageWarning(status.message);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (projects.length > 0) {
      setShowOnboarding(false);
      return;
    }
    try {
      if (localStorage.getItem(ZORVO_IQ_ONBOARDING_DONE_KEY)) return;
    } catch {
      return;
    }
    setShowOnboarding(true);
  }, [user, projects.length]);

  const handleAddProject = () => {
    if (blockNewProject) {
      setShowProjectLimitModal(true);
      setShowAdd(false);
      return;
    }
    if (!newName || !newAddress || !newPostcode) return;
    const sanitizedBudget = Number.isFinite(newBudget) ? Math.max(newBudget, 0) : 0;
    let created: Project;
    try {
      created = createProject(newName.trim(), newAddress.trim(), newPostcode.trim(), sanitizedBudget);
    } catch (e) {
      const msg = e instanceof Error ? e.message : PROJECT_LIMIT_ERROR;
      if (msg === PROJECT_LIMIT_ERROR) {
        setShowProjectLimitModal(true);
      } else {
        setStorageWarning(msg);
      }
      setShowAdd(false);
      return;
    }
    setProjects(loadProjects({ forceRefresh: true }));
    const status = getStorageStatus();
    setStorageWarning(status.ok ? null : status.message);
    setShowAdd(false);
    resetForm();
    if (!localStorage.getItem(EMAIL_CAPTURE_DONE_KEY)) {
      setEmailCaptureProjectId(created.id);
      setCaptureEmail(loadUser()?.email || '');
      setCaptureEmailError(null);
      setShowEmailCaptureModal(true);
    }
  };

  const resetForm = () => {
    setNewName(''); setNewAddress(''); setNewPostcode(''); setNewBudget(0);
  };
  const hasUnlockedProject = projects.some(p => p.isUnlocked);
  const blockNewProject = isAtProjectCreationLimit(projects);
  const paywallTargetProject = unlockTargetProjectId ? projects.find(p => p.id === unlockTargetProjectId) || null : null;
  const paywallTargetStatus = paywallTargetProject ? projectBudgetStatus(paywallTargetProject) : null;
  const handleSaveCaptureEmail = () => {
    const trimmed = captureEmail.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setCaptureEmailError('Enter a valid email to continue.');
      return;
    }
    saveUser({ email: trimmed });
    if (emailCaptureProjectId) {
      updateProjectById(emailCaptureProjectId, p => ({ ...p, ownerEmail: trimmed }));
    }
    const doneFlag = safeSetItem(EMAIL_CAPTURE_DONE_KEY, '1');
    setEmailCaptureProjectId(null);
    setShowEmailCaptureModal(false);
    setProjects(loadProjects({ forceRefresh: true }));
    const st = getStorageStatus();
    setStorageWarning(
      !st.ok && st.message ? st.message : !doneFlag.ok ? (doneFlag.error ?? 'Could not save preference.') : null
    );
    window.open(MAILCHIMP_LINK, '_blank', 'noopener,noreferrer');
  };
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0f150f] flex items-center justify-center px-6">
        <div className="rounded-3xl border border-[#1f2e1f] bg-[#111810] px-6 py-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loading session...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout title="Zorvo IQ" actions={
      <div className="flex gap-2 items-center">
        <button
          type="button"
          aria-label="Open settings"
          onClick={() => setShowSettingsSheet(true)}
          className="p-2.5 rounded-xl border border-[#1f2e1f] bg-[#0f150f] text-slate-300 hover:text-[#3ddb6f] hover:border-[#3ddb6f]/30 transition-colors"
        >
          <Settings size={22} strokeWidth={2} />
        </button>
        <button
          ref={headerAddButtonRef}
          type="button"
          onClick={() => {
            if (blockNewProject) {
              setShowProjectLimitModal(true);
              return;
            }
            setShowAdd(true);
          }}
          className="w-12 h-12 bg-[#3ddb6f] text-black rounded-full flex items-center justify-center shadow-xl shadow-emerald-900/40 active:scale-90 transition-all"
        >
          <ICONS.Plus />
        </button>
      </div>
    }>
      <div className="space-y-8">
        <div className="rounded-xl border border-[#1f2e1f] bg-[#111810] px-4 py-2.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#3ddb6f]">Demo Project — Example data for walkthrough</p>
        </div>
        {storageWarning && (
          <div className="rounded-2xl border border-red-500/30 bg-red-900/20 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-red-300 flex items-center gap-1.5">
              <AlertTriangle size={16} /> Storage Warning
            </p>
            <p className="text-xs text-red-200 mt-1">{storageWarning}</p>
          </div>
        )}
        <div className="px-1">
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1 flex items-center gap-1.5"><House size={16} /> Portfolio Tracker</p>
          <p className="text-3xl font-black text-slate-100 tracking-tighter">My Projects</p>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-20 bg-[#111810] border-2 border-dashed border-[#1f2e1f] rounded-[50px] space-y-6">
            <p className="text-slate-300 font-bold uppercase text-[11px] tracking-widest">No projects yet</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed px-4">
              Create a project to run a property walk-through, capture rooms, and see indicative cost bands.
            </p>
            <button
              onClick={() => {
                if (blockNewProject) {
                  setShowProjectLimitModal(true);
                  return;
                }
                setShowAdd(true);
              }}
              className="text-[#3ddb6f] font-black text-[11px] uppercase tracking-widest underline decoration-2 underline-offset-8"
            >
              Create your first project
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {projects.map(p => {
              const actualPaid = projectActualManualTotal(p);
              const estimateMid = projectEstimateMidTotal(p);
              const quoted = projectQuotedCompareTotal(p);
              const budgetStatus = projectBudgetStatus(p);
              const dominantStatus = deriveDominantBudgetStatus(budgetStatus);
              const baselineSummary = projectBudgetSourceSummary(p);
              const budgetProgress = budgetStatus.baselineAmount > 0
                ? Math.min((actualPaid / budgetStatus.baselineAmount) * 100, 100)
                : 0;
              return (
                <div 
                  key={p.id} 
                  onClick={() => window.location.hash = `#/project/${p.id}`}
                  className="bg-[#111810] border border-[#1f2e1f] p-8 rounded-[44px] shadow-sm active:scale-[0.98] transition-all duration-200 cursor-pointer relative overflow-hidden hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20"
                >
                  <div className="mb-8">
                    <h3 className="font-black text-2xl text-slate-100 tracking-tighter leading-tight">{p.name}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-[0.2em]">{p.address}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-[#0f150f] p-5 rounded-[24px]">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Wallet size={16} /> Limit</span>
                      <p className="font-black text-xl text-slate-100 mt-1">${p.totalBudget.toLocaleString()}</p>
                    </div>
                    <div className="bg-[#0f150f] p-5 rounded-[24px]">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><TrendingUp size={16} /> Actual paid</span>
                      <p className={`font-black text-xl mt-1 ${budgetStatus.isOverBudget ? 'text-red-400' : 'text-[#3ddb6f]'}`}>${Math.round(actualPaid).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="h-1.5 w-full bg-[#1f2e1f] rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-1000 ${budgetStatus.isOverBudget ? 'bg-red-500 w-full' : 'bg-[#3ddb6f]'}`} style={{ width: !budgetStatus.isOverBudget ? `${budgetProgress}%` : '100%' }} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-md border ${
                      dominantStatus === 'Over'
                        ? 'text-red-200 border-red-500/30 bg-red-500/10'
                        : dominantStatus === 'At risk'
                          ? 'text-amber-200 border-amber-500/30 bg-amber-500/10'
                          : 'text-emerald-200 border-emerald-500/30 bg-emerald-500/10'
                    }`}>
                      {dominantStatus}
                    </span>
                    <p className={`text-[9px] font-black uppercase tracking-widest ${budgetStatus.isOverBudget ? 'text-red-300' : 'text-[#3ddb6f]'}`}>
                      {budgetStatus.label}
                    </p>
                  </div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 mt-1">
                    {budgetStatus.helper}
                  </p>
                  <p className="text-[8px] text-slate-500 mt-1">
                    Baseline: {quoted > 0 ? `${baselineSummary.mode === 'hybrid' ? 'Mixed quote + estimate' : 'Quote'} $${Math.round(budgetStatus.baselineAmount).toLocaleString()}` : estimateMid > 0 ? `Estimate $${Math.round(estimateMid).toLocaleString()}` : 'Missing estimate'} · based on {p.rooms.reduce((s, r) => s + (r.quoteItems || []).length, 0)} quote records
                  </p>
                  {!p.isUnlocked && !hasUnlockedProject && (
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                        Advanced insights locked
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setUnlockTargetProjectId(p.id);
                        }}
                        className="px-3 py-1.5 rounded-lg border border-[#3ddb6f]/40 bg-[#0f150f] text-[9px] font-black uppercase tracking-widest text-[#3ddb6f] transition-transform duration-200 hover:scale-[1.02]"
                      >
                        Unlock for $69
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {showAdd && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm px-4">
            <div className="bg-[#111810] border border-[#1f2e1f] w-full max-w-md rounded-t-[50px] p-10 animate-in slide-in-from-bottom duration-500 shadow-2xl">
              <div className="w-14 h-1.5 bg-[#1f2e1f] rounded-full mx-auto mb-10" />
              <h3 className="text-3xl font-black mb-8 text-slate-100 tracking-tighter">New Project</h3>
              <div className="space-y-4 mb-10">
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Project Name" className="w-full p-6 bg-[#0f150f] border border-[#1f2e1f] rounded-3xl outline-none font-black text-slate-100" />
                <input type="text" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="Address" className="w-full p-6 bg-[#0f150f] border border-[#1f2e1f] rounded-3xl outline-none font-black text-slate-100" />
                <div className="flex gap-4">
                  <input type="text" value={newPostcode} onChange={(e) => setNewPostcode(e.target.value)} placeholder="Postcode" className="w-24 p-6 bg-[#0f150f] border border-[#1f2e1f] rounded-3xl outline-none font-black text-slate-100" />
                  <input type="number" value={newBudget || ''} onChange={(e) => setNewBudget(Number(e.target.value))} placeholder="Budget ($)" className="flex-1 p-6 bg-[#0f150f] border border-[#1f2e1f] rounded-3xl outline-none font-black text-slate-100" {...numberInputQuickEntryProps} />
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setShowAdd(false)} className="flex-1 py-6 text-slate-400 font-black uppercase tracking-widest text-[11px]">Cancel</button>
                <button onClick={handleAddProject} className="flex-[2] py-6 bg-[#3ddb6f] text-black rounded-3xl font-black uppercase tracking-widest text-[11px] shadow-2xl shadow-emerald-900/40 active:scale-95 transition-transform duration-200 hover:scale-[1.02]">Create Project</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <PaywallModal
        isOpen={!hasUnlockedProject && unlockTargetProjectId != null}
        onClose={() => setUnlockTargetProjectId(null)}
        onUnlock={() => {
          if (!unlockTargetProjectId) return;
          unlockProject(unlockTargetProjectId);
          setProjects(loadProjects({ forceRefresh: true }));
          const st = getStorageStatus();
          setStorageWarning(!st.ok && st.message ? st.message : null);
          setUnlockTargetProjectId(null);
        }}
        projectId={unlockTargetProjectId ?? undefined}
        clientBudget={paywallTargetProject?.totalBudget}
        estimateMid={paywallTargetProject ? projectEstimateMidTotal(paywallTargetProject) : undefined}
        statusLabel={paywallTargetStatus?.label}
      />
      {showProjectLimitModal && (
        <PaywallModal
          isOpen={showProjectLimitModal}
          onClose={() => setShowProjectLimitModal(false)}
          onUnlock={() => {
            setShowProjectLimitModal(false);
            const firstLocked = projects.find(p => !p.isUnlocked);
            if (firstLocked) setUnlockTargetProjectId(firstLocked.id);
          }}
          projectId={projects.find(p => !p.isUnlocked)?.id}
          subtitle="Unlock a project to create another walkthrough."
          primaryCtaLabel="Unlock this project"
          secondaryCtaLabel="Continue with limited access"
        />
      )}
      {showEmailCaptureModal && (
        <div className="fixed inset-0 z-[220] bg-black/60 backdrop-blur-sm flex items-end justify-center px-4">
          <div className="bg-[#111810] w-full max-w-md rounded-t-[40px] p-8 shadow-2xl border border-[#1f2e1f]">
            <div className="w-12 h-1.5 bg-[#1f2e1f] rounded-full mx-auto mb-8" />
            <h3 className="text-2xl font-black text-slate-100 tracking-tighter text-center mb-2">
              Save your project & access it later
            </h3>
            <p className="text-[13px] text-slate-400 font-medium leading-relaxed text-center mb-6">
              Enter your email
            </p>
            <div className="space-y-2 mb-6">
              <input
                type="email"
                value={captureEmail}
                onChange={(e) => {
                  setCaptureEmail(e.target.value);
                  setCaptureEmailError(null);
                }}
                placeholder="name@example.com"
                className="w-full rounded-xl border border-[#1f2e1f] bg-[#0f150f] px-4 py-3 text-sm font-semibold text-slate-100 outline-none"
              />
              {captureEmailError && <p className="text-[10px] font-black uppercase tracking-widest text-red-300">{captureEmailError}</p>}
            </div>
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleSaveCaptureEmail}
                className="w-full p-4 bg-[#3ddb6f] text-black rounded-2xl font-black uppercase tracking-widest text-sm"
              >
                Save email
              </button>
              <button
                type="button"
                onClick={() => {
                  const r = safeSetItem(EMAIL_CAPTURE_DONE_KEY, '1');
                  const st = getStorageStatus();
                  setStorageWarning(
                    !st.ok && st.message ? st.message : !r.ok ? (r.error ?? 'Could not save preference.') : null
                  );
                  setEmailCaptureProjectId(null);
                  setShowEmailCaptureModal(false);
                }}
                className="w-full py-3 text-slate-500 font-bold text-[11px] uppercase tracking-widest"
              >
                Continue with limited access
              </button>
            </div>
          </div>
        </div>
      )}
      <SettingsSheet
        isOpen={showSettingsSheet}
        onClose={() => setShowSettingsSheet(false)}
        email={user.email}
      />
      <OnboardingOverlay
        open={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        plusButtonRef={headerAddButtonRef}
      />
    </Layout>
  );
};

export default Dashboard;

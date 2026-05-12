
import React, { useEffect, useState } from 'react';
import { loadUser, saveUser, updateProjectById } from '../store/projectStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onUnlock: () => void;
  /** When set, confirmed email is stored on this project (`ownerEmail`). */
  projectId?: string;
  /** Stripe Price id — falls back to `import.meta.env.VITE_STRIPE_PRICE_ID` then server `STRIPE_DEFAULT_PRICE_ID`. */
  priceId?: string;
  subtitle?: string;
  statusLabel?: string;
  clientBudget?: number;
  estimateMid?: number;
  primaryCtaLabel?: string;
  secondaryCtaLabel?: string;
  emailPrompt?: string;
}

const MAILCHIMP_LINK = 'http://eepurl.com/gp1di15SCU';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AUTH_TOKEN_KEY = 'zorvo_iq_api_token';

const PaywallModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onUnlock,
  projectId,
  priceId: priceIdProp,
  subtitle,
  statusLabel,
  clientBudget,
  estimateMid,
  primaryCtaLabel = 'Unlock this project',
  secondaryCtaLabel = 'Continue with limited access',
  emailPrompt = 'Enter your email to unlock your project',
}) => {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setEmail(loadUser()?.email || '');
    setEmailError(null);
    setCheckoutError(null);
    setCheckoutLoading(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const hasProjectValue = Number.isFinite(clientBudget) || Number.isFinite(estimateMid) || Boolean(statusLabel);
  const safeBudget = Number.isFinite(clientBudget) ? Math.max(0, Math.round(clientBudget || 0)) : null;
  const safeEstimate = Number.isFinite(estimateMid) ? Math.max(0, Math.round(estimateMid || 0)) : null;

  const handleUnlock = async () => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setEmailError('Enter a valid email to continue.');
      return;
    }
    saveUser({ email: trimmed });
    if (projectId) {
      updateProjectById(projectId, p => ({ ...p, ownerEmail: trimmed }));
    }

    const stripePublicKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY as string | undefined;
    const priceFromEnv = import.meta.env.VITE_STRIPE_PRICE_ID as string | undefined;
    const effectivePriceId = priceIdProp || priceFromEnv;

    if (stripePublicKey && projectId) {
      let token: string | null = null;
      try {
        token = localStorage.getItem(AUTH_TOKEN_KEY);
      } catch {
        token = null;
      }
      if (!token) {
        setCheckoutError('Sign in is required to complete payment.');
        return;
      }

      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
      setCheckoutLoading(true);
      setCheckoutError(null);
      try {
        const res = await fetch(`${baseUrl}/create-checkout-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            projectId,
            ...(effectivePriceId ? { priceId: effectivePriceId } : {}),
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          const msg =
            typeof errBody === 'object' && errBody && 'error' in errBody && typeof (errBody as { error: unknown }).error === 'string'
              ? (errBody as { error: string }).error
              : `Checkout failed (${res.status})`;
          throw new Error(msg);
        }
        const data = (await res.json()) as { url?: string };
        if (!data.url) throw new Error('No checkout URL returned');
        window.location.href = data.url;
      } catch (e) {
        setCheckoutError(e instanceof Error ? e.message : 'Could not start checkout.');
      } finally {
        setCheckoutLoading(false);
      }
      return;
    }

    window.open(MAILCHIMP_LINK, '_blank', 'noopener,noreferrer');
    onUnlock();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end justify-center px-4">
      <div className="bg-[#111810] w-full max-w-md rounded-t-[40px] p-8 animate-in slide-in-from-bottom duration-300 shadow-2xl overflow-y-auto max-h-[90vh] scrollbar-hide border border-[#1f2e1f]">
        <div className="w-12 h-1.5 bg-[#1f2e1f] rounded-full mx-auto mb-8" />
        
        <header className="text-center mb-8">
          <h3 className="text-2xl font-black text-slate-100 tracking-tighter mb-2">Unlock full project clarity</h3>
          <p className="text-[13px] text-slate-400 font-medium leading-relaxed">
            {subtitle || 'You’ve started your renovation walkthrough. Unlock the full project to see detailed scope, quotes, payments, and analytics.'}
          </p>
        </header>

        {hasProjectValue && (
          <section className="bg-[#0f150f] border border-[#1f2e1f] p-4 rounded-2xl mb-6 space-y-2">
            {safeBudget != null && (
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                Client budget: <span className="text-slate-100">${safeBudget.toLocaleString()}</span>
              </p>
            )}
            {safeEstimate != null && (
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                Estimate (mid): <span className="text-slate-100">${safeEstimate.toLocaleString()}</span>
              </p>
            )}
            {statusLabel && (
              <p className="text-[10px] font-black uppercase tracking-widest text-[#3ddb6f]">
                {statusLabel}
              </p>
            )}
          </section>
        )}

        <section className="space-y-4 mb-8">
          {[
            'Room-by-room scope detail',
            'Quote tracking',
            'Deposit / progress / final payment tracking',
            'Actual paid vs budget insights',
            'Full analytics',
            'One additional project allowance',
          ].map((benefit, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-shrink-0 w-5 h-5 bg-[#0f150f] text-[#3ddb6f] rounded-full flex items-center justify-center">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-[12px] font-bold text-slate-300 tracking-tight">{benefit}</span>
            </div>
          ))}
        </section>

        <div className="bg-[#0f150f] border border-[#1f2e1f] p-6 rounded-[32px] text-center mb-8">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">$69 AUD</p>
          <p className="text-5xl font-black text-slate-100 tracking-tighter">$69</p>
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-2">
            One-time project unlock
          </p>
        </div>

        <div className="mb-6 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{emailPrompt}</p>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError(null);
            }}
            placeholder="name@example.com"
            className="w-full rounded-xl border border-[#1f2e1f] bg-[#0f150f] px-4 py-3 text-sm font-semibold text-slate-100 outline-none"
          />
          {emailError && <p className="text-[10px] font-black uppercase tracking-widest text-red-300">{emailError}</p>}
          {checkoutError && (
            <p className="text-[10px] font-black uppercase tracking-widest text-red-300">{checkoutError}</p>
          )}
        </div>

        <div className="space-y-4">
          <button 
            onClick={() => void handleUnlock()}
            disabled={checkoutLoading}
            className="w-full p-6 bg-[#3ddb6f] text-black rounded-[28px] font-black uppercase tracking-widest text-sm shadow-xl shadow-emerald-900/40 active:scale-95 transition-all disabled:opacity-60 disabled:pointer-events-none"
          >
            {checkoutLoading ? 'Redirecting…' : primaryCtaLabel}
          </button>
          
          <button 
            onClick={onClose}
            className="w-full py-4 text-slate-500 font-bold text-[11px] uppercase tracking-widest active:opacity-60 transition-opacity"
          >
            {secondaryCtaLabel}
          </button>
        </div>

        <footer className="mt-8 pt-6 border-t border-[#1f2e1f] text-center">
          <p className="text-[9px] text-slate-500 font-medium leading-relaxed">
            Indicative planning only. Not a certified trade estimate.
          </p>
        </footer>
      </div>
    </div>
  );
};

export default PaywallModal;

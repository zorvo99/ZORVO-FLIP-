import React, { useCallback, useLayoutEffect, useState } from 'react';
import { Activity, ArrowBigUp, DoorOpen } from 'lucide-react';

export const ZORVO_IQ_ONBOARDING_DONE_KEY = 'zorvo_iq_onboarding_done';

type Step = 0 | 1 | 2;

const STEPS: { label: string; body: string }[] = [
  { label: 'Create a project', body: 'Tap + to add your first property' },
  { label: 'Walk a room', body: "Enter each room's dimensions and scope during your walkthrough" },
  { label: 'Get your estimate', body: 'Instant cost bands update live as you go' },
];

export interface OnboardingOverlayProps {
  open: boolean;
  onClose: () => void;
  /** Header “add project” control — used on step 1 to align the pointer arrow. */
  plusButtonRef: React.RefObject<HTMLButtonElement | null>;
}

const OnboardingOverlay: React.FC<OnboardingOverlayProps> = ({ open, onClose, plusButtonRef }) => {
  const [step, setStep] = useState<Step>(0);
  const [plusAnchor, setPlusAnchor] = useState<{ left: number; buttonBottom: number } | null>(null);

  const measurePlus = useCallback(() => {
    const el = plusButtonRef.current;
    if (!el) {
      setPlusAnchor(null);
      return;
    }
    const r = el.getBoundingClientRect();
    /** Viewport Y of the bottom edge of the + control — arrow tip aligns just under it. */
    setPlusAnchor({ left: r.left + r.width / 2, buttonBottom: r.bottom });
  }, [plusButtonRef]);

  useLayoutEffect(() => {
    if (!open || step !== 0) return;
    measurePlus();
    window.addEventListener('resize', measurePlus);
    window.addEventListener('scroll', measurePlus, true);
    return () => {
      window.removeEventListener('resize', measurePlus);
      window.removeEventListener('scroll', measurePlus, true);
    };
  }, [open, step, measurePlus]);

  useLayoutEffect(() => {
    if (!open) setStep(0);
  }, [open]);

  const complete = () => {
    try {
      localStorage.setItem(ZORVO_IQ_ONBOARDING_DONE_KEY, '1');
    } catch {
      /* ignore */
    }
    onClose();
  };

  const handleSkip = () => complete();

  const handleNext = () => {
    if (step >= 2) {
      complete();
      return;
    }
    setStep((s) => (s + 1) as Step);
  };

  if (!open) return null;

  const meta = STEPS[step];

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-[#0f150f]/92 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="zorvo-onboarding-title"
      aria-describedby="zorvo-onboarding-body"
    >
      {step === 0 && plusAnchor && (
        <div
          className="pointer-events-none fixed z-[102] flex flex-col items-center"
          style={{
            left: plusAnchor.left,
            top: plusAnchor.buttonBottom + 6,
            transform: 'translateX(-50%)',
          }}
        >
          <ArrowBigUp className="h-14 w-14 text-[#3ddb6f] drop-shadow-[0_4px_24px_rgba(61,219,111,0.45)] animate-bounce" strokeWidth={2.25} aria-hidden />
        </div>
      )}

      <div className="flex flex-1 flex-col justify-end p-4 pb-[max(1.5rem,calc(5rem+env(safe-area-inset-bottom,0px)))]">
        <div className="mx-auto w-full max-w-md rounded-[32px] border border-[#1f2e1f] bg-[#111810] px-6 py-8 shadow-2xl">
          <div className="mb-6 flex flex-col items-center gap-4 text-center">
            {step === 1 && (
              <div
                className="flex h-20 w-20 items-center justify-center rounded-[28px] border border-[#3ddb6f]/25 bg-[#0f150f] text-[#3ddb6f]"
                aria-hidden
              >
                <DoorOpen className="h-10 w-10" strokeWidth={2} />
              </div>
            )}
            {step === 2 && (
              <div
                className="flex h-20 w-20 items-center justify-center rounded-[28px] border border-[#3ddb6f]/25 bg-[#0f150f] text-[#3ddb6f]"
                aria-hidden
              >
                <Activity className="h-10 w-10" strokeWidth={2} />
              </div>
            )}
            <div>
              <p
                id="zorvo-onboarding-title"
                className="text-[10px] font-black uppercase tracking-widest text-[#3ddb6f]"
              >
                {meta.label}
              </p>
              <p id="zorvo-onboarding-body" className="mt-3 text-sm font-semibold leading-relaxed text-slate-200">
                {meta.body}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleSkip}
              className="rounded-full border border-[#1f2e1f] bg-[#0f150f] px-6 py-3 text-[11px] font-black uppercase tracking-widest text-slate-400 transition-colors hover:border-[#3ddb6f]/30 hover:text-slate-200"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="rounded-full bg-[#3ddb6f] px-8 py-3 text-[11px] font-black uppercase tracking-widest text-black shadow-xl shadow-emerald-900/40 transition-transform active:scale-95"
            >
              {step === 2 ? 'Get started' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingOverlay;


import React, { useEffect, useMemo, useRef, useState } from 'react';
import { authApi, saveUser } from '../store/projectStore';

const AUTH_TOKEN_KEY = 'zorvo_iq_api_token';
const RESEND_COOLDOWN_SECONDS = 30;
const OTP_LENGTH = 6;

const resolveApiBase = (): string | null => {
  const direct = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (direct) return direct.replace(/\/+$/, '').replace(/\/api$/i, '');
  const legacy = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (legacy) return legacy.replace(/\/+$/, '').replace(/\/api$/i, '');
  return null;
};

class ApiUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiUnreachableError';
  }
}

class ApiResponseError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = 'ApiResponseError';
    this.status = status;
    this.body = body;
  }
}

const apiFetch = async <T,>(
  base: string,
  path: string,
  body: Record<string, unknown>
): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ApiUnreachableError(
      err instanceof Error ? err.message : 'Network request failed'
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error?: unknown }).error)
        : null) || `Request failed (${response.status})`;
    throw new ApiResponseError(response.status, payload, message);
  }

  return payload as T;
};

const setAuthToken = (token: string): void => {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // Ignore storage errors; token will simply not persist.
  }
};

type Step = 'email' | 'otp';

const inputBase: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  background: '#111810',
  border: '1px solid #1f2e1f',
  color: '#e2e8f0',
  borderRadius: '12px',
  outline: 'none',
};

const labelBase: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 700,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '8px',
  marginLeft: '4px',
};

const buttonBase: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  background: '#3ddb6f',
  color: '#111827',
  border: 'none',
  borderRadius: '12px',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 8px 20px rgba(38, 110, 58, 0.35)',
};

const Login: React.FC = () => {
  const apiBase = useMemo(resolveApiBase, []);

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const otpInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (step === 'otp') otpInputRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (resendSecondsLeft <= 0) return;
    const id = window.setTimeout(() => {
      setResendSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [resendSecondsLeft]);

  const finishLocalLogin = async (reason: string) => {
    console.warn(`[Login] Falling back to local auth: ${reason}`);
    await authApi.saveUser({ email });
    saveUser({ email });
    window.location.hash = '#/';
  };

  const isFallbackError = (err: unknown): boolean => {
    if (err instanceof ApiUnreachableError) return true;
    if (err instanceof ApiResponseError && err.status === 503) return true;
    return false;
  };

  const requestOtp = async (
    targetEmail: string,
    { isResend }: { isResend: boolean }
  ): Promise<'sent' | 'fallback'> => {
    if (!apiBase) {
      await finishLocalLogin('VITE_API_URL is not set');
      return 'fallback';
    }
    try {
      await apiFetch<{ ok: boolean }>(apiBase, '/api/auth/send-otp', {
        email: targetEmail,
      });
      setResendSecondsLeft(RESEND_COOLDOWN_SECONDS);
      setInfo(
        isResend
          ? `New code sent to ${targetEmail}.`
          : `We sent a 6-digit code to ${targetEmail}. Check your email.`
      );
      return 'sent';
    } catch (err) {
      if (err instanceof ApiResponseError && err.status === 429) {
        const retryAfter = Number(
          (err.body as { retryAfter?: number } | null)?.retryAfter ?? 0
        );
        setResendSecondsLeft(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter
            : RESEND_COOLDOWN_SECONDS
        );
        throw err;
      }
      if (isFallbackError(err)) {
        await finishLocalLogin(
          err instanceof ApiResponseError && err.status === 503
            ? 'API returned 503 (no email transport)'
            : 'API unreachable'
        );
        return 'fallback';
      }
      throw err;
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    setLoginError(null);
    setInfo(null);
    try {
      const outcome = await requestOtp(email, { isResend: false });
      if (outcome === 'sent') {
        setStep('otp');
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not send sign-in code.';
      setLoginError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (resending || resendSecondsLeft > 0 || !email) return;
    setResending(true);
    setLoginError(null);
    setInfo(null);
    try {
      await requestOtp(email, { isResend: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not resend code.';
      setLoginError(message);
    } finally {
      setResending(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== OTP_LENGTH) {
      setLoginError('Enter the 6-digit code from your email.');
      return;
    }
    if (!apiBase) {
      await finishLocalLogin('VITE_API_URL is not set');
      return;
    }
    setSubmitting(true);
    setLoginError(null);
    setInfo(null);
    try {
      const data = await apiFetch<{
        token: string;
        user: { email: string };
      }>(apiBase, '/api/auth/verify-otp', { email, otp });

      setAuthToken(data.token);
      saveUser({ email: data.user.email });
      try {
        await authApi.saveUser({ email: data.user.email });
      } catch {
        // saveUser already persisted locally; ignore secondary failures.
      }
      window.location.hash = '#/';
    } catch (err) {
      if (isFallbackError(err)) {
        await finishLocalLogin('API unreachable during verification');
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Could not verify code.';
      setLoginError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditEmail = () => {
    setStep('email');
    setOtp('');
    setLoginError(null);
    setInfo(null);
  };

  const otpButtonDisabled = submitting || otp.length !== OTP_LENGTH;
  const resendDisabled = resending || resendSecondsLeft > 0 || submitting;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f150f',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: '80px',
            height: '80px',
            background: '#3ddb6f',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '24px',
            boxShadow: '0 12px 28px rgba(38, 110, 58, 0.35)',
          }}
        >
          <span style={{ color: '#ffffff', fontSize: '30px', fontWeight: 700 }}>IQ</span>
        </div>
        <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Zorvo IQ</h1>
        <p style={{ color: '#94a3b8', textAlign: 'center', margin: '10px 0 28px' }}>
          {step === 'email'
            ? 'Sign in to start your inspection workflow'
            : 'Check your email for the 6-digit code'}
        </p>

        {step === 'email' && (
          <form
            onSubmit={handleEmailSubmit}
            style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <div>
              <label style={labelBase}>Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                style={inputBase}
              />
            </div>

            {loginError && (
              <div
                style={{
                  borderRadius: '12px',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  background: 'rgba(127, 29, 29, 0.3)',
                  padding: '10px 12px',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: '11px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#fca5a5',
                  }}
                >
                  {loginError}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                ...buttonBase,
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.5 : 1,
              }}
            >
              {submitting ? 'Sending Code...' : 'Send Sign-In Code'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form
            onSubmit={handleOtpSubmit}
            style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <div
              style={{
                borderRadius: '12px',
                border: '1px solid #1f2e1f',
                background: '#111810',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <p style={{ ...labelBase, marginBottom: 4, marginLeft: 0 }}>Signing in as</p>
                <p
                  style={{
                    margin: 0,
                    color: '#e2e8f0',
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {email}
                </p>
              </div>
              <button
                type="button"
                onClick={handleEditEmail}
                style={{
                  background: 'transparent',
                  color: '#3ddb6f',
                  border: '1px solid rgba(61, 219, 111, 0.4)',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Edit
              </button>
            </div>

            <div>
              <label style={labelBase}>Verification Code</label>
              <input
                ref={otpInputRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={OTP_LENGTH}
                required
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))
                }
                placeholder="123456"
                style={{
                  ...inputBase,
                  letterSpacing: '0.5em',
                  fontSize: '20px',
                  textAlign: 'center',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            </div>

            {info && !loginError && (
              <div
                style={{
                  borderRadius: '12px',
                  border: '1px solid rgba(61, 219, 111, 0.35)',
                  background: 'rgba(38, 110, 58, 0.18)',
                  padding: '10px 12px',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: '12px',
                    color: '#bbf7d0',
                  }}
                >
                  {info}
                </p>
              </div>
            )}

            {loginError && (
              <div
                style={{
                  borderRadius: '12px',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  background: 'rgba(127, 29, 29, 0.3)',
                  padding: '10px 12px',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: '11px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#fca5a5',
                  }}
                >
                  {loginError}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={otpButtonDisabled}
              style={{
                ...buttonBase,
                cursor: otpButtonDisabled ? 'not-allowed' : 'pointer',
                opacity: otpButtonDisabled ? 0.5 : 1,
              }}
            >
              {submitting ? 'Verifying...' : 'Verify & Sign In'}
            </button>

            <button
              type="button"
              onClick={handleResend}
              disabled={resendDisabled}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'transparent',
                color: resendDisabled ? '#475569' : '#3ddb6f',
                border: '1px solid #1f2e1f',
                borderRadius: '12px',
                fontWeight: 600,
                cursor: resendDisabled ? 'not-allowed' : 'pointer',
              }}
            >
              {resending
                ? 'Resending...'
                : resendSecondsLeft > 0
                  ? `Resend code in ${resendSecondsLeft}s`
                  : 'Resend code'}
            </button>
          </form>
        )}

        <p style={{ marginTop: '24px', fontSize: '12px', color: '#64748b', textAlign: 'center', padding: '0 20px' }}>
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};

export default Login;

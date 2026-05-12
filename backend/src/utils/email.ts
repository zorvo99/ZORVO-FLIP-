import { env, hasSmtpTransport } from '../config/env.js';

export interface SendOtpEmailParams {
  to: string;
  code: string;
  ttlMinutes: number;
}

export class EmailTransportUnavailableError extends Error {
  constructor(message = 'Email transport is not configured') {
    super(message);
    this.name = 'EmailTransportUnavailableError';
  }
}

const buildSubject = () => 'Your Zorvo IQ sign-in code';

const buildText = ({ code, ttlMinutes }: { code: string; ttlMinutes: number }) =>
  `Your Zorvo IQ sign-in code is: ${code}\n\nThis code expires in ${ttlMinutes} minutes. ` +
  `If you did not request this code, you can safely ignore this email.`;

const buildHtml = ({ code, ttlMinutes }: { code: string; ttlMinutes: number }) => `
  <div style="font-family:Inter,Arial,sans-serif;background:#0f150f;color:#e2e8f0;padding:32px;border-radius:16px;max-width:480px;">
    <h1 style="margin:0 0 16px;font-size:22px;color:#f1f5f9;">Sign in to Zorvo IQ</h1>
    <p style="margin:0 0 20px;color:#94a3b8;">Use this one-time code to finish signing in:</p>
    <div style="font-size:34px;letter-spacing:10px;font-weight:700;color:#3ddb6f;background:#111810;border:1px solid #1f2e1f;padding:18px 24px;border-radius:12px;text-align:center;">${code}</div>
    <p style="margin:20px 0 0;color:#64748b;font-size:13px;">This code expires in ${ttlMinutes} minutes. If you didn't request it, you can ignore this email.</p>
  </div>
`;

const logOtpToConsole = ({ to, code, ttlMinutes }: SendOtpEmailParams): void => {
  if (!env.OTP_DEV_LOG) return;
  console.log(
    `\n[zorvo-iq-api] Dev OTP for ${to}: ${code} (expires in ${ttlMinutes} min)\n`
  );
};

let cachedTransporter: unknown = null;
let transporterInitFailed = false;

const getTransporter = async (): Promise<unknown | null> => {
  if (cachedTransporter || transporterInitFailed) return cachedTransporter;
  if (!hasSmtpTransport) return null;

  try {
    const mod = (await import('nodemailer')) as unknown as {
      default?: { createTransport: (opts: unknown) => unknown };
      createTransport?: (opts: unknown) => unknown;
    };
    const createTransport = mod.default?.createTransport ?? mod.createTransport;
    if (!createTransport) {
      throw new Error('nodemailer.createTransport not found');
    }
    cachedTransporter = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE ?? false,
      ...(env.SMTP_USER && env.SMTP_PASS
        ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }
        : {}),
    });
    return cachedTransporter;
  } catch (err) {
    transporterInitFailed = true;
    console.warn(
      '[zorvo-iq-api] Failed to initialize SMTP transport. Falling back to console-only OTP.',
      err instanceof Error ? err.message : err
    );
    return null;
  }
};

export const sendOtpEmail = async (params: SendOtpEmailParams): Promise<void> => {
  const transporter = await getTransporter();

  if (!transporter) {
    logOtpToConsole(params);
    if (!hasSmtpTransport) {
      throw new EmailTransportUnavailableError();
    }
    return;
  }

  const sendMail = (transporter as { sendMail: (opts: unknown) => Promise<unknown> })
    .sendMail;

  try {
    await sendMail.call(transporter, {
      from: env.SMTP_FROM,
      to: params.to,
      subject: buildSubject(),
      text: buildText(params),
      html: buildHtml(params),
    });
  } catch (err) {
    logOtpToConsole(params);
    console.warn(
      '[zorvo-iq-api] SMTP send failed. OTP also logged to console for dev.',
      err instanceof Error ? err.message : err
    );
    throw err;
  }
};

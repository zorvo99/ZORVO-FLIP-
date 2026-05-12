import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  /** Frontend origin for Stripe redirect URLs when STRIPE_*_URL not set */
  APP_URL: z.string().url().default('http://localhost:5173'),

  OTP_TTL_MINUTES: z.coerce.number().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().default(30),
  OTP_DEV_LOG: z
    .string()
    .optional()
    .default('true')
    .transform(v => v !== 'false' && v !== '0'),

  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.preprocess(
    val => val === true || val === 'true' || val === '1' || val === 1,
    z.boolean()
  ).optional().default(false),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default(''),

  STRIPE_SECRET_KEY: z.string().optional().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),
  STRIPE_SUCCESS_URL: z.string().url().optional(),
  STRIPE_CANCEL_URL: z.string().url().optional(),
  STRIPE_DEFAULT_PRICE_ID: z.string().optional().default(''),
});

export const env = envSchema.parse(process.env);

export const hasSmtpTransport = Boolean(env.SMTP_HOST && env.SMTP_FROM);

export const getStripeSuccessUrl = (): string =>
  env.STRIPE_SUCCESS_URL ?? `${env.APP_URL}/#/`;

export const getStripeCancelUrl = (): string => env.STRIPE_CANCEL_URL ?? `${env.APP_URL}/#/`;

import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../db/prisma.js';
import { signJwt } from '../utils/jwt.js';
import { requireAuth } from '../middleware/auth.js';
import {
  generateOtpCode,
  hashOtpCode,
  normalizeEmail,
  verifyOtpCode,
} from '../utils/otp.js';
import { EmailTransportUnavailableError, sendOtpEmail } from '../utils/email.js';
import { env } from '../config/env.js';

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const sendOtpSchema = z.object({
  email: z.string().email(),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/u, 'OTP must be a 6 digit code'),
});

export const authRouter = Router();

authRouter.post('/auth/register', async (req, res) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }

  const { email, password } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'Email already exists' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash },
  });

  const token = signJwt({ userId: user.id, email: user.email });
  res.status(201).json({ token, user: { email: user.email } });
});

authRouter.post('/auth/login', async (req, res) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = signJwt({ userId: user.id, email: user.email });
  res.json({ token, user: { email: user.email } });
});

authRouter.post('/auth/send-otp', async (req, res) => {
  const parsed = sendOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid email' });
    return;
  }

  const email = normalizeEmail(parsed.data.email);
  const ttlMinutes = env.OTP_TTL_MINUTES;
  const cooldownSeconds = env.OTP_RESEND_COOLDOWN_SECONDS;

  const recent = await prisma.otpCode.findFirst({
    where: { email, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (recent && cooldownSeconds > 0) {
    const ageSeconds = Math.floor((Date.now() - recent.createdAt.getTime()) / 1000);
    if (ageSeconds < cooldownSeconds) {
      const retryAfter = cooldownSeconds - ageSeconds;
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: 'Please wait before requesting another code.',
        retryAfter,
      });
      return;
    }
  }

  await prisma.otpCode.updateMany({
    where: { email, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = generateOtpCode();
  const codeHash = await hashOtpCode(code);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await prisma.otpCode.create({
    data: { email, codeHash, expiresAt },
  });

  try {
    await sendOtpEmail({ to: email, code, ttlMinutes });
    res.status(200).json({ ok: true, expiresInMinutes: ttlMinutes });
  } catch (err) {
    if (err instanceof EmailTransportUnavailableError) {
      res
        .status(503)
        .json({ error: 'Email transport is not configured on this environment.' });
      return;
    }
    console.error('[auth/send-otp] Failed to send email:', err);
    res.status(502).json({ error: 'Failed to send sign-in code.' });
  }
});

authRouter.post('/auth/verify-otp', async (req, res) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }

  const email = normalizeEmail(parsed.data.email);
  const submitted = parsed.data.otp;

  const record = await prisma.otpCode.findFirst({
    where: { email, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) {
    res.status(400).json({ error: 'No active code. Request a new one.' });
    return;
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    await prisma.otpCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    res.status(400).json({ error: 'Code expired. Request a new one.' });
    return;
  }

  if (record.attempts >= env.OTP_MAX_ATTEMPTS) {
    await prisma.otpCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    res.status(429).json({ error: 'Too many attempts. Request a new code.' });
    return;
  }

  const matches = await verifyOtpCode(submitted, record.codeHash);

  if (!matches) {
    await prisma.otpCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    res.status(400).json({ error: 'Incorrect code.' });
    return;
  }

  await prisma.otpCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email },
  });

  const token = signJwt({ userId: user.id, email: user.email });
  res.json({ token, user: { email: user.email } });
});

authRouter.get('/auth/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    select: { id: true, email: true },
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user });
});

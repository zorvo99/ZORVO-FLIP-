import { Router } from 'express';
import { z } from 'zod';
import Stripe from 'stripe';
import { env, getStripeCancelUrl, getStripeSuccessUrl } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const checkoutBodySchema = z.object({
  projectId: z.string().min(1),
  priceId: z.string().min(1).optional(),
});

const getStripe = (): Stripe | null => {
  if (!env.STRIPE_SECRET_KEY) return null;
  return new Stripe(env.STRIPE_SECRET_KEY);
};

export const stripeRouter = Router();

stripeRouter.post('/create-checkout-session', requireAuth, async (req, res) => {
  const parsed = checkoutBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body' });
    return;
  }

  const priceId = parsed.data.priceId || env.STRIPE_DEFAULT_PRICE_ID;
  if (!priceId) {
    res.status(400).json({ error: 'priceId is required (or set STRIPE_DEFAULT_PRICE_ID)' });
    return;
  }

  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: 'Stripe is not configured' });
    return;
  }

  const userId = req.auth!.userId;
  const { projectId } = parsed.data;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: getStripeSuccessUrl(),
    cancel_url: getStripeCancelUrl(),
    metadata: {
      projectId,
      userId,
    },
  });

  if (!session.url) {
    res.status(500).json({ error: 'Checkout session missing URL' });
    return;
  }

  res.json({ url: session.url });
});

stripeRouter.get('/unlock-status', requireAuth, async (req, res) => {
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : '';
  if (!projectId) {
    res.status(400).json({ error: 'projectId query required' });
    return;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: req.auth!.userId },
    select: { isUnlocked: true },
  });

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  res.json({ unlocked: project.isUnlocked });
});

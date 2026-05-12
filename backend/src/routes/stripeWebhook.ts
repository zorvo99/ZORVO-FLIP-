import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';

const getStripe = (): Stripe | null => {
  if (!env.STRIPE_SECRET_KEY) return null;
  return new Stripe(env.STRIPE_SECRET_KEY);
};

export const stripeWebhookHandler = async (req: Request, res: Response): Promise<void> => {
  const stripe = getStripe();
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    res.status(503).send('Stripe webhook not configured');
    return;
  }

  const sig = req.headers['stripe-signature'];
  if (typeof sig !== 'string') {
    res.status(400).send('Missing stripe-signature');
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    res.status(400).send('Webhook signature verification failed');
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const projectId = session.metadata?.projectId;
    const userId = session.metadata?.userId;
    if (projectId && userId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId },
      });
      if (project) {
        await prisma.project.update({
          where: { id: projectId },
          data: { isUnlocked: true },
        });
      }
    }
  }

  res.json({ received: true });
};

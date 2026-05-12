import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { draftsRouter } from './routes/drafts.js';
import { stripeRouter } from './routes/stripe.js';
import { stripeWebhookHandler } from './routes/stripeWebhook.js';

export const app = express();

app.use(cors({ origin: env.CORS_ORIGIN }));

app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.json({ limit: '2mb' }));

app.use('/api', healthRouter);
app.use('/api', authRouter);
app.use('/api', projectsRouter);
app.use('/api', draftsRouter);
app.use('/api', stripeRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const draftSchema = z.object({
  walkthroughStep: z.enum(['select', 'detail']),
  selectedRoomCounts: z.record(z.number()).optional().default({}),
  detailQueue: z.array(z.any()),
  currentDetailIndex: z.number().int().nonnegative(),
});

export const draftsRouter = Router();
draftsRouter.use(requireAuth);

draftsRouter.get('/drafts/:projectId', async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.projectId, userId: req.auth!.userId },
  });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const draft = await prisma.walkthroughDraft.findUnique({
    where: { projectId: project.id },
  });
  res.json({ draft });
});

draftsRouter.put('/drafts/:projectId', async (req, res) => {
  const parsed = draftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid draft payload' });
    return;
  }

  const project = await prisma.project.findFirst({
    where: { id: req.params.projectId, userId: req.auth!.userId },
  });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const draft = await prisma.walkthroughDraft.upsert({
    where: { projectId: project.id },
    create: { projectId: project.id, ...parsed.data },
    update: parsed.data,
  });
  res.json({ draft });
});

draftsRouter.delete('/drafts/:projectId', async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.projectId, userId: req.auth!.userId },
  });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  await prisma.walkthroughDraft.deleteMany({ where: { projectId: project.id } });
  res.status(204).send();
});

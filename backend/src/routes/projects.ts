import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(''),
  address: z.string().min(1),
  postcode: z.string().min(1),
  totalBudget: z.number().nonnegative(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  address: z.string().min(1).optional(),
  postcode: z.string().min(1).optional(),
  totalBudget: z.number().nonnegative().optional(),
});

const updateRoomSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  dimensions: z.any().optional(),
  budget: z.number().optional(),
  photoUrls: z.any().optional(),
  intendedScope: z.any().optional(),
  notes: z.string().optional(),
  scopeInputs: z.any().optional(),
  expenses: z.any().optional(),
});

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

projectsRouter.get('/projects', async (req, res) => {
  const projects = await prisma.project.findMany({
    where: { userId: req.auth!.userId },
    include: { rooms: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ projects });
});

projectsRouter.post('/projects', async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid project payload' });
    return;
  }

  const project = await prisma.project.create({
    data: { ...parsed.data, userId: req.auth!.userId },
  });
  res.status(201).json({ project });
});

projectsRouter.get('/projects/:projectId', async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.projectId, userId: req.auth!.userId },
    include: { rooms: true },
  });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json({ project });
});

projectsRouter.patch('/projects/:projectId', async (req, res) => {
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid project update payload' });
    return;
  }

  const project = await prisma.project.findFirst({
    where: { id: req.params.projectId, userId: req.auth!.userId },
  });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const updated = await prisma.project.update({
    where: { id: project.id },
    data: parsed.data,
  });
  res.json({ project: updated });
});

projectsRouter.patch('/projects/:projectId/unlock', async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.projectId, userId: req.auth!.userId },
  });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  const updated = await prisma.project.update({
    where: { id: project.id },
    data: { isUnlocked: true },
  });
  res.json({ project: updated });
});

projectsRouter.patch('/projects/:projectId/rooms/:roomId', async (req, res) => {
  const parsed = updateRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid room payload' });
    return;
  }

  const project = await prisma.project.findFirst({
    where: { id: req.params.projectId, userId: req.auth!.userId },
  });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const existingRoom = await prisma.room.findFirst({
    where: { id: req.params.roomId, projectId: project.id },
  });

  if (!existingRoom) {
    const created = await prisma.room.create({
      data: {
        id: req.params.roomId,
        projectId: project.id,
        name: parsed.data.name || 'Room',
        type: parsed.data.type || 'room',
        dimensions: parsed.data.dimensions || { length: 3, width: 3, height: 2.4 },
        budget: parsed.data.budget ?? 0,
        photoUrls: parsed.data.photoUrls || [],
        intendedScope: parsed.data.intendedScope || [],
        notes: parsed.data.notes || '',
        scopeInputs: parsed.data.scopeInputs || {},
        expenses: parsed.data.expenses || [],
      },
    });
    res.status(201).json({ room: created });
    return;
  }

  const updated = await prisma.room.update({
    where: { id: existingRoom.id },
    data: parsed.data,
  });
  res.json({ room: updated });
});

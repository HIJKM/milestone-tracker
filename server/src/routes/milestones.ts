import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// Get all milestones for the current user
router.get('/', isAuthenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const milestones = await prisma.milestone.findMany({
      where: { userId: req.user!.id },
      orderBy: { order: 'asc' },
    });
    res.json(milestones);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch milestones' });
  }
});

// Create a new milestone
router.post('/', isAuthenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, description, type, tags } = req.body;

    // Get the max order for the user's milestones
    const maxOrder = await prisma.milestone.aggregate({
      where: { userId: req.user!.id },
      _max: { order: true },
    });

    const milestone = await prisma.milestone.create({
      data: {
        title,
        description: description || '',
        type: type || 'feature',
        tags: tags || [],
        order: (maxOrder._max.order ?? -1) + 1,
        userId: req.user!.id,
      },
    });

    res.status(201).json(milestone);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create milestone' });
  }
});

// Update a milestone
router.patch('/:id', isAuthenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, type, tags, completed } = req.body;

    // Verify ownership
    const existing = await prisma.milestone.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!existing) {
      res.status(404).json({ error: 'Milestone not found' });
      return;
    }

    // If trying to complete, check if previous milestones are completed
    if (completed === true && !existing.completed) {
      const previousIncomplete = await prisma.milestone.findFirst({
        where: {
          userId: req.user!.id,
          order: { lt: existing.order },
          completed: false,
        },
      });

      if (previousIncomplete) {
        res.status(400).json({ error: 'Complete previous milestones first' });
        return;
      }
    }

    // Cannot uncheck completed milestone
    if (completed === false && existing.completed) {
      res.status(400).json({ error: 'Cannot uncheck completed milestone' });
      return;
    }

    const milestone = await prisma.milestone.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(type !== undefined && { type }),
        ...(tags !== undefined && { tags }),
        ...(completed !== undefined && { completed }),
      },
    });

    res.json(milestone);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update milestone' });
  }
});

// Delete a milestone
router.delete('/:id', isAuthenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const existing = await prisma.milestone.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!existing) {
      res.status(404).json({ error: 'Milestone not found' });
      return;
    }

    await prisma.milestone.delete({ where: { id } });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete milestone' });
  }
});

// Reorder milestones
router.post('/reorder', isAuthenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderedIds } = req.body as { orderedIds: string[] };

    // Update order for each milestone
    await Promise.all(
      orderedIds.map((id, index) =>
        prisma.milestone.updateMany({
          where: { id, userId: req.user!.id },
          data: { order: index },
        })
      )
    );

    const milestones = await prisma.milestone.findMany({
      where: { userId: req.user!.id },
      orderBy: { order: 'asc' },
    });

    res.json(milestones);
  } catch (error) {
    res.status(500).json({ error: 'Failed to reorder milestones' });
  }
});

export default router;

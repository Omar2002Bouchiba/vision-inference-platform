import { Router } from 'express';
import { z } from 'zod';
import { UniqueConstraintError } from 'sequelize';
import { Dataset } from '../models';
import { asyncHandler, requireAuth, requireCredit, validateUuidParam } from '../middleware/http';

const router = Router();
router.param('id', validateUuidParam);
const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
});
const updateSchema = createSchema.partial().refine((value) => Object.keys(value).length > 0, 'Provide name or tags to update.');

router.use(requireAuth, requireCredit);

router.post('/', asyncHandler(async (req, res) => {
  const input = createSchema.parse(req.body);
  const ownerId = req.auth!.id;
  const exists = await Dataset.findOne({ where: { ownerId, name: input.name } });
  if (exists) {
    res.status(409).json({ error: 'A dataset with this name already exists for this user.' });
    return;
  }
  try {
    const dataset = await Dataset.create({ ownerId, ...input });
    res.status(201).json(dataset);
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      res.status(409).json({ error: 'A dataset with this name already exists for this user.' });
      return;
    }
    throw error;
  }
}));

router.get('/', asyncHandler(async (req, res) => {
  const datasets = await Dataset.findAll({ where: { ownerId: req.auth!.id }, order: [['createdAt', 'DESC']] });
  res.json(datasets);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const dataset = await Dataset.findOne({ where: { id: req.params.id, ownerId: req.auth!.id } });
  if (!dataset) {
    res.status(404).json({ error: 'Dataset not found.' });
    return;
  }
  res.json(dataset);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const input = updateSchema.parse(req.body);
  const dataset = await Dataset.findOne({ where: { id: req.params.id, ownerId: req.auth!.id } });
  if (!dataset) {
    res.status(404).json({ error: 'Dataset not found.' });
    return;
  }
  if (input.name && input.name !== dataset.name) {
    const duplicate = await Dataset.findOne({ where: { ownerId: req.auth!.id, name: input.name } });
    if (duplicate) {
      res.status(409).json({ error: 'A dataset with this name already exists for this user.' });
      return;
    }
  }
  try {
    await dataset.update(input);
    res.json(dataset);
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      res.status(409).json({ error: 'A dataset with this name already exists for this user.' });
      return;
    }
    throw error;
  }
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const dataset = await Dataset.findOne({ where: { id: req.params.id, ownerId: req.auth!.id } });
  if (!dataset) {
    res.status(404).json({ error: 'Dataset not found.' });
    return;
  }
  await dataset.destroy();
  res.status(204).send();
}));

export default router;

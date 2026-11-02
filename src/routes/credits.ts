import { Router } from 'express';
import { z } from 'zod';
import { sequelize } from '../config/database';
import { asyncHandler, requireAdmin, requireAuth, requireCredit } from '../middleware/http';
import { CreditTransaction, User } from '../models';

const router = Router();
const creditAmountSchema = z.number().positive().max(1_000_000).refine((value) => Number.isInteger(value * 10_000), 'Credit amount supports at most four decimal places.');
const topUpSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  amount: creditAmountSchema.optional(),
  credit: creditAmountSchema.optional(),
  newCredit: creditAmountSchema.optional(),
}).refine((input) => [input.amount, input.credit, input.newCredit].filter((value) => value !== undefined).length === 1, {
  path: ['amount'],
  message: 'Provide exactly one of amount, credit, or newCredit.',
}).transform((input) => ({ email: input.email, amount: input.amount ?? input.credit ?? input.newCredit! }));

router.get('/balance', requireAuth, requireCredit, asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.auth!.id, { attributes: ['creditBalance'] });
  res.json({ balance: Number(user?.creditBalance ?? 0) });
}));

// Admins must be able to restore a user's credits even if the admin's own balance is zero.
router.post('/top-up', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const input = topUpSchema.parse(req.body);
  const updated = await sequelize.transaction(async (transaction) => {
    // Keep the balance update and its audit-ledger entry atomic under concurrent top-ups.
    const user = await User.findOne({ where: { email: input.email }, transaction, lock: transaction.LOCK.UPDATE });
    if (!user) return null;
    user.creditBalance = Number(user.creditBalance) + input.amount;
    await user.save({ transaction });
    await CreditTransaction.create({
      userId: user.id,
      kind: 'ADMIN_TOP_UP',
      amount: input.amount,
      description: `Credit top-up by ${req.auth!.email}`,
    }, { transaction });
    return { email: user.email, balance: Number(user.creditBalance) };
  });
  if (!updated) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  res.json(updated);
}));

export default router;

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { jwtOptions, jwtPrivateKey } from '../config/jwt';
import { User } from '../models';
import { verifyPassword } from '../utils/password';
import { asyncHandler } from '../middleware/http';

const router = Router();
const loginSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(200),
});

router.post('/login', asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await User.findOne({ where: { email: input.email } });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    res.status(401).json({ error: 'Email or password is incorrect.' });
    return;
  }

  // The token contains identity and role metadata only; balance always comes from PostgreSQL.
  const token = jwt.sign(
    { email: user.email, role: user.role },
    jwtPrivateKey,
    { ...jwtOptions, subject: user.id },
  );
  res.json({ accessToken: token, tokenType: 'Bearer', expiresIn: 7200 });
}));

export default router;

import { Request, Response, NextFunction, RequestHandler, RequestParamHandler } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User } from '../models';
import { jwtOptions, jwtPublicKey } from '../config/jwt';

export function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const match = req.header('authorization')?.match(/^Bearer\s+(\S+)$/i);
  if (!match) {
    res.status(401).json({ error: 'A Bearer token is required.' });
    return;
  }
  try {
    const decoded = jwt.verify(match[1], jwtPublicKey, { algorithms: ['RS256'], issuer: jwtOptions.issuer });
    if (typeof decoded === 'string' || !decoded.sub || !decoded.email || (decoded.role !== 'user' && decoded.role !== 'admin')) {
      res.status(401).json({ error: 'Invalid token claims.' });
      return;
    }
    req.auth = { id: decoded.sub, email: decoded.email, role: decoded.role };
    next();
  } catch {
    res.status(401).json({ error: 'Token is invalid or expired.' });
  }
};

export const requireCredit: RequestHandler = async (req, res, next) => {
  try {
    // Balance is read from PostgreSQL on each request so a JWT cannot carry stale credit data.
    const user = await User.findByPk(req.auth?.id, { attributes: ['id', 'creditBalance'] });
    if (!user || Number(user.creditBalance) <= 0) {
      res.status(401).json({ error: 'User credit is exhausted.' });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.auth?.role !== 'admin') {
    res.status(403).json({ error: 'Administrator role required.' });
    return;
  }
  next();
};

export const validateUuidParam: RequestParamHandler = (_req, res, next, value, name) => {
  if (typeof value !== 'string' || !z.uuid().safeParse(value).success) {
    res.status(400).json({ error: `Route parameter '${name}' must be a valid UUID.` });
    return;
  }
  next();
};

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
    res.status(400).json({ error: 'Request validation failed.', details: 'issues' in error ? error.issues : undefined });
    return;
  }
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && error.code.startsWith('LIMIT_')) {
    res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: 'Upload limit exceeded or file was rejected.' });
    return;
  }
  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
    res.status(error.status).json({ error: error instanceof Error ? error.message : 'Invalid client request.' });
    return;
  }
  if (error instanceof Error && (error.name === 'InvalidMediaFileError' || error.name === 'InsufficientCreditError')) {
    res.status(error.name === 'InsufficientCreditError' ? 401 : 400).json({ error: error.message });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'Internal server error.' });
}

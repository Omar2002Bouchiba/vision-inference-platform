import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      auth?: { id: string; email: string; role: 'user' | 'admin' };
    }
  }
}

export {};

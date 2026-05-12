import { NextFunction, Request, Response } from 'express';
import { verifyJwt } from '../utils/jwt.js';

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    req.auth = verifyJwt(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

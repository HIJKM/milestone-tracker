import { Request, Response, NextFunction } from 'express';

export const isAuthenticated = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
};

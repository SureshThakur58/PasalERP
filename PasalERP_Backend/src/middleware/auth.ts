import type { RequestHandler } from 'express';
import { HttpError } from './errorHandler.js';
import { currentUser, verifyToken, ROLE_PERMISSIONS, type AuthUser } from '../services/authService.js';
import { runWithDatabase } from '../config/db.js';

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const header = String(req.headers.authorization ?? '');
    if (!header.startsWith('Bearer ')) throw new HttpError(401, 'Authentication required.');

    const token = header.slice(7).trim();
    const payload = verifyToken(token);
    const user = await currentUser(payload.sub, payload.database);
    req.authUser = user;

    runWithDatabase(payload.database, () => next());
  } catch (error) {
    next(error);
  }
};

export const requirePermission = (permission: string): RequestHandler => (req, _res, next) => {
  try {
    const user = req.authUser;
    if (!user) throw new HttpError(401, 'Authentication required.');
    const permissions = user.permissions ?? ROLE_PERMISSIONS[user.role] ?? [];
    if (!permissions.includes(permission)) throw new HttpError(403, `You do not have permission to access ${permission}.`);
    next();
  } catch (error) {
    next(error);
  }
};

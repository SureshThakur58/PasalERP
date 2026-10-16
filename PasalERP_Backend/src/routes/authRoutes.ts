import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import * as auth from '../services/authService.js';

const router = Router();

router.get('/databases', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await auth.listDatabases() });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const database = String(req.body?.database ?? '').trim();
  const username = String(req.body?.username ?? '');
  const password = String(req.body?.password ?? '');

  if (!database || !username || !password) {
    throw new HttpError(400, 'Database, user name and password are required.');
  }

  res.json({ success: true, data: await auth.login(database, username, password) });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.authUser });
}));

router.get('/users', requireAuth, requirePermission('users'), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await auth.listUsers(req.authUser!.database) });
}));

router.post('/users', requireAuth, requirePermission('users'), asyncHandler(async (req, res) => {
  res.status(201).json({
    success: true,
    data: await auth.createUser(req.authUser!.database, {
      username: String(req.body?.username ?? ''),
      displayName: String(req.body?.displayName ?? ''),
      password: String(req.body?.password ?? ''),
      role: req.body?.role,
    }),
  });
}));

router.put('/users/:id', requireAuth, requirePermission('users'), asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await auth.updateUser(req.authUser!.database, req.params.id, {
      displayName: req.body?.displayName,
      role: req.body?.role,
      isActive: req.body?.isActive,
      password: req.body?.password,
    }),
  });
}));

router.delete('/users/:id', requireAuth, requirePermission('users'), asyncHandler(async (req, res) => {
  await auth.deleteUser(req.authUser!.database, req.params.id);
  res.status(204).send();
}));

export default router;

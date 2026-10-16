import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import masterRoutes from './routes/masterRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import irdRoutes from './routes/irdRoutes.js';
import migrationRoutes from './routes/migrationRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import authRoutes from './routes/authRoutes.js';
import { requireAuth, requirePermission } from './middleware/auth.js';

export const app=express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({origin: env.CORS_ORIGIN.split(',').map(x=>x.trim()), credentials:true}));
app.use(express.json({limit:'25mb'}));
app.get('/api/health',(_req,res)=>res.json({success:true,service:'nepal-ird-erp-backend',time:new Date().toISOString()}));

// Authentication endpoints: database discovery and login are public.
// User management and session verification protect themselves.
app.use('/api/auth', authRoutes);

app.use('/api', requireAuth);

// Backend permission boundary. The UI hides modules too, but authorization is
// enforced here so role restrictions cannot be bypassed by direct API calls.
app.use('/api', (req, _res, next) => {
  const path = req.path;
  const permission =
    path.startsWith('/dashboard') ? 'dashboard' :
    path.startsWith('/ird/') ? 'ird' :
    path.startsWith('/migration/') ? 'setup' :
    path.startsWith('/sales') ? 'sales' :
    path.startsWith('/purchases') ? 'purchase' :
    path.startsWith('/journals') || path.startsWith('/accounts') || path.startsWith('/account-mappings') ? 'accounting' :
    path.startsWith('/stock-transfers') || path.startsWith('/stock-movements') || path.startsWith('/batches') ? 'inventory' :
    path.startsWith('/settings') ? 'setup' :
    path.startsWith('/warehouses') || path.startsWith('/partners') || path.startsWith('/items') ? 'master_data' :
    null;

  if (!permission) return next();
  return requirePermission(permission)(req, _res, next);
});

app.use('/api',masterRoutes);
app.use('/api',transactionRoutes);
app.use('/api/ird',irdRoutes);
app.use('/api/dashboard',dashboardRoutes);
app.use('/api/migration',migrationRoutes);
app.use((_req,res)=>res.status(404).json({success:false,message:'API route not found'}));
app.use(errorHandler);

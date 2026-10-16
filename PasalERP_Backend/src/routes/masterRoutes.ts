import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { HttpError } from '../middleware/errorHandler.js';
import { panSchema } from '../utils/validation.js';
import * as m from '../services/masterService.js';
import * as accountService from '../services/accountService.js';
const router=Router();
// const requirePan=(b:any)=>{ try{panSchema.parse(String(b.panNumber??''));}catch{throw new HttpError(400,'Nepal PAN must be exactly 9 digits');} if(b.businessNature!==undefined && !['VAT','PAN'].includes(String(b.businessNature))) throw new HttpError(400,'businessNature must be VAT or PAN'); };

const requirePan = (b: any) => {
  try {
    panSchema.parse(String(b.panNumber ?? ''));
  } catch {
    throw new HttpError(
      400,
      'Nepal PAN must be exactly 9 digits'
    );
  }

  if (
    b.businessNature !== undefined &&
    !['VAT', 'PAN'].includes(String(b.businessNature))
  ) {
    throw new HttpError(
      400,
      'businessNature must be VAT or PAN'
    );
  }

  if (b.vatRate !== undefined) {
    const vatRate = Number(b.vatRate);

    if (
      !Number.isFinite(vatRate) ||
      vatRate < 0 ||
      vatRate > 100
    ) {
      throw new HttpError(
        400,
        'VAT rate must be between 0 and 100.'
      );
    }
  }
};

router.get('/settings',asyncHandler(async(_req,res)=>res.json({success:true,data:await m.getSettings()})));
router.put('/settings',asyncHandler(async(req,res)=>{ requirePan(req.body); res.json({success:true,data:await m.upsertSettings(req.body)}); }));

router.get('/warehouses',asyncHandler(async(_req,res)=>res.json({success:true,data:await m.listWarehouses()})));
router.post('/warehouses',asyncHandler(async(req,res)=>res.status(201).json({success:true,data:await m.createWarehouse(req.body)})));
router.put('/warehouses/:id',asyncHandler(async(req,res)=>res.json({success:true,data:await m.updateWarehouse(req.params.id,req.body)})));
router.delete('/warehouses/:id',asyncHandler(async(req,res)=>{await m.deleteWarehouse(req.params.id);res.status(204).send();}));

router.get('/partners',asyncHandler(async(_req,res)=>res.json({success:true,data:await m.listPartners()})));
router.post('/partners',asyncHandler(async(req,res)=>{requirePan(req.body);res.status(201).json({success:true,data:await m.createPartner(req.body)});}));
router.put('/partners/:id',asyncHandler(async(req,res)=>{requirePan(req.body);res.json({success:true,data:await m.updatePartner(req.params.id,req.body)});}));
router.delete('/partners/:id',asyncHandler(async(req,res)=>{await m.deletePartner(req.params.id);res.status(204).send();}));

router.get('/items',asyncHandler(async(_req,res)=>res.json({success:true,data:await m.listItems()})));
router.post('/items',asyncHandler(async(req,res)=>res.status(201).json({success:true,data:await m.createItem(req.body)})));
router.put('/items/:id',asyncHandler(async(req,res)=>res.json({success:true,data:await m.updateItem(req.params.id,req.body)})));
router.delete('/items/:id',asyncHandler(async(req,res)=>{await m.deleteItem(req.params.id);res.status(204).send();}));

//router.get('/accounts',asyncHandler(async(_req,res)=>res.json({success:true,data:await m.listAccounts()})));
router.get('/batches',asyncHandler(async(req,res)=>res.json({success:true,data:await m.listBatches(String(req.query.itemId||'')||undefined,String(req.query.warehouseId||'')||undefined)})));

router.get(
  '/accounts',
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: await accountService.listAccounts()
    });
  })
);

router.post(
  '/accounts',
  asyncHandler(async (req, res) => {
    res.status(201).json({
      success: true,
      data: await accountService.createAccount(req.body)
    });
  })
);

router.put(
  '/accounts/:code',
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: await accountService.updateAccount(
        req.params.code,
        req.body
      )
    });
  })
);

router.delete(
  '/accounts/:code',
  asyncHandler(async (req, res) => {
    await accountService.deleteAccount(req.params.code);
    res.status(204).send();
  })
);

router.post(
  '/accounts/initialize-standard',
  asyncHandler(async (_req, res) => {
    const result =
      await accountService.initializeStandardChart();

    res.status(201).json({
      success: true,
      data: result
    });
  })
);

router.get(
  '/account-mappings',
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: await accountService.listAccountMappings()
    });
  })
);

router.put(
  '/account-mappings/:mappingKey',
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: await accountService.updateAccountMapping(
        req.params.mappingKey,
        String(req.body.accountCode ?? '')
      )
    });
  })
);

export default router;

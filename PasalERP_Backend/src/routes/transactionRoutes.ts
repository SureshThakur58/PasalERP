import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { HttpError } from '../middleware/errorHandler.js';
import * as t from '../services/transactionService.js';

const router=Router();
const required=(v:any,name:string)=>{if(v===undefined||v===null||v==='')throw new HttpError(400,`${name} is required`);return v;};
const lines=(v:any,name:string)=>{if(!Array.isArray(v)||v.length===0)throw new HttpError(400,`${name} must contain at least one line`);return v;};

router.get('/sales',asyncHandler(async(_req,res)=>res.json({success:true,data:await t.listSales()})));
router.post('/sales',asyncHandler(async(req,res)=>{required(req.body.fiscalYear,'fiscalYear');required(req.body.mitiDate,'mitiDate');required(req.body.adDate,'adDate');required(req.body.customerId,'customerId');required(req.body.warehouseId,'warehouseId');lines(req.body.lines,'lines');res.status(201).json({success:true,data:await t.createSale(req.body)});}));

router.get('/purchases',asyncHandler(async(_req,res)=>res.json({success:true,data:await t.listPurchases()})));
router.post('/purchases',asyncHandler(async(req,res)=>{required(req.body.fiscalYear,'fiscalYear');required(req.body.mitiDate,'mitiDate');required(req.body.adDate,'adDate');required(req.body.vendorId,'vendorId');required(req.body.warehouseId,'warehouseId');lines(req.body.lines,'lines');res.status(201).json({success:true,data:await t.createPurchase(req.body)});}));

router.get('/journals',asyncHandler(async(_req,res)=>res.json({success:true,data:await t.listJournals()})));
router.post('/journals',asyncHandler(async(req,res)=>{
  required(req.body.fiscalYear,'fiscalYear');
  required(req.body.mitiDate,'mitiDate');
  required(req.body.adDate,'adDate');
  required(req.body.referenceNo,'referenceNo');
  required(req.body.narration,'narration');
  lines(req.body.lines,'lines');
  res.status(201).json({success:true,data:await t.createManualJournal(req.body)});
}));
router.get('/stock-transfers',asyncHandler(async(_req,res)=>res.json({success:true,data:await t.listTransfers()})));
router.post('/stock-transfers',asyncHandler(async(req,res)=>{required(req.body.fiscalYear,'fiscalYear');required(req.body.mitiDate,'mitiDate');required(req.body.adDate,'adDate');required(req.body.sourceWarehouseId,'sourceWarehouseId');required(req.body.targetWarehouseId,'targetWarehouseId');lines(req.body.items,'items');res.status(201).json({success:true,data:await t.createTransfer(req.body)});}));
router.get('/stock-movements',asyncHandler(async(req,res)=>res.json({success:true,data:await t.listStockMovements(String(req.query.itemId||'')||undefined,String(req.query.warehouseId||'')||undefined)})));
export default router;

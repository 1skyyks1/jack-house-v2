const express=require('express');
const {authenticate,serviceLimit,qqLimit}=require('../middleware/botScoreAuth');
const access=require('../services/botScoreAccessService');
const sync=require('../services/botScoreSyncService');
const {snapshot}=require('../services/botScoreSnapshotService');
const router=express.Router();
const wrap=fn=>async(req,res)=>{try{res.set('Cache-Control','no-store');res.json({data:await fn(req)});}catch(e){res.status(e.status||500).json({message:e.status?e.message:'成绩服务暂时不可用，请稍后重试。'});}};
router.use(authenticate,serviceLimit,qqLimit);
router.post('/link',wrap(req=>access.register(req.botQQ,req.body.secret)));
router.post('/link/finish',wrap(req=>access.finish(req.botQQ,req.body.code)));
router.use(async(req,res,next)=>{
 try{req.scoreUser=await access.authorize(req.botQQ,req.get('X-JHBot-Grant'),req.method==='POST'?'scores:sync':'scores:read');next();}
 catch(e){res.status(e.status||500).json({message:e.status?e.message:'成绩服务暂时不可用。'});}
});
router.get('/snapshot',wrap(req=>snapshot(req.scoreUser,{kind:req.query.kind,client:req.query.client,position:req.query.position===undefined?1:Number(req.query.position)})));
router.get('/analysis-source',wrap(req=>require('../services/botScoreAnalysisService').source(req.scoreUser,req.query.attempt_id)));
router.post('/sync',wrap(req=>sync.request(req.scoreUser)));
module.exports=router;

const express=require('express');
const auth=require('../middleware/authMiddleware');
const service=require('../services/botScoreAccessService');
const router=express.Router();
const wrap=fn=>async(req,res)=>{try{if(Number(req.user.status)!==0)throw new service.BotError('账号暂不可用。',403);res.set('Cache-Control','no-store');res.json({data:await fn(req)});}catch(e){res.status(e.status||500).json({message:e.status?e.message:'关联服务暂时不可用。'});}};
router.use(auth());
router.get('/challenge/:secret',wrap(req=>service.inspect(req.params.secret)));
router.post('/challenge/:secret/confirm',wrap(req=>service.confirm(req.params.secret,req.user)));
module.exports=router;

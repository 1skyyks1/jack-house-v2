const {timingSafeEqual} = require('node:crypto');
const rateLimit = require('express-rate-limit');
const {qqOf} = require('../services/botScoreAccessService');
function authenticate(req,res,next){
 const token=process.env.JHBOT_SCORE_SERVICE_TOKEN,events=process.env.JACKHOUSE_BOT_EVENT_TOKEN||process.env.JHBOT_EVENT_TOKEN;
 const supplied=req.get('Authorization')||'';
 if(!token||token.length<32||token===events||token===process.env.JWT_SECRET)return res.status(503).json({message:'成绩服务尚未配置。'});
 const expected=Buffer.from('Bearer '+token),actual=Buffer.from(supplied);
 if(req.headers.cookie||actual.length!==expected.length||!timingSafeEqual(actual,expected))return res.status(401).json({message:'机器人服务认证失败。'});
 try{req.botQQ=qqOf(req.get('X-JHBot-QQ'));}catch{return res.status(400).json({message:'QQ 身份无效。'});}
 // No req.user, site JWT or administrator permissions are minted here.
 next();
}
const serviceLimit=rateLimit({windowMs:60000,limit:180,keyGenerator:()=> 'score-service',standardHeaders:true,legacyHeaders:false,message:{message:'服务繁忙，请稍后重试。'}});
const qqLimit=rateLimit({windowMs:60000,limit:20,keyGenerator:req=>req.botQQ,standardHeaders:true,legacyHeaders:false,message:{message:'操作太频繁，请稍后重试。'}});
module.exports={authenticate,serviceLimit,qqLimit};

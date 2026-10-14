// Queue/recovery live in the bot's SQLite. The site only executes a bounded request.
const {select}=require('./pp/repository');
const {BotError}=require('./botScoreAccessService');
const {syncAllFeatured}=require('./featuredScoreSyncService');
let busy=false,windowStart=0,requests=0;
const cooldowns=new Map();
async function budget(){
 const now=Date.now();if(now-windowStart>=60000){windowStart=now;requests=0;}
 if(requests>=60)throw new BotError('同步请求已达本分钟预算，请稍后重试。',429);
 requests++;
}
async function request(user){
 const now=Date.now();
 for(const [id,time] of cooldowns)if(now-time>=60000)cooldowns.delete(id);
 if(!user.osu_uid||Number(user.status)!==0)throw new BotError('请先在网站关联 osu! 账号，并确认账号可用。',403);
 if(busy||cooldowns.has(Number(user.user_id)))throw new BotError('同步服务繁忙，请稍后再试。',429);
 cooldowns.set(Number(user.user_id),now);busy=true;
 try{
  const result=await syncAllFeatured(user,{source:'jhbot_sync',beforeRequest:budget,apiTimeout:12,apiRetries:0,guard:async tx=>{
   // syncScorePairs acquires this user's row lock before invoking the guard.
   const [current]=await select('SELECT status,osu_uid FROM `user` WHERE user_id=:userId',{userId:user.user_id},tx);
   if(!current||Number(current.status)!==0||String(current.osu_uid)!==String(user.osu_uid))throw new BotError('账号状态或 osu! 关联已变更，已取消同步。',403);
  }});
  return {status:'done',result};
 }finally{busy=false;}
}
module.exports={request,budget};

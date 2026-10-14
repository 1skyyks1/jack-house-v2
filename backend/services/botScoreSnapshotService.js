const db=require('../config/db');
const {User}=require('../models');
const {BotError}=require('./botScoreAccessService');
const {getUserPP,getBestPlays,getRankHistory}=require('./pp/query');
const {listUserScoreAttempts}=require('./userScoreAttemptService');
async function snapshot(authorized,{kind='recent',client,position=1}={}){
 if(!['recent','bp50','best','profile'].includes(kind))throw new BotError('查询类型无效。');
 if(client && !['stable','lazer'].includes(client))throw new BotError('客户端只支持 stable 或 lazer。');
 if(!Number.isSafeInteger(position)||position<1||position>10000)throw new BotError('BP 序号应为 1–10000。');
 return db.transaction({isolationLevel:'REPEATABLE READ'},async tx=>{
  // First consistent read pins the snapshot; summary and BP share rules and client.
  const profile=kind==='profile';
  const user=await User.findByPk(authorized.user_id,{
   attributes:['user_id','user_name','avatar','osu_uid','default_pp_client','status',...(profile?['created_time','qq','discord']:[])],
   ...(profile?{include:[{association:'roles',attributes:['role_code'],through:{attributes:[]}}]}:{}),transaction:tx});
  if(!user||Number(user.status)!==0||String(user.osu_uid??'')!==String(authorized.osu_uid??''))throw new BotError('账号暂不可用或关联已变更。',403);
  const player={user_id:Number(user.user_id),user_name:user.user_name,avatar:user.avatar,osu_uid:user.osu_uid};
  client=client||user.default_pp_client||'stable';const pp=await getUserPP(user.user_id,tx);
  const common={kind:kind==='recent'?'recent':'bp50',player,client,algorithm_version:pp.algorithm_version,summary:pp[client],calculation:pp.calculation};
  if(profile){
   const history=await getRankHistory({userId:user.user_id,client},tx);
   // Explicit public-profile fields only: never serialize the user model or permissions.
   return {...common,kind:'profile',player:{...player,created_time:user.created_time,qq:user.qq,discord:user.discord,
    roles:(user.roles||[]).map(role=>role.role_code).filter(code=>typeof code==='string')},
    snapshot_date:new Date().toISOString().slice(0,10),rank_history:history.history};
  }
  if(kind==='recent'){const attempts=await listUserScoreAttempts(user.user_id,{client,limit:1},tx);return {...common,score:attempts.data[0]||null};}
  const best=await getBestPlays({userId:user.user_id,client,limit:kind==='best'?1:50,offset:kind==='best'?position-1:0},tx);
  return {...common,scores:best.data};
 });
}
module.exports={snapshot};

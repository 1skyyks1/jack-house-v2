const {createHash,createHmac,timingSafeEqual,randomBytes,randomInt}=require('node:crypto');
const jwt=require('jsonwebtoken');
const {User}=require('../models');
const ticketStore=require('./botLinkTicketStore');

class BotError extends Error {constructor(message,status=400){super(message);this.status=status;}}
function qqOf(value){if(typeof value!=='string'||! /^[1-9]\d{4,19}$/.test(value))throw new BotError('QQ 身份无效。');return value;}
function challengeKey(){
 const token=process.env.JHBOT_SCORE_SERVICE_TOKEN;
 if(!token||token.length<32)throw new BotError('成绩服务尚未配置。',503);
 return createHash('sha256').update('jhbot-challenge-v1\0'+token).digest();
}
const CODE_ALPHABET='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function withTickets(fn){
 return ticketStore.withTickets(entries=>{
  const now=Date.now();
  for(let index=entries.length-1;index>=0;index--){
   const entry=entries[index];
   if(entry.expiresAt<=now)entries.splice(index,1);
   else{
    if(entry.codeExpiresAt<=now){delete entry.code;delete entry.proof;}
    if(entry.claimUntil<=now)delete entry.claim;
   }
  }
  return fn(entries);
 });
}
function inspectSigned(secret){
 if(typeof secret!=='string'||secret.length>512)throw new BotError('关联入口无效。');
 const parts=secret.split('.');if(parts.length!==2||parts.some(p=>! /^[A-Za-z0-9_-]+$/.test(p)))throw new BotError('关联入口无效。');
 const actual=Buffer.from(parts[1],'base64url'),expected=createHmac('sha256',challengeKey()).update(parts[0]).digest();
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new BotError('关联入口无效。');
 let data;try{data=JSON.parse(Buffer.from(parts[0],'base64url').toString());}catch{throw new BotError('关联入口无效。');}
 const now=Math.floor(Date.now()/1000);
 if(!data||data.v!==1||! /^[a-f0-9]{64}$/.test(data.nonce)||!Number.isSafeInteger(data.iat)||!Number.isSafeInteger(data.exp)||data.exp<=now||data.iat>now+30||data.exp-data.iat!==600)throw new BotError('关联入口已过期，请重新发送 /bind。',410);
 return {qq:qqOf(data.qq),nonce:data.nonce,expires_at:new Date(data.exp*1000).toISOString(),status:'created'};
}
function ticketEntry(entries,ticket){
 const entry=entries.find(entry=>entry.ticket===ticket);
 if(!entry)throw new BotError('关联入口已过期，请重新发送 /bind。',410);
 // Revalidate the signature, including after service-key rotation.
 inspectSigned(entry.secret);
 return entry;
}
async function register(qq,secret){
 const challenge=inspectSigned(secret);
 if(challenge.qq!==qqOf(qq))throw new BotError('关联入口不属于当前 QQ。',403);
 return withTickets(entries=>{
  const existing=entries.find(entry=>entry.secret===secret);
  if(existing)return {ticket:existing.ticket,expires_at:challenge.expires_at};
  if(entries.length>=512)throw new BotError('关联服务繁忙，请稍后重试。',429);
  let ticket;do{ticket=randomBytes(16).toString('base64url');}while(entries.some(entry=>entry.ticket===ticket));
  entries.push({ticket,secret,qq:challenge.qq,expiresAt:Date.parse(challenge.expires_at)});
  return {ticket,expires_at:challenge.expires_at};
 });
}
function inspect(secret){
 if(typeof secret==='string'&&/^[A-Za-z0-9_-]{22}$/.test(secret))return withTickets(entries=>inspectSigned(ticketEntry(entries,secret).secret));
 return inspectSigned(secret);
}
function confirm(secret,user){
 if(Number(user.status)!==0)throw new BotError('账号暂不可用。',403);
 const sign=challenge=>jwt.sign({purpose:'jhbot_link',qq:challenge.qq,nonce:challenge.nonce,osu_uid:user.osu_uid??null},process.env.JWT_SECRET,
  {algorithm:'HS256',issuer:'jackhouse',audience:'jhbot-link',subject:String(user.user_id),expiresIn:'3m'});
 if(typeof secret!=='string'||!/^[A-Za-z0-9_-]{22}$/.test(secret))return {code:sign(inspectSigned(secret))};
 return withTickets(entries=>{
  const entry=ticketEntry(entries,secret);
  if(entry.claim)throw new BotError('关联确认正在处理，请稍后重试。',409);
  let code;do{code=Array.from({length:8},()=>CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');}while(entries.some(entry=>entry.code===code));
  entry.code=code;entry.proof=sign(inspectSigned(entry.secret));entry.codeExpiresAt=Math.min(Date.now()+180000,entry.expiresAt);
  return {code};
 });
}
function decode(token,audience,purpose){
 try{
  if(typeof token!=='string'||token.length>2048)throw Error();
  const value=jwt.verify(token,process.env.JWT_SECRET,{algorithms:['HS256'],issuer:'jackhouse',audience});
  if(value.purpose!==purpose||! /^\d+$/.test(value.sub)||!Number.isSafeInteger(Number(value.sub))||Number(value.sub)<1)throw Error();
  qqOf(value.qq);return value;
 }catch{throw new BotError('授权无效或已过期，请重新 /bind。',403);}
}
async function account(value){
 const user=await User.findByPk(Number(value.sub),{attributes:['user_id','user_name','avatar','osu_uid','default_pp_client','status']});
 if(!user||Number(user.status)!==0||String(user.osu_uid??'')!==String(value.osu_uid??''))throw new BotError('账号状态或 osu! 关联已变更，请重新 /bind。',403);
 return user;
}
async function finish(qq,code){
 let pending;
 if(typeof code==='string'&&/^[a-zA-Z2-9]{8}$/.test(code)){
  const shortCode=code.toUpperCase();
  pending=await withTickets(entries=>{
   const entry=entries.find(entry=>entry.code===shortCode);
   if(!entry||entry.claim)throw new BotError('确认码无效或已过期，请重新 /bind。',403);
   ticketEntry(entries,entry.ticket);
   if(entry.qq!==qqOf(qq))throw new BotError('确认码不属于当前 QQ。',403);
   entry.claim=randomBytes(16).toString('hex');entry.claimUntil=Math.min(Date.now()+30000,entry.codeExpiresAt);
   return {ticket:entry.ticket,claim:entry.claim,proof:entry.proof};
  });
  code=pending.proof;
 }
 try{
 const proof=decode(code,'jhbot-link','jhbot_link');
 if(proof.qq!==qqOf(qq))throw new BotError('确认码不属于当前 QQ。',403);
 const user=await account(proof);
 const grant=jwt.sign({purpose:'jhbot_score',qq:proof.qq,osu_uid:user.osu_uid??null,scope:['scores:read','scores:sync']},process.env.JWT_SECRET,
  {algorithm:'HS256',issuer:'jackhouse',audience:'jhbot-score',subject:String(user.user_id),expiresIn:'30d'});
 const result={qq:proof.qq,nonce:proof.nonce,user_id:Number(user.user_id),grant,expires_at:Date.now()/1000+30*86400};
 if(pending)await withTickets(entries=>{
  const entry=ticketEntry(entries,pending.ticket);
  if(entry.claim!==pending.claim||entry.codeExpiresAt<=Date.now())throw new BotError('确认码无效或已过期，请重新 /bind。',403);
  entries.splice(entries.indexOf(entry),1);
 });
 return result;
 }catch(error){
  if(pending)await withTickets(entries=>{
   const entry=entries.find(entry=>entry.ticket===pending.ticket);
   if(entry?.claim===pending.claim)delete entry.claim;
  }).catch(()=>{});
  throw error;
 }
}
async function authorize(qq,token,scope='scores:read'){
 const value=decode(token,'jhbot-score','jhbot_score');
 if(value.qq!==qqOf(qq)||!Array.isArray(value.scope)||!value.scope.includes(scope))throw new BotError('授权不属于当前 QQ 或用途。',403);
 return account(value);
}
module.exports={BotError,qqOf,register,inspect,confirm,finish,authorize};

const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createHash,randomBytes}=require('node:crypto');

// Readers on Windows can briefly block an atomic replacement or lock cleanup.
function fileOperation(fn){
 for(let attempt=0;;attempt++){
  try{return fn();}
  catch(error){
   if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=40)throw error;
   Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5);
  }
 }
}

// A small shared, temporary cache for same-host PM2 workers. No account bindings live here.
function directory(){
 const scope=path.resolve(__dirname,'..')+'\0'+process.env.JHBOT_SCORE_SERVICE_TOKEN;
 return path.join(os.tmpdir(),'jackhouse-jhbot-links-'+createHash('sha256').update(scope).digest('hex').slice(0,20));
}
function createTicketStore(folder){
 const dataPath=path.join(folder,'pending.json');
 function participants(){
  const owners=[];
  for(const name of fs.readdirSync(folder)){
   const match=/^lock-([1-9]\d*)-([a-f0-9]{24})\.json$/.exec(name);
   if(!match)continue;
   const ownerPath=path.join(folder,name),pid=Number(match[1]);
   try{
    try{process.kill(pid,0);}catch(error){
     // Each participant owns a unique file; never delete another worker's new lock.
     if(error.code==='ESRCH'){try{fileOperation(()=>fs.unlinkSync(ownerPath));}catch{};continue;}
     if(error.code!=='EPERM')throw error;
    }
    try{owners.push({name,...JSON.parse(fs.readFileSync(ownerPath,'utf8'))});}
    catch(error){if(error.code!=='ENOENT')owners.push({name,choosing:true});}
   }catch(error){if(error.code!=='ENOENT')throw error;}
  }
  return owners;
 }
 async function withTickets(fn){
  fs.mkdirSync(folder,{recursive:true,mode:0o700});
  const identity='lock-'+process.pid+'-'+randomBytes(12).toString('hex')+'.json';
  const lockPath=path.join(folder,identity);
  const temporary=path.join(folder,process.pid+'-'+randomBytes(12).toString('hex')+'.tmp');
  const deadline=Date.now()+2000;
  fs.writeFileSync(lockPath,JSON.stringify({choosing:true}),{flag:'wx',mode:0o600});
  try{
   // Lamport's bakery order gives same-host workers mutual exclusion without stealing
   // an expired lock. Dead workers' unique participant files can safely be removed.
   const number=1+Math.max(0,...participants().map(owner=>Number(owner.number)||0));
   fs.writeFileSync(temporary,JSON.stringify({choosing:false,number}),{flag:'wx',mode:0o600});
   fileOperation(()=>fs.renameSync(temporary,lockPath));
   while(participants().some(owner=>owner.name!==identity&&(owner.choosing||owner.number<number||(owner.number===number&&owner.name<identity)))){
    if(Date.now()>=deadline)throw Object.assign(new Error('关联服务繁忙，请稍后重试。'),{status:503});
    await new Promise(resolve=>setTimeout(resolve,15));
   }
   let entries=[];
   try{
    if(fs.statSync(dataPath).size>1024*1024)throw Error('Pending link cache limit');
    entries=JSON.parse(fs.readFileSync(dataPath,'utf8'));
    if(!Array.isArray(entries)||entries.length>512)throw Error('Invalid pending link cache');
   }catch(error){if(error.code!=='ENOENT')throw error;}
   const result=fn(entries);
   if(result&&typeof result.then==='function')throw Error('Cache operations must not await while locked');
   const serialized=JSON.stringify(entries);
   if(entries.length>512||Buffer.byteLength(serialized)>1024*1024)throw Error('Pending link cache limit');
   fs.writeFileSync(temporary,serialized,{flag:'wx',mode:0o600});
   fileOperation(()=>fs.renameSync(temporary,dataPath));
   return result;
  }finally{
   try{fileOperation(()=>fs.unlinkSync(temporary));}catch(error){if(error.code!=='ENOENT')throw error;}
   finally{fileOperation(()=>fs.unlinkSync(lockPath));}
  }
 }
 return {withTickets};
}
module.exports={createTicketStore,withTickets:fn=>createTicketStore(directory()).withTickets(fn)};

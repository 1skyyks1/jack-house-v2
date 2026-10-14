const db=require('../config/db');
const {select}=require('./pp/repository');
const {BotError}=require('./botScoreAccessService');

// Cached PP sources only: reading a score never downloads or synchronizes osu! data.
async function source(user,attemptId){
 if(typeof attemptId!=='string'||!/^\d{1,20}$/.test(attemptId))throw new BotError('成绩标识无效。',400);
 return db.transaction({isolationLevel:'REPEATABLE READ'},async tx=>{
  const [row]=await select(`SELECT a.beatmap_id,s.checksum,s.content
   FROM pp_score_attempt a JOIN pp_beatmap_source s
    ON s.beatmap_id=a.beatmap_id AND s.checksum=COALESCE(a.source_checksum,a.reported_checksum)
   JOIN \`user\` u ON u.user_id=a.user_id AND u.status=0 AND u.osu_uid <=> :osuId
   WHERE a.id=:attemptId AND a.user_id=:userId AND a.passed=1
    AND OCTET_LENGTH(s.content)<=1048576
    AND EXISTS(SELECT 1 FROM pack_map m JOIN pack p ON p.pack_id=m.pack_id AND p.leaderboard_enabled=1 WHERE m.beatmap_id=a.beatmap_id)
   LIMIT 1`,{attemptId,userId:user.user_id,osuId:user.osu_uid??null},tx);
  return row?{available:true,beatmap_id:Number(row.beatmap_id),checksum:row.checksum,osu_text:row.content}:{available:false};
 });
}
module.exports={source};

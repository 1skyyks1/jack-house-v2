const {select} = require('./pp/repository');
const {parseJson} = require('./pp/score');
const reasons={unranked_mod:'此 Mods 不参与本站 PP',unranked_mod_settings:'自定义 Mods 设置不参与本站 PP',unsupported_mod:'暂不支持此 Mods',unsupported_mod_settings:'暂不支持此 Mods 设置',unknown_client:'无法识别成绩客户端',missing_statistics:'判定数据不完整',missing_mods:'Mods 数据不完整',beatmap_version_unavailable:'谱面历史版本暂不可用',beatmap_id_mismatch:'谱面版本无法确认',conflicting_mods:'Mods 冲突'};
function utcTime(value){if(!value)return null;if(value instanceof Date)return value.toISOString();return String(value).replace(' ','T').replace(/Z$/,'')+'Z';}
function mapAttempt(row){return {
 attempt_id:String(row.attempt_id),osu_score_id:row.osu_score_id==null?null:String(row.osu_score_id),beatmap_id:Number(row.beatmap_id),client:row.client,is_lazer:row.client==='lazer',
 score:row.score==null?null:Number(row.score),accuracy:row.accuracy==null?null:Number(row.accuracy),max_combo:row.max_combo==null?null:Number(row.max_combo),score_rank:row.score_rank,
 statistics:parseJson(row.statistics),mods:parseJson(row.mods),played_at:utcTime(row.played_at),
 pp_status:row.pp_status||'unavailable',pp:row.pp_status==='ready'&&row.pp!=null?Number(row.pp):null,clock_rate:row.clock_rate==null?null:Number(row.clock_rate),
 pp_reason:row.reason?(reasons[row.reason]||(row.pp_status==='excluded'?'此成绩不符合本站 PP 条件':'暂时无法计算，请稍后重试')):null,algorithm_version:row.algorithm_version,
 beatmap:{beatmap_id:Number(row.beatmap_id),rating:row.rating==null?null:Number(row.rating),version:row.version},
 pack:{pack_id:Number(row.pack_id),osu_bid:row.osu_bid==null?null:Number(row.osu_bid),title:row.title,artist:row.artist,creator:row.creator}
};}
async function listUserScoreAttempts(userId,{client='stable',limit=20,offset=0}={},transaction){
 if(!['stable','lazer'].includes(client))throw new TypeError('Invalid client');
 limit=Math.min(50,Math.max(1,Number.parseInt(limit,10)||20));offset=Math.max(0,Number.parseInt(offset,10)||0);
 const rows=await select(`SELECT CAST(a.id AS CHAR) AS attempt_id,a.osu_score_id,a.beatmap_id,a.client,a.score,a.accuracy,a.max_combo,a.score_rank,a.statistics,a.mods,CAST(a.played_at AS CHAR) AS played_at,
 rules.algorithm_version,r.status AS pp_status,r.pp,r.clock_rate,r.reason,pm.pack_id,pm.rating,pm.version,p.osu_bid,p.title,p.artist,p.creator
 FROM pp_score_attempt a CROSS JOIN pp_rules rules
 LEFT JOIN pp_score_result r ON r.attempt_id=a.id AND r.algorithm_version=rules.algorithm_version
 JOIN pack_map pm ON pm.map_id=(SELECT MIN(c.map_id) FROM pack_map c JOIN pack pool ON pool.pack_id=c.pack_id AND pool.leaderboard_enabled=1 WHERE c.beatmap_id=a.beatmap_id)
 JOIN pack p ON p.pack_id=pm.pack_id
 WHERE rules.id=1 AND a.user_id=:userId AND a.client=:client AND a.passed=1
 ORDER BY a.played_at DESC,a.id DESC LIMIT :limit OFFSET :offset`,{userId,client,limit:limit+1,offset},transaction);
 // NULL played_at sorts after dated plays; no captured/calculated timestamp is substituted.
 return {data:rows.slice(0,limit).map(mapAttempt),hasMore:rows.length>limit};
}
module.exports={listUserScoreAttempts,mapAttempt,utcTime};

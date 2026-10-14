const {QueryTypes} = require('sequelize');
const {Pack,PackMap} = require('../models');
const sequelize = require('../config/db');
const {fetchRecentManiaScoresSince,getBestScoresByBeatmap,upsertBestPackScore}=require('./beatmapScoreService');
const {isPackRankEligibleMap}=require('./packRankService');
const {captureScores}=require('./pp/repository');
const syncScorePairs = async ({ pairs, scores, userId, ppBeatmapIds, guard }) => {
    const uniquePairs = [...new Map(pairs.map((pair) => [
        `${Number(pair.packId)}:${Number(pair.beatmapId)}`,
        { packId: Number(pair.packId), beatmapId: Number(pair.beatmapId) },
    ])).values()];
    const beatmapIds = new Set(uniquePairs.map((pair) => pair.beatmapId));
    const summary = { matched: 0, created: 0, updated: 0, unchanged: 0 };

    await sequelize.transaction(async (transaction) => {
        if (guard) {
            await sequelize.query('SELECT user_id FROM `user` WHERE user_id=:userId FOR UPDATE', {replacements:{userId},type:QueryTypes.SELECT,transaction});
            await guard(transaction);
        }
        // Capture all returned attempts before raw-score selection discards candidates.
        summary.pp = await captureScores({ scores, userId,
            beatmapIds: ppBeatmapIds || beatmapIds }, { transaction });
        const bestScores = getBestScoresByBeatmap(scores, beatmapIds);
        for (const pair of uniquePairs) {
            const score = bestScores.get(Number(pair.beatmapId));
            if (!score) continue;
            summary.matched += 1;
            const result = await upsertBestPackScore({
                beatmapId: pair.beatmapId,
                packId: pair.packId,
                score,
                userId,
            }, { transaction });
            if (result.created) summary.created += 1;
            else if (result.updated) summary.updated += 1;
            else summary.unchanged += 1;
        }
    });

    return summary;
};


async function syncAllFeatured(user, options={}) {
 const userId=Number(user.user_id);
 const packs=await Pack.findAll({where:{leaderboard_enabled:true},attributes:['pack_id'],include:[{model:PackMap,as:'maps',attributes:['beatmap_id','rating']}]});
 const pairs=packs.flatMap(p=>(p.maps||[]).filter(isPackRankEligibleMap).map(m=>({packId:Number(p.pack_id),beatmapId:Number(m.beatmap_id)})));
 const ppBeatmapIds=packs.flatMap(p=>(p.maps||[]).map(m=>Number(m.beatmap_id)).filter(id=>id>0));
 if(!ppBeatmapIds.length)return {matched:0,created:0,updated:0,unchanged:0};
  const scores=await fetchRecentManiaScoresSince(user,new Date(Date.now()-86400000),100,20,options);
 return syncScorePairs({pairs,scores,userId,ppBeatmapIds,guard:options.guard});
}
module.exports={syncScorePairs,syncAllFeatured};

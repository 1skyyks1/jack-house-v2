const { User, Event, EventStage } = require('../../models/index');
const sequelize = require('../../config/db')
const {
    fetchRecentManiaScores,
    getBestScoresByBeatmap,
    upsertBestScore,
} = require('../../services/beatmapScoreService');

// 从osu获取最近一条分数，用于课题
exports.userRecentScore = async (req, res) => {
    const user_id = req.user.user_id;
    const event_id = req.params.event_id;
    try {
        const event = await Event.findByPk(event_id);
        if (!event) {
            // 未知活动
            return res.status(400).json({ message: req.t('osuScore.eventNotFound') });
        } else {
            const now = new Date();
            const startTime = new Date(event.start);
            const endTime = new Date(event.end);
            if(now < startTime || now > endTime) {
                // 目前不是活动时间
                return res.status(403).json({ message: req.t('osuScore.notEventTime') });
            }
        }

        const user = await User.findByPk(user_id)
        const scores = await fetchRecentManiaScores(user);
        if (!scores || scores.length === 0) {
            // 未获取到最近成绩
            return res.status(400).json({ message: req.t('osuScore.noRecentScore') });
        }

        const stages = await EventStage.findAll({
            where: { event_id }
        });
        const validMapIds = new Set(stages.map(s => Number(s.map_id)));
        const bestScoresMap = getBestScoresByBeatmap(scores, validMapIds);

        if (bestScoresMap.size === 0) {
            return res.status(400).json({ message: req.t('osuScore.noValidScore') });
        }

        const stageMap = new Map();
        for (const stage of stages) {
            stageMap.set(Number(stage.map_id), stage.id);
        }

        let hasUpdated = false;
        await sequelize.transaction(async (transaction) => {
            for (const [beatmapId, score] of bestScoresMap.entries()) {
                const result = await upsertBestScore({
                    beatmapId,
                    eventId: Number(event_id),
                    score,
                    stageId: stageMap.get(beatmapId),
                    userId: user_id,
                }, { transaction });
                hasUpdated = hasUpdated || result.updated;
            }
        });

        if (!hasUpdated) {
            return res.status(400).json({ message: req.t('osuScore.scoreNotHigher') });
        }

        res.status(200).json({ message: req.t('osuScore.updateSuccess') });
    } catch (error) {
        // 错误
        console.log(error)
        res.status(500).json({ message: req.t('osuScore.serverError') });
    }
}

const { User, Event, EventStage, EventScore } = require('../../models/index');
const sequelize = require('../../config/db')
const { Op, QueryTypes } = require('sequelize');

// 获取指定项目的分数排行榜
exports.getStageScore = async (req, res) => {
    const { page, pageSize } = req.query;
    const { stage_id } = req.params;
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);
    try {
        const stage = await EventStage.findByPk(stage_id, { attributes: ['event_id'] });
        if (!stage) return res.status(404).json({ message: req.t('score.notFound') });
        const { count, rows } = await EventScore.findAndCountAll({
            where: { stage_id, event_id: stage.event_id },
            limit,
            offset,
            order: [['score', 'DESC'], ['updated_time', 'ASC']],
            attributes: { exclude: ['created_time', 'updated_time'] },
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['user_name', 'avatar'],
                }
            ]
        })

        const totalPages = Math.ceil(count / limit)
        res.status(200).json({ data: rows, page: parseInt(page, 10), pageSize: limit, totalPages, total: count });
    } catch (error){
        res.status(500).json({ message: req.t('score.serverError') });
    }
}

// 获取活动中项目分数总和的总榜
exports.getEventScore = async (req, res) => {
    const { page, pageSize } = req.query;
    const { event_id } = req.params;
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);
    try {
        const { count, rows } = await EventScore.findAndCountAll({
            where: { event_id },
            attributes: [
                'user_id',
                [sequelize.fn('SUM', sequelize.col('score')), 'totalScore'],
                [sequelize.fn('MAX', sequelize.col('EventScore.updated_time')), 'lastUpdate'],
            ],
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['user_name', 'avatar'],
                },
                {
                    model: EventStage,
                    as: 'stage',
                    attributes: [],
                    where: { event_id }
                }
            ],
            group: ['user_id'],
            order: [
                [sequelize.literal('totalScore'), 'DESC'],
                [sequelize.literal('lastUpdate'), 'ASC']
            ],
            limit,
            offset,
            subQuery: false
        })

        const response = {
            data: rows,
            total: count.length, // 分组时 count 是数组
            page: parseInt(page, 10),
            pageSize: limit,
            totalPages: Math.ceil(count.length / limit),
        };
        res.status(200).json(response);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: req.t('score.serverError') });
    }
}

// 获取指定用户指定活动中的各项目分数+排名和总分数和排名
exports.getUserScore = async (req, res) => {
    const { event_id } = req.params;
    const user_id = req.user.user_id;

    try {
        // 获取每个 stage 用户分数及排名
        const stageScores = await sequelize.query(`
            SELECT stage_id, score, rank
                FROM (
                    SELECT es.stage_id, s.artist, s.title, s.mapper, es.user_id, es.score,
                        RANK() OVER (PARTITION BY es.stage_id ORDER BY es.score DESC, es.updated_time ASC) AS rank
                    FROM event_score es
                    JOIN event_stage s ON es.stage_id = s.id
                    WHERE es.event_id = :event_id AND s.event_id = :event_id
                ) t
            WHERE t.user_id = :user_id
            ORDER BY t.stage_id ASC;`,
            {
                replacements: { event_id, user_id },
                type: QueryTypes.SELECT
            }
        );

        // 获取用户总分及总排名
        const totalScores = await sequelize.query(`
            SELECT user_id, totalScore, totalRank FROM (
                SELECT es.user_id,
                       SUM(es.score) AS totalScore,
                       RANK() OVER (ORDER BY SUM(es.score) DESC, MAX(es.updated_time) ASC) AS totalRank
                FROM event_score es
                JOIN event_stage s ON es.stage_id = s.id
                WHERE es.event_id = :event_id AND s.event_id = :event_id
                GROUP BY es.user_id
            ) t
            WHERE user_id = :user_id`,
            {
                replacements: { event_id, user_id },
                type: QueryTypes.SELECT
            }
        );

        res.status(200).json({
            data: stageScores,
            total: totalScores[0] || { totalScore: 0, totalRank: null }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: req.t('score.serverError') });
    }
};

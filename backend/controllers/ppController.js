const query = require('../services/pp/query');
const { select } = require('../services/pp/repository');

function pagination(input) {
    const page = Math.min(Math.max(Number.parseInt(input.page, 10) || 1, 1), 100000);
    const limit = Math.min(Math.max(Number.parseInt(input.pageSize, 10) || 50, 1), 50);
    return { page, limit, offset: (page - 1) * limit };
}
const validId = (value) => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0;

function endpoint(handler, { clientRequired = false, userRequired = false, beatmapRequired = false } = {}) {
    return async (req, res) => {
        if (clientRequired && !['stable', 'lazer'].includes(req.query.client)) {
            return res.status(400).json({ code: 'INVALID_PP_CLIENT', message: 'client must be stable or lazer' });
        }
        if ((userRequired && !validId(req.params.user_id)) || (beatmapRequired && !validId(req.params.beatmap_id))) {
            return res.status(400).json({ code: 'INVALID_ID' });
        }
        try {
            if (userRequired) {
                const users = await select('SELECT user_id FROM `user` WHERE user_id = :id', { id: Number(req.params.user_id) });
                if (!users.length) return res.status(404).json({ code: 'USER_NOT_FOUND' });
            }
            const paging = pagination(req.query);
            const result = await handler({ userId: Number(req.params.user_id), beatmapId: Number(req.params.beatmap_id),
                client: req.query.client, limit: paging.limit, offset: paging.offset });
            return res.json(result.total == null ? { data: result } : {
                ...result, page: paging.page, pageSize: paging.limit, totalPages: Math.ceil(result.total / paging.limit),
            });
        } catch {
            console.error('PP query failed');
            return res.status(500).json({ code: 'PP_QUERY_FAILED' });
        }
    };
}

exports.getUserPP = endpoint(({ userId }) => query.getUserPP(userId), { userRequired: true });
exports.getBestPlays = endpoint(query.getBestPlays, { userRequired: true, clientRequired: true });
exports.getRankHistory = endpoint(query.getRankHistory, { userRequired: true, clientRequired: true });
exports.getLeaderboard = endpoint(query.getLeaderboard, { clientRequired: true });
exports.getBeatmapLeaderboard = endpoint(query.getBeatmapLeaderboard, { beatmapRequired: true, clientRequired: true });

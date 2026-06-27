const { TRound, TMappool, TMatch, TGame, TTeam, TPlayer } = require('../../models/tournament');
const User = require('../../models/user/user');
const bracketService = require('../../services/tournament/bracketService');
const matchService = require('../../services/tournament/matchService');
const auditService = require('../../services/tournament/auditService');
const osuMatchService = require('../../services/tournament/osuMatchService');
const { translateMessage, translatePayload } = require('../../utils/tournamentI18n');

// 获取轮次列表
exports.getRounds = async (req, res) => {
    try {
        const { tid } = req.params;
        const rounds = await TRound.findAll({
            where: { t_id: tid },
            order: [['order', 'ASC']],
            include: [{ model: TMappool, as: 'mappool' }]
        });
        res.json(rounds);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: req.t('common.serverError') });
    }
};

// 创建轮次
exports.createRound = async (req, res) => {
    try {
        const { tid } = req.params;
        const round = await matchService.createRound(tid, req.body, req.user?.user_id);
        res.status(201).json(round);
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ message: error.status ? translateMessage(req, error.message) : req.t('common.serverError') });
    }
};

// 更新轮次
exports.updateRound = async (req, res) => {
    try {
        const { tid, roundId } = req.params;
        const round = await matchService.updateRound(tid, roundId, req.body, req.user?.user_id);
        res.json(round);
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ message: error.status ? translateMessage(req, error.message) : req.t('common.serverError') });
    }
};

// 删除轮次
exports.deleteRound = async (req, res) => {
    try {
        const { tid, roundId } = req.params;
        await matchService.deleteRound(tid, roundId, req.user?.user_id);
        res.json({ message: req.t('tournament.messages.deleteSuccess') });
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ message: error.status ? translateMessage(req, error.message) : req.t('common.serverError') });
    }
};

// 获取轮次图池
exports.getRoundMappool = async (req, res) => {
    try {
        const { tid, roundId } = req.params;
        const round = await TRound.findOne({ where: { id: roundId, t_id: tid } });
        if (!round) {
            return res.status(404).json({ message: req.t('tournament.errors.roundNotFound') });
        }
        const maps = await TMappool.findAll({
            where: { round_id: roundId },
            order: [['type', 'ASC'], ['id', 'ASC']]
        });
        res.json(maps);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: req.t('common.serverError') });
    }
};

// 添加轮次图池
exports.addRoundMap = async (req, res) => {
    try {
        const { tid, roundId } = req.params;
        const map = await matchService.addRoundMap(tid, roundId, req.body, req.user?.user_id);
        res.status(201).json(map);
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ message: error.status ? translateMessage(req, error.message) : req.t('common.serverError') });
    }
};

// 删除轮次图池
exports.deleteRoundMap = async (req, res) => {
    try {
        const { tid, mapId } = req.params;
        await matchService.deleteRoundMap(tid, mapId, req.user?.user_id);
        res.json({ message: req.t('tournament.messages.deleteSuccess') });
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ message: error.status ? translateMessage(req, error.message) : req.t('common.serverError') });
    }
};

// 获取对阵表（所有比赛）
exports.getBracket = async (req, res) => {
    try {
        const { tid } = req.params;
        const matches = await TMatch.findAll({
            include: [
                {
                    model: TRound,
                    as: 'round',
                    where: { t_id: tid },
                    attributes: ['id', 'name', 'bracket_type', 'first_to', 'order']
                },
                { model: TTeam, as: 'team1', attributes: ['id', 'display_name'] },
                { model: TTeam, as: 'team2', attributes: ['id', 'display_name'] },
                { model: TTeam, as: 'winner', attributes: ['id', 'display_name'] }
            ],
            order: [[{ model: TRound, as: 'round' }, 'order', 'ASC'], ['slot_no', 'ASC'], ['id', 'ASC']]
        });
        res.json(matches);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: req.t('common.serverError') });
    }
};

// 生成 RO32 对阵表（根据资格赛排名）
exports.generateBracket = async (req, res) => {
    try {
        const { tid } = req.params;
        const result = await bracketService.generateDoubleEliminationBracket(tid, req.user?.user_id, req.body);
        res.json(translatePayload(req, result));
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ message: error.status ? translateMessage(req, error.message) : req.t('common.serverError') });
    }
};

// 获取单场比赛详情
exports.getMatch = async (req, res) => {
    try {
        const { tid, matchId } = req.params;
        const match = await TMatch.findByPk(matchId, {
            include: [
                { model: TRound, as: 'round', include: [{ model: TMappool, as: 'mappool' }] },
                { model: TTeam, as: 'team1', include: [{ model: TPlayer, as: 'players', include: [{ model: User, as: 'user' }] }] },
                { model: TTeam, as: 'team2', include: [{ model: TPlayer, as: 'players', include: [{ model: User, as: 'user' }] }] },
                { model: TTeam, as: 'winner' },
                { model: TGame, as: 'games', include: [{ model: TMappool, as: 'map' }] }
            ]
        });
        if (!match) {
            return res.status(404).json({ message: req.t('tournament.errors.matchNotFound') });
        }
        if (!match.round || Number(match.round.t_id) !== Number(tid)) {
            return res.status(404).json({ message: req.t('tournament.errors.matchNotFound') });
        }
        res.json(match);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: req.t('common.serverError') });
    }
};

// 创建比赛
exports.createMatch = async (req, res) => {
    try {
        const { tid } = req.params;
        const match = await matchService.createMatch(tid, req.body, req.user?.user_id);
        res.status(201).json(match);
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ message: error.status ? translateMessage(req, error.message) : req.t('common.serverError') });
    }
};

// 更新比赛
exports.updateMatch = async (req, res) => {
    try {
        const { tid, matchId } = req.params;
        const { match, propagation } = await matchService.updateMatch(tid, matchId, req.body, req.user?.user_id);
        res.json({ ...match.toJSON(), propagation });
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ message: error.status ? translateMessage(req, error.message) : req.t('common.serverError') });
    }
};

// 从 MP 获取比赛分数
exports.fetchMatchScores = async (req, res) => {
    try {
        const { tid, matchId } = req.params;

        const match = await TMatch.findByPk(matchId, {
            include: [
                { model: TRound, as: 'round', include: [{ model: TMappool, as: 'mappool' }] },
                { model: TTeam, as: 'team1', include: [{ model: TPlayer, as: 'players' }] },
                { model: TTeam, as: 'team2', include: [{ model: TPlayer, as: 'players' }] }
            ]
        });

        if (!match || !match.mp_id) {
            return res.status(400).json({ message: req.t('tournament.errors.mpIdRequired') });
        }
        if (!match.round || Number(match.round.t_id) !== Number(tid)) {
            return res.status(404).json({ message: req.t('tournament.errors.matchNotFound') });
        }

        // 获取队伍选手的 osu_uid
        const team1Uids = new Set();
        const team2Uids = new Set();

        for (const p of match.team1.players) {
            const user = await User.findByPk(p.user_id);
            if (user?.osu_uid) team1Uids.add(user.osu_uid);
        }
        for (const p of match.team2.players) {
            const user = await User.findByPk(p.user_id);
            if (user?.osu_uid) team2Uids.add(user.osu_uid);
        }

        // 调用 osu! API；matches 端点默认只返回 100 条 events，需要分页读取完整 MP。
        const mpMatch = await osuMatchService.getCompleteMatch(match.mp_id);

        if (!mpMatch || !mpMatch.events) {
            return res.status(400).json({ message: req.t('tournament.errors.fetchMatchFailed') });
        }

        // 图池映射
        const mapIdToPool = new Map();
        for (const m of match.round.mappool) {
            mapIdToPool.set(m.map_id, m);
        }

        // 解析所有 games
        const games = osuMatchService.getGameEvents(mpMatch);
        const savedGames = [];
        let team1Total = 0;
        let team2Total = 0;
        const oldGames = await TGame.findAll({
            where: { match_id: match.id },
            order: [['order', 'ASC'], ['id', 'ASC']]
        });
        const oldValue = {
            games: oldGames.map(game => auditService.pickModelValues(game)),
            match: auditService.pickModelValues(match, ['id', 'team1_score', 'team2_score', 'winner_id', 'status'])
        };

        // 清除旧的 game 记录
        await TGame.destroy({ where: { match_id: match.id } });

        for (let i = 0; i < games.length; i++) {
            const game = games[i].game;
            const poolMap = mapIdToPool.get(osuMatchService.getGameBeatmapId(game));
            if (!poolMap) continue; // 不在图池中的图跳过

            let p1Score = 0, p2Score = 0;
            let p1Id = null, p2Id = null;

            for (const score of osuMatchService.getGameScores(game)) {
                const scoreVal = osuMatchService.getScoreValue(score);
                if (team1Uids.has(score.user_id)) {
                    p1Score = scoreVal;
                    const user = await User.findOne({ where: { osu_uid: score.user_id } });
                    const player = match.team1.players.find(p => p.user_id === user?.user_id);
                    p1Id = player?.id;
                } else if (team2Uids.has(score.user_id)) {
                    p2Score = scoreVal;
                    const user = await User.findOne({ where: { osu_uid: score.user_id } });
                    const player = match.team2.players.find(p => p.user_id === user?.user_id);
                    p2Id = player?.id;
                }
            }

            const winner = p1Score > p2Score ? 1 : 2;
            if (winner === 1) team1Total++;
            else team2Total++;

            const savedGame = await TGame.create({
                match_id: match.id,
                map_id: poolMap.id,
                order: i + 1,
                player1_id: p1Id || 0,
                player2_id: p2Id || 0,
                player1_score: p1Score,
                player2_score: p2Score,
                winner_team: winner,
                action_type: 2, // pick
                action_by: 0
            });

            savedGames.push({
                id: savedGame.id,
                order: i + 1,
                map: poolMap.type,
                p1Score,
                p2Score,
                winner
            });
        }

        // 更新比赛分数
        match.team1_score = team1Total;
        match.team2_score = team2Total;

        // 检查是否决出胜负
        if (team1Total >= match.round.first_to) {
            match.winner_id = match.team1_id;
            match.status = 2;
        } else if (team2Total >= match.round.first_to) {
            match.winner_id = match.team2_id;
            match.status = 2;
        }

        await match.save();
        let propagation = null;
        if (match.status === 2 && match.winner_id) {
            propagation = await bracketService.propagateMatchResult(match.id, req.user?.user_id);
        }

        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'match',
            entity_id: match.id,
            action: 'fetch_match_scores',
            old_value: oldValue,
            new_value: {
                games: savedGames,
                match: auditService.pickModelValues(match, ['id', 'team1_score', 'team2_score', 'winner_id', 'status']),
                mp_id: match.mp_id,
                propagation
            },
            operator_id: req.user?.user_id
        });

        res.json({
            message: req.t('tournament.messages.scoresFetched'),
            team1_score: team1Total,
            team2_score: team2Total,
            games: savedGames,
            winner: match.winner_id ? (match.winner_id === match.team1_id ? 'team1' : 'team2') : null,
            propagation
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: req.t('common.serverError') });
    }
};

const { TRound, TMappool, TMatch, TMatchAction, TGame, TTeam, TPlayer } = require('../../models/tournament');
const User = require('../../models/user/user');
const osu = require('osu-api-v2-js');
const bracketService = require('../../services/tournament/bracketService');
const matchService = require('../../services/tournament/matchService');
const auditService = require('../../services/tournament/auditService');
const osuMatchService = require('../../services/tournament/osuMatchService');
const roundStageService = require('../../services/tournament/roundStageService');
const { translateMessage, translatePayload } = require('../../utils/tournamentI18n');

const CLIENT_ID = Number(process.env.OSU_CLIENT_ID);
const CLIENT_SECRET = process.env.OSU_CLIENT_SECRET;

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
        const { maps, round } = await roundStageService.listStageMappool(tid, roundId);
        if (!round) {
            return res.status(404).json({ message: req.t('tournament.errors.roundNotFound') });
        }
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
        const beatmapUrl = String(req.body.url || req.body.beatmap_url || '').trim();
        let request = req.body;

        if (!beatmapUrl && !req.body.map_id) {
            return res.status(400).json({ message: req.t('tournament.errors.beatmapUrlRequired') });
        }

        if (beatmapUrl) {
            const urlMatch = beatmapUrl.match(/beatmapsets\/(\d+)(?:#\w+\/(\d+))?/);
            if (!urlMatch) {
                return res.status(400).json({ message: req.t('tournament.errors.beatmapUrlInvalid') });
            }

            const setId = Number(urlMatch[1]);
            const mapId = urlMatch[2] ? Number(urlMatch[2]) : null;
            if (!mapId) {
                return res.status(400).json({ message: req.t('tournament.errors.beatmapIdMissing') });
            }

            const api = await osu.API.createAsync(CLIENT_ID, CLIENT_SECRET);
            const beatmap = await api.getBeatmap(mapId);
            if (!beatmap) {
                return res.status(404).json({ message: req.t('tournament.errors.beatmapNotFound') });
            }

            request = {
                ...req.body,
                artist: beatmap.beatmapset?.artist || req.body.artist || '',
                map_id: beatmap.id,
                mapper: beatmap.beatmapset?.creator || req.body.mapper || '',
                set_id: beatmap.beatmapset_id || setId,
                title: beatmap.beatmapset?.title || req.body.title || ''
            };
        }

        const map = await matchService.addRoundMap(tid, roundId, request, req.user?.user_id);
        res.status(201).json(map);
    } catch (error) {
        console.error(error);
        if (error.message?.includes('404')) {
            return res.status(404).json({ message: req.t('tournament.errors.beatmapNotFound') });
        }
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
                { model: TTeam, as: 'team1', attributes: ['id', 'display_name', 'name', 'qual_rank', 'qual_score'], include: [{ model: TPlayer, as: 'players', include: [{ model: User, as: 'user', attributes: ['user_id', 'user_name', 'avatar'] }] }] },
                { model: TTeam, as: 'team2', attributes: ['id', 'display_name', 'name', 'qual_rank', 'qual_score'], include: [{ model: TPlayer, as: 'players', include: [{ model: User, as: 'user', attributes: ['user_id', 'user_name', 'avatar'] }] }] },
                { model: TTeam, as: 'winner', attributes: ['id', 'display_name', 'name', 'qual_rank', 'qual_score'] }
            ],
            order: [[{ model: TRound, as: 'round' }, 'order', 'ASC'], ['slot_no', 'ASC'], ['id', 'ASC']]
        });
        res.json(matches);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: req.t('common.serverError') });
    }
};

// 获取正赛每轮次/每张图表现排行
exports.getPerformance = async (req, res) => {
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
                { model: TTeam, as: 'team1', attributes: ['id', 'display_name', 'name', 'avatar'] },
                { model: TTeam, as: 'team2', attributes: ['id', 'display_name', 'name', 'avatar'] },
                { model: TGame, as: 'games', where: { action_type: 2 }, required: false, include: [{ model: TMappool, as: 'map' }] }
            ],
            order: [[{ model: TRound, as: 'round' }, 'order', 'ASC'], ['slot_no', 'ASC'], ['id', 'ASC']]
        });

        const playerIds = new Set();
        for (const match of matches) {
            for (const game of match.games || []) {
                if (game.player1_id) playerIds.add(Number(game.player1_id));
                if (game.player2_id) playerIds.add(Number(game.player2_id));
            }
        }

        const players = playerIds.size > 0 ? await TPlayer.findAll({
            where: { id: Array.from(playerIds) },
            include: [{ model: User, as: 'user', attributes: ['user_id', 'user_name', 'avatar', 'osu_uid'] }]
        }) : [];
        const playerById = new Map(players.map(player => [Number(player.id), player]));
        const stageMap = new Map();

        const ensureStage = (stage) => {
            const key = stage || 'other';
            if (!stageMap.has(key)) {
                stageMap.set(key, {
                    key,
                    label: roundStageService.getStageLabel(stage),
                    maps: new Map()
                });
            }
            return stageMap.get(key);
        };

        const ensureMap = (stageData, map) => {
            const key = map ? `${String(map.type || '').toUpperCase()}-${map.map_id || map.id}` : 'unknown';
            if (!stageData.maps.has(key)) {
                stageData.maps.set(key, {
                    key,
                    map: map ? auditService.pickModelValues(map) : null,
                    entries: []
                });
            }
            return stageData.maps.get(key);
        };

        const addEntry = ({ game, mapData, match, player, score, side, team }) => {
            if (!score || !team) return;
            mapData.entries.push({
                game_id: game.id,
                match_id: match.id,
                player: player ? {
                    id: player.id,
                    user_id: player.user_id,
                    user_name_snapshot: player.user_name_snapshot,
                    avatar_snapshot: player.avatar_snapshot,
                    user: player.user ? {
                        user_id: player.user.user_id,
                        user_name: player.user.user_name,
                        avatar: player.user.avatar,
                        osu_uid: player.user.osu_uid
                    } : null
                } : null,
                score,
                side,
                team: auditService.pickModelValues(team, ['id', 'name', 'display_name', 'avatar'])
            });
        };

        for (const match of matches) {
            const stage = roundStageService.getRoundStage(match.round);
            if (!stage) continue;
            const stageData = ensureStage(stage);
            for (const game of match.games || []) {
                const mapData = ensureMap(stageData, game.map);
                addEntry({
                    game,
                    mapData,
                    match,
                    player: playerById.get(Number(game.player1_id)),
                    score: Number(game.player1_score) || 0,
                    side: 1,
                    team: match.team1
                });
                addEntry({
                    game,
                    mapData,
                    match,
                    player: playerById.get(Number(game.player2_id)),
                    score: Number(game.player2_score) || 0,
                    side: 2,
                    team: match.team2
                });
            }
        }

        const stages = Array.from(stageMap.values())
            .sort((a, b) => roundStageService.getStageSortIndex(a.key) - roundStageService.getStageSortIndex(b.key))
            .map(stage => ({
                key: stage.key,
                label: stage.label,
                maps: Array.from(stage.maps.values()).map(mapData => {
                    const entries = mapData.entries.sort((a, b) => b.score - a.score);
                    let lastScore = null;
                    let lastRank = 0;
                    const rankedEntries = entries.map((entry, index) => {
                        const rank = entry.score === lastScore ? lastRank : index + 1;
                        lastScore = entry.score;
                        lastRank = rank;
                        return { ...entry, rank };
                    });
                    return { ...mapData, entries: rankedEntries };
                }).filter(mapData => mapData.entries.length > 0)
            })).filter(stage => stage.maps.length > 0);

        res.json({ stages });
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
                {
                    model: TGame,
                    as: 'games',
                    include: [
                        { model: TMappool, as: 'map' },
                        { model: TPlayer, as: 'player1', include: [{ model: User, as: 'user' }] },
                        { model: TPlayer, as: 'player2', include: [{ model: User, as: 'user' }] }
                    ]
                }
            ],
            order: [[{ model: TGame, as: 'games' }, 'order', 'ASC'], [{ model: TGame, as: 'games' }, 'id', 'ASC']]
        });
        if (!match) {
            return res.status(404).json({ message: req.t('tournament.errors.matchNotFound') });
        }
        if (!match.round || Number(match.round.t_id) !== Number(tid)) {
            return res.status(404).json({ message: req.t('tournament.errors.matchNotFound') });
        }
        const { maps } = await roundStageService.listStageMappool(tid, match.round.id);
        match.round.setDataValue('mappool', maps);
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
        const { maps: stageMappool } = await roundStageService.listStageMappool(tid, match.round.id);
        match.round.setDataValue('mappool', stageMappool);

        // 获取队伍选手的 osu_uid
        const team1Uids = new Set();
        const team2Uids = new Set();

        for (const p of match.team1.players) {
            const user = await User.findByPk(p.user_id);
            const osuUid = Number(user?.osu_uid);
            if (Number.isFinite(osuUid) && osuUid > 0) team1Uids.add(osuUid);
        }
        for (const p of match.team2.players) {
            const user = await User.findByPk(p.user_id);
            const osuUid = Number(user?.osu_uid);
            if (Number.isFinite(osuUid) && osuUid > 0) team2Uids.add(osuUid);
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
        const pickActions = await TMatchAction.findAll({
            where: { match_id: match.id, action_type: 'pick' },
            order: [['sort_order', 'ASC'], ['id', 'ASC']]
        });
        const pickActionByMapId = new Map();
        for (const action of pickActions) {
            const mapId = Number(action.map_id);
            if (!mapId || pickActionByMapId.has(mapId)) continue;
            pickActionByMapId.set(mapId, action);
        }
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

        const latestPickedGameByMapId = new Map();
        for (let i = 0; i < games.length; i++) {
            const game = games[i].game;
            const poolMap = mapIdToPool.get(osuMatchService.getGameBeatmapId(game));
            if (!poolMap) continue; // 不在图池中的图跳过
            const pickAction = pickActionByMapId.get(Number(poolMap.id));
            if (!pickAction) continue; // 没有在当前操作里被 pick 的图不计入比赛分数

            latestPickedGameByMapId.set(Number(poolMap.id), {
                game,
                poolMap,
                pickAction,
                fallbackOrder: i + 1
            });
        }

        const pickedGames = Array.from(latestPickedGameByMapId.values())
            .sort((a, b) => Number(a.pickAction.sort_order || a.fallbackOrder) - Number(b.pickAction.sort_order || b.fallbackOrder)
                || Number(a.pickAction.id) - Number(b.pickAction.id));

        for (const pickedGame of pickedGames) {
            const { game, poolMap, pickAction, fallbackOrder } = pickedGame;

            let p1Score = 0, p2Score = 0;
            let p1Id = null, p2Id = null;

            for (const score of osuMatchService.getGameScores(game)) {
                const scoreVal = osuMatchService.getScoreValue(score);
                const scoreUserId = osuMatchService.getScoreUserId(score);
                if (team1Uids.has(scoreUserId)) {
                    p1Score = scoreVal;
                    const user = await User.findOne({ where: { osu_uid: scoreUserId } });
                    const player = match.team1.players.find(p => Number(p.user_id) === Number(user?.user_id));
                    p1Id = player?.id;
                } else if (team2Uids.has(scoreUserId)) {
                    p2Score = scoreVal;
                    const user = await User.findOne({ where: { osu_uid: scoreUserId } });
                    const player = match.team2.players.find(p => Number(p.user_id) === Number(user?.user_id));
                    p2Id = player?.id;
                }
            }

            if (p1Score === p2Score) continue;

            const winner = p1Score > p2Score ? 1 : 2;
            if (winner === 1) team1Total++;
            else team2Total++;

            const savedGame = await TGame.create({
                match_id: match.id,
                map_id: poolMap.id,
                order: pickAction.sort_order || fallbackOrder,
                player1_id: p1Id || 0,
                player2_id: p2Id || 0,
                player1_score: p1Score,
                player2_score: p2Score,
                winner_team: winner,
                action_type: 2, // pick
                action_by: Number(pickAction.team_id) === Number(match.team2_id) ? 2 : 1
            });

            savedGames.push({
                id: savedGame.id,
                order: savedGame.order,
                action_id: pickAction.id,
                map_id: poolMap.id,
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
        const firstTo = roundStageService.getRoundFirstTo(match.round);
        if (team1Total >= firstTo) {
            match.winner_id = match.team1_id;
            match.status = 2;
        } else if (team2Total >= firstTo) {
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

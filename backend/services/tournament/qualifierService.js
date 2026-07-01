const { Op } = require('sequelize');
const osu = require('osu-api-v2-js');
const { TQualMappool, TQualScore, TQualImport, TTeam, TPlayer, Tournament } = require('../../models/tournament');
const User = require('../../models/user/user');
const auditService = require('./auditService');
const osuMatchService = require('./osuMatchService');

const CLIENT_ID = Number(process.env.OSU_CLIENT_ID);
const CLIENT_SECRET = process.env.OSU_CLIENT_SECRET;
const QUAL_RANK_MODE_TOTAL_SCORE = 0;
const QUAL_RANK_MODE_RANK_SUM = 1;

const makeError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const ensureTournament = async (tid) => {
    const tournament = await Tournament.findByPk(tid);
    if (!tournament) {
        throw makeError('赛事不存在', 404);
    }
    return tournament;
};

const assertQualifierUnlocked = (tournament) => {
    if (tournament?.qual_locked_at) {
        throw makeError('资格赛排名已锁定，无法继续修改资格赛数据', 409);
    }
};

const ensureQualifierUnlocked = async (tid) => {
    const tournament = await ensureTournament(tid);
    assertQualifierUnlocked(tournament);
    return tournament;
};

const ensureTeam = async (tid, teamId) => {
    const team = await TTeam.findOne({
        where: { id: teamId, t_id: tid },
        include: [{ model: TPlayer, as: 'players' }]
    });
    if (!team) {
        throw makeError('队伍不存在', 404);
    }
    return team;
};

const getQualifierTeams = async (tid, teamId = null) => {
    if (teamId) {
        return [await ensureTeam(tid, teamId)];
    }

    const teams = await TTeam.findAll({
        where: { t_id: tid },
        include: [{ model: TPlayer, as: 'players' }]
    });
    if (teams.length === 0) {
        throw makeError('本届赛事暂无队伍');
    }
    return teams;
};

const normalizeQualStage = (value) => {
    const stage = Number(value);
    if (!Number.isInteger(stage) || stage < 1 || stage > 7) {
        throw makeError('资格赛 stage 必须是 1 到 7 的整数');
    }
    return stage;
};

const normalizePositiveNumber = (value, label, defaultValue = null) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized <= 0) {
        throw makeError(`${label}必须是正数`);
    }
    return normalized;
};

const normalizeNonNegativeNumber = (value, label, defaultValue = null) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < 0) {
        throw makeError(`${label}不能为负数`);
    }
    return normalized;
};

const normalizePositiveInt = (value, label, defaultValue = null) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized <= 0) {
        throw makeError(`${label}必须是正整数`);
    }
    return normalized;
};

const normalizeNonNegativeInt = (value, label, defaultValue = null) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized < 0) {
        throw makeError(`${label}不能为负数`);
    }
    return normalized;
};

const ensureQualMapUnique = async (tid, payload, ignoredMapId = null) => {
    const duplicateStage = await TQualMappool.findOne({
        where: {
            t_id: tid,
            index: payload.index,
            ...(ignoredMapId ? { id: { [Op.ne]: ignoredMapId } } : {})
        }
    });
    if (duplicateStage) {
        throw makeError('该资格赛 stage 已存在谱面');
    }

    const duplicateBeatmap = await TQualMappool.findOne({
        where: {
            t_id: tid,
            map_id: payload.map_id,
            ...(ignoredMapId ? { id: { [Op.ne]: ignoredMapId } } : {})
        }
    });
    if (duplicateBeatmap) {
        throw makeError('该资格赛谱面已存在');
    }
};

const createQualMap = async (tid, body, operatorId) => {
    await ensureQualifierUnlocked(tid);

    const payload = {
        artist: String(body.artist || '').trim(),
        hp: normalizeNonNegativeNumber(body.hp, 'HP', 0),
        index: normalizeQualStage(body.index || 1),
        length: normalizeNonNegativeInt(body.length, '长度', 0),
        map_id: normalizePositiveInt(body.map_id, 'Beatmap ID'),
        mapper: String(body.mapper || '').trim(),
        od: normalizeNonNegativeNumber(body.od, 'OD', 0),
        set_id: normalizePositiveInt(body.set_id, 'Beatmapset ID', null),
        star: normalizeNonNegativeNumber(body.star, '星级', 0),
        title: String(body.title || '').trim(),
        version: body.version ? String(body.version).trim() : '',
        weight: normalizePositiveNumber(body.weight, '权重', 1.0)
    };

    if (!payload.artist || !payload.title || !payload.mapper) {
        throw makeError('谱面 artist、title 和 mapper 不能为空');
    }

    await ensureQualMapUnique(tid, payload);

    const map = await TQualMappool.create({
        t_id: tid,
        ...payload
    });

    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'qualifier_mappool',
        entity_id: map.id,
        action: 'create',
        old_value: null,
        new_value: auditService.pickModelValues(map),
        operator_id: operatorId
    });

    return map;
};

const updateQualMap = async (tid, mapId, body, operatorId) => {
    await ensureQualifierUnlocked(tid);

    const map = await TQualMappool.findOne({ where: { id: mapId, t_id: tid } });
    if (!map) {
        throw makeError('图不存在', 404);
    }

    const payload = {};
    if (body.index !== undefined) payload.index = normalizeQualStage(body.index);
    if (body.map_id !== undefined) payload.map_id = normalizePositiveInt(body.map_id, 'Beatmap ID');
    if (body.artist !== undefined) {
        payload.artist = String(body.artist || '').trim();
        if (!payload.artist) throw makeError('谱面 artist 不能为空');
    }
    if (body.title !== undefined) {
        payload.title = String(body.title || '').trim();
        if (!payload.title) throw makeError('谱面 title 不能为空');
    }
    if (body.mapper !== undefined) {
        payload.mapper = String(body.mapper || '').trim();
        if (!payload.mapper) throw makeError('谱面 mapper 不能为空');
    }
    if (body.weight !== undefined) payload.weight = normalizePositiveNumber(body.weight, '权重', 1.0);

    const nextPayload = {
        index: payload.index ?? map.index,
        map_id: payload.map_id ?? map.map_id
    };
    await ensureQualMapUnique(tid, nextPayload, map.id);

    const oldValue = auditService.pickModelValues(map);
    await map.update(payload);
    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'qualifier_mappool',
        entity_id: map.id,
        action: 'update',
        old_value: oldValue,
        new_value: auditService.pickModelValues(map),
        operator_id: operatorId
    });

    return map;
};

const deleteQualMap = async (tid, mapId, operatorId) => {
    await ensureQualifierUnlocked(tid);

    const map = await TQualMappool.findOne({ where: { id: mapId, t_id: tid } });
    if (!map) {
        throw makeError('图不存在', 404);
    }

    const scoreCount = await TQualScore.count({ where: { map_id: map.id } });
    if (scoreCount > 0) {
        throw makeError('该资格赛图已有成绩，不能直接删除');
    }

    const oldValue = auditService.pickModelValues(map);
    await map.destroy();
    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'qualifier_mappool',
        entity_id: map.id,
        action: 'delete',
        old_value: oldValue,
        new_value: null,
        operator_id: operatorId
    });
};

const buildPlayerLookup = async (teams) => {
    const teamList = Array.isArray(teams) ? teams : [teams];
    const players = teamList.flatMap(team => team.players || []);
    const userIds = [...new Set(players.map(player => player.user_id))];
    if (userIds.length === 0) {
        return new Map();
    }

    const users = await User.findAll({
        where: { user_id: { [Op.in]: userIds } },
        attributes: ['user_id', 'user_name', 'avatar', 'osu_uid']
    });

    const playerByOsuUid = new Map();
    const userById = new Map(users.map(user => [Number(user.user_id), user]));
    const teamById = new Map(teamList.map(team => [Number(team.id), team]));

    for (const player of players) {
        const user = userById.get(Number(player.user_id));
        if (user?.osu_uid) {
            playerByOsuUid.set(Number(user.osu_uid), {
                player,
                team: teamById.get(Number(player.team_id))
            });
        }
    }

    return playerByOsuUid;
};

const listQualScores = async (tid) => {
    await ensureTournament(tid);
    return TQualScore.findAll({
        include: [
            { model: TQualMappool, as: 'map', where: { t_id: tid } },
            { model: TTeam, as: 'team' },
            { model: TPlayer, as: 'player', include: [{ model: User, as: 'user', attributes: ['user_id', 'user_name', 'avatar'] }] },
            { model: TQualImport, as: 'importLog' }
        ],
        order: [
            [{ model: TQualMappool, as: 'map' }, 'index', 'ASC'],
            ['team_id', 'ASC'],
            ['score', 'DESC']
        ]
    });
};

const listImports = async (tid, query = {}) => {
    await ensureTournament(tid);

    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 30), 1), 100);
    const offset = (page - 1) * pageSize;

    const result = await TQualImport.findAndCountAll({
        where: { t_id: tid },
        include: [
            { model: TTeam, as: 'team' },
            { model: User, as: 'importedBy', attributes: ['user_id', 'user_name', 'avatar'] }
        ],
        order: [['created_time', 'DESC'], ['id', 'DESC']],
        limit: pageSize,
        offset
    });

    return {
        rows: result.rows,
        total: result.count,
        page,
        pageSize
    };
};

const fetchQualScoresFromMp = async (tid, body, operatorId) => {
    const mpId = Number(body.mp_id);
    const teamId = body.team_id === undefined || body.team_id === null || body.team_id === '' ? null : Number(body.team_id);
    if (!mpId) {
        throw makeError('缺少 MP ID');
    }
    if (teamId !== null && (!Number.isInteger(teamId) || teamId <= 0)) {
        throw makeError('队伍 ID 无效');
    }

    await ensureQualifierUnlocked(tid);
    const teams = await getQualifierTeams(tid, teamId);
    const teamById = new Map(teams.map(team => [Number(team.id), team]));
    const importLogs = new Map();

    const ensureImportLog = async (team) => {
        const existing = importLogs.get(Number(team.id));
        if (existing) return existing;
        const next = await TQualImport.create({
            t_id: tid,
            team_id: team.id,
            mp_id: mpId,
            status: 'running',
            imported_by: operatorId || null
        });
        importLogs.set(Number(team.id), next);
        return next;
    };

    try {
        const qualMaps = await TQualMappool.findAll({ where: { t_id: tid } });
        const mapByBeatmapId = new Map(qualMaps.map(map => [Number(map.map_id), map]));
        if (mapByBeatmapId.size === 0) {
            throw makeError('资格赛图池为空');
        }

        const playerByOsuUid = await buildPlayerLookup(teams);
        if (playerByOsuUid.size === 0) {
            throw makeError(teamId ? '队伍成员未绑定 osu 账号' : '本届队伍成员未绑定 osu 账号');
        }

        const match = await osuMatchService.getCompleteMatch(mpId);

        if (!match || !Array.isArray(match.events)) {
            throw makeError('无法获取比赛数据');
        }

        const games = osuMatchService.getGameEvents(match);
        const attemptByBeatmapId = new Map();
        const savedScores = [];
        let skippedDuplicates = 0;

        for (const event of games) {
            const game = event.game;
            const beatmapId = osuMatchService.getGameBeatmapId(game);
            const qualMap = mapByBeatmapId.get(beatmapId);
            if (!qualMap) continue;

            const attemptNo = (attemptByBeatmapId.get(beatmapId) || 0) + 1;
            attemptByBeatmapId.set(beatmapId, attemptNo);
            const sourceGameId = osuMatchService.getGameId(game, event);

            for (const score of osuMatchService.getGameScores(game)) {
                const entry = playerByOsuUid.get(Number(score.user_id));
                if (!entry?.player || !entry?.team) continue;

                const player = entry.player;
                const team = entry.team;
                if (!teamById.has(Number(team.id))) continue;

                const scoreValue = osuMatchService.getScoreValue(score);
                if (!scoreValue) continue;
                const importLog = await ensureImportLog(team);

                if (sourceGameId) {
                    const duplicate = await TQualScore.findOne({
                        where: {
                            map_id: qualMap.id,
                            team_id: team.id,
                            player_id: player.id,
                            source_mp_id: mpId,
                            source_game_id: sourceGameId
                        }
                    });
                    if (duplicate) {
                        skippedDuplicates += 1;
                        continue;
                    }
                }

                const saved = await TQualScore.create({
                    map_id: qualMap.id,
                    team_id: team.id,
                    player_id: player.id,
                    score: scoreValue,
                    attempt_no: attemptNo,
                    source_mp_id: mpId,
                    source_game_id: sourceGameId,
                    import_id: importLog.id,
                    is_manual: 0
                });

                savedScores.push({
                    id: saved.id,
                    map: qualMap.index,
                    map_id: qualMap.id,
                    team_id: team.id,
                    player_id: player.id,
                    attempt_no: attemptNo,
                    score: scoreValue
                });
            }
        }

        const savedCountByTeam = savedScores.reduce((acc, score) => {
            acc.set(Number(score.team_id), (acc.get(Number(score.team_id)) || 0) + 1);
            return acc;
        }, new Map());

        for (const [logTeamId, importLog] of importLogs.entries()) {
            const team = teamById.get(Number(logTeamId));
            if (team) {
                team.qual_mp_id = mpId;
                await team.save();
            }
            importLog.status = 'success';
            importLog.message = `导入 ${savedCountByTeam.get(Number(logTeamId)) || 0} 条成绩，跳过 ${skippedDuplicates} 条重复成绩`;
            await importLog.save();
        }

        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'qualifier_import',
            entity_id: null,
            action: 'import_scores',
            old_value: null,
            new_value: {
                team_ids: Array.from(importLogs.keys()),
                mp_id: mpId,
                saved_count: savedScores.length,
                skipped_duplicates: skippedDuplicates,
                auto_detect_teams: teamId === null
            },
            operator_id: operatorId
        });

        return {
            message: '成绩获取完成',
            importLogs: Array.from(importLogs.values()),
            scores: savedScores,
            skippedDuplicates
        };
    } catch (error) {
        for (const importLog of importLogs.values()) {
            importLog.status = 'failed';
            importLog.message = error.message || '导入失败';
            await importLog.save();
        }
        throw error;
    }
};

const normalizeMpIds = (body) => {
    const values = [];
    if (Array.isArray(body.mp_ids)) {
        values.push(...body.mp_ids);
    } else if (body.mp_ids !== undefined && body.mp_ids !== null && body.mp_ids !== '') {
        values.push(...(String(body.mp_ids).match(/\d{5,}/g) || []));
    }
    if (body.mp_id !== undefined && body.mp_id !== null && body.mp_id !== '') {
        values.push(body.mp_id);
    }

    const mpIds = [...new Set(values.map(value => Number(value)).filter(value => Number.isInteger(value) && value > 0))];
    if (mpIds.length === 0) {
        throw makeError('缺少 MP ID');
    }
    if (mpIds.length > 128) {
        throw makeError('单次最多导入 128 个 MP');
    }
    return mpIds;
};

const fetchQualScoresFromMps = async (tid, body, operatorId) => {
    const mpIds = normalizeMpIds(body);
    if (mpIds.length === 1) {
        return await fetchQualScoresFromMp(tid, { ...body, mp_id: mpIds[0] }, operatorId);
    }

    const results = [];
    for (const mpId of mpIds) {
        try {
            const result = await fetchQualScoresFromMp(tid, { ...body, mp_id: mpId }, operatorId);
            results.push({
                import_log_count: result.importLogs?.length || 0,
                mp_id: mpId,
                saved_count: result.scores?.length || 0,
                skipped_duplicates: result.skippedDuplicates || 0,
                status: 'success'
            });
        } catch (error) {
            results.push({
                error: error.message || '导入失败',
                mp_id: mpId,
                status: 'failed'
            });
        }
    }

    return {
        failed_count: results.filter(result => result.status === 'failed').length,
        message: '批量成绩获取完成',
        results,
        saved_count: results.reduce((total, result) => total + (result.saved_count || 0), 0),
        success_count: results.filter(result => result.status === 'success').length,
        total: results.length
    };
};

const calculateRanking = async (tid, operatorId) => {
    const tournament = await ensureQualifierUnlocked(tid);
    const rankMode = Number(tournament.qual_rank_mode) === QUAL_RANK_MODE_RANK_SUM
        ? QUAL_RANK_MODE_RANK_SUM
        : QUAL_RANK_MODE_TOTAL_SCORE;

    const teams = await TTeam.findAll({
        where: { t_id: tid, status: 1 },
        order: [['id', 'ASC']]
    });
    const qualMaps = await TQualMappool.findAll({
        where: { t_id: tid },
        order: [['index', 'ASC']]
    });

    const teamScores = new Map();
    for (const team of teams) {
        teamScores.set(team.id, {
            team,
            bestByMap: new Map(),
            mapRanks: new Map(),
            rankScore: 0,
            totalScore: 0
        });
    }

    const allScores = await TQualScore.findAll({
        include: [{ model: TQualMappool, as: 'map', where: { t_id: tid } }]
    });

    for (const score of allScores) {
        if (score.score <= 0) continue;

        const entry = teamScores.get(score.team_id);
        if (!entry) continue;

        const oldBest = entry.bestByMap.get(score.map_id);
        if (!oldBest || score.score > oldBest.score) {
            entry.bestByMap.set(score.map_id, {
                score: score.score,
                player_id: score.player_id,
                attempt_no: score.attempt_no,
                score_id: score.id
            });
        }
    }

    const ranking = rankMode === QUAL_RANK_MODE_RANK_SUM
        ? buildRankSumRanking(teamScores, qualMaps)
        : buildTotalScoreRanking(teamScores, qualMaps);
    const rankedTeamIds = new Set(ranking.map(entry => entry.team.id));
    assignCompetitionRanks(ranking);

    for (let i = 0; i < ranking.length; i++) {
        const team = ranking[i].team;
        team.qual_rank = ranking[i].rank;
        team.qual_score = ranking[i].rankingScore;
        await team.save();
    }
    for (const entry of teamScores.values()) {
        if (rankedTeamIds.has(entry.team.id)) continue;
        entry.team.qual_rank = null;
        entry.team.qual_score = null;
        await entry.team.save();
    }

    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'qualifier',
        entity_id: null,
        action: 'calculate_ranking',
        old_value: null,
        new_value: {
            map_count: qualMaps.length,
            rank_mode: rankMode,
            team_count: ranking.length
        },
        operator_id: operatorId
    });

    return {
        message: '排名计算完成',
        rank_mode: rankMode,
        ranking: ranking.map((entry) => ({
            rank: entry.rank,
            team: entry.team,
            rankScore: entry.rankScore,
            totalScore: entry.totalScore,
            bestByMap: Array.from(entry.bestByMap.entries()).map(([mapId, best]) => ({
                map_id: mapId,
                ...best,
                rank: entry.mapRanks.get(mapId) ?? null
            }))
        }))
    };
};

const buildTotalScoreRanking = (teamScores, qualMaps) => {
    return Array.from(teamScores.values()).map(entry => {
        let totalScore = 0;
        for (const map of qualMaps) {
            totalScore += entry.bestByMap.get(map.id)?.score || 0;
        }
        entry.totalScore = totalScore;
        entry.rankingScore = totalScore;
        return entry;
    }).filter(entry => entry.totalScore > 0).sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return a.team.id - b.team.id;
    });
};

const assignCompetitionRanks = (ranking) => {
    let currentRank = 0;
    let previousRankingScore = null;

    for (let index = 0; index < ranking.length; index++) {
        const entry = ranking[index];
        if (previousRankingScore === null || entry.rankingScore !== previousRankingScore) {
            currentRank = index + 1;
            previousRankingScore = entry.rankingScore;
        }
        entry.rank = currentRank;
    }
};

const buildRankSumRanking = (teamScores, qualMaps) => {
    const entries = Array.from(teamScores.values());

    for (const entry of entries) {
        let totalScore = 0;
        for (const map of qualMaps) {
            totalScore += entry.bestByMap.get(map.id)?.score || 0;
        }
        entry.totalScore = totalScore;
    }
    const rankableEntries = entries.filter(entry => entry.totalScore > 0);
    const missingRank = rankableEntries.length + 1;

    for (const entry of rankableEntries) {
        for (const map of qualMaps) {
            entry.mapRanks.set(map.id, missingRank);
        }
    }

    for (const map of qualMaps) {
        const rankedEntries = rankableEntries
            .filter(entry => entry.bestByMap.has(map.id))
            .sort((a, b) => {
                const scoreDiff = (b.bestByMap.get(map.id)?.score || 0) - (a.bestByMap.get(map.id)?.score || 0);
                if (scoreDiff !== 0) return scoreDiff;
                return a.team.id - b.team.id;
            });

        let currentRank = 0;
        let previousScore = null;
        for (let index = 0; index < rankedEntries.length; index++) {
            const entry = rankedEntries[index];
            const score = entry.bestByMap.get(map.id)?.score || 0;
            if (previousScore === null || score !== previousScore) {
                currentRank = index + 1;
                previousScore = score;
            }
            entry.mapRanks.set(map.id, currentRank);
        }
    }

    return rankableEntries.map(entry => {
        let rankScore = 0;
        for (const map of qualMaps) {
            rankScore += entry.mapRanks.get(map.id) ?? missingRank;
        }
        entry.rankScore = rankScore;
        entry.rankingScore = rankScore;
        return entry;
    }).sort((a, b) => {
        if (a.rankScore !== b.rankScore) return a.rankScore - b.rankScore;
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return a.team.id - b.team.id;
    });
};

const updateQualScore = async (tid, scoreId, body, operatorId) => {
    await ensureQualifierUnlocked(tid);

    const scoreValue = Number(body.score);
    if (!Number.isFinite(scoreValue) || scoreValue < 0) {
        throw makeError('成绩无效');
    }

    const score = await TQualScore.findOne({
        where: { id: scoreId },
        include: [{ model: TQualMappool, as: 'map', where: { t_id: tid } }]
    });
    if (!score) {
        throw makeError('成绩不存在', 404);
    }

    const oldValue = auditService.pickModelValues(score, ['id', 'team_id', 'player_id', 'map_id', 'score', 'attempt_no', 'is_manual']);
    score.score = Math.round(scoreValue);
    score.is_manual = 1;
    await score.save();

    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'qualifier_score',
        entity_id: score.id,
        action: 'manual_update',
        old_value: oldValue,
        new_value: auditService.pickModelValues(score, ['id', 'team_id', 'player_id', 'map_id', 'score', 'attempt_no', 'is_manual']),
        operator_id: operatorId
    });

    return score;
};

const getQualRanking = async (tid) => {
    await ensureTournament(tid);
    return TTeam.findAll({
        where: { t_id: tid, status: 1, qual_rank: { [Op.ne]: null } },
        include: [
            { model: TPlayer, as: 'players', include: [{ model: User, as: 'user', attributes: ['user_id', 'user_name', 'avatar', 'osu_uid'] }] }
        ],
        order: [['qual_rank', 'ASC']]
    });
};

const getEligibleRankedTeams = async (tid, limit) => {
    const teams = await TTeam.findAll({
        where: { t_id: tid, status: 1, qual_rank: { [Op.ne]: null } },
        include: [{ model: TPlayer, as: 'players' }],
        order: [['qual_rank', 'ASC'], ['qual_score', 'DESC'], ['id', 'ASC']]
    });

    return teams
        .filter(team => Array.isArray(team.players) && team.players.some(player => player.review_status !== 'review_failed'))
        .slice(0, limit);
};

const lockQualifierRanking = async (tid, operatorId) => {
    const tournament = await ensureTournament(tid);
    assertQualifierUnlocked(tournament);

    const topN = Number(tournament.qual_top_n || 32);
    await calculateRanking(tid, operatorId);
    const qualifiedTeams = await getEligibleRankedTeams(tid, topN);
    if (qualifiedTeams.length < topN) {
        throw makeError(`锁榜需要 ${topN} 支通过正赛资格的队伍，当前只有 ${qualifiedTeams.length} 支`);
    }

    const oldValue = auditService.pickModelValues(tournament, ['id', 'qual_locked_at', 'qual_locked_by', 'qual_locked_top_n']);
    tournament.qual_locked_at = new Date();
    tournament.qual_locked_by = operatorId || null;
    tournament.qual_locked_top_n = topN;
    await tournament.save();

    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'qualifier',
        entity_id: null,
        action: 'lock_ranking',
        old_value: oldValue,
        new_value: {
            ...auditService.pickModelValues(tournament, ['id', 'qual_locked_at', 'qual_locked_by', 'qual_locked_top_n']),
            qualified_team_ids: qualifiedTeams.map(team => team.id)
        },
        operator_id: operatorId
    });

    return {
        message: '资格赛排名已锁定',
        tournament,
        qualifiedTeams
    };
};

module.exports = {
    assertQualifierUnlocked,
    calculateRanking,
    createQualMap,
    deleteQualMap,
    fetchQualScoresFromMp: fetchQualScoresFromMps,
    getQualRanking,
    listImports,
    listQualScores,
    lockQualifierRanking,
    updateQualMap,
    updateQualScore
};

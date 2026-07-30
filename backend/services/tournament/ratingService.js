const crypto = require('crypto');
const { Op } = require('sequelize');
const sequelize = require('../../config/db');
const {
    Tournament,
    TGame,
    TMatch,
    TMappool,
    TPlayer,
    TRound,
    TTeam,
    TTournamentPlayPerformance,
    TTournamentPlayerRating,
    TTournamentRatingSnapshot
} = require('../../models/tournament');
const User = require('../../models/user/user');
const auditService = require('./auditService');
const roundStageService = require('./roundStageService');

const MODEL_VERSION = 'tournament-rating-v2.11';
const DEFAULT_PARAMETERS = Object.freeze({
    display_base: 1000,
    display_scale: 2,
    high_score_max_bonus: 100,
    high_score_threshold: 999000,
    participation_base: 0.5,
    participation_reference_games: 30,
    participation_weight: 0.5,
    rank_scale: 250,
    round_step: 0.05
});

const makeError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const numberValue = value => Number(value) || 0;
const roundRating = value => Math.round(value * 1000) / 1000;
const toDisplayRating = (rawRating, parameters) => (
    parameters.display_base + parameters.display_scale * rawRating
);

const getReliability = gameCount => gameCount >= 8 ? 'high' : gameCount >= 3 ? 'medium' : 'low';

const compareGames = (left, right) => {
    if (left.roundOrder !== right.roundOrder) return left.roundOrder - right.roundOrder;
    const leftTime = left.scheduledAt ? new Date(left.scheduledAt).getTime() : Number.NaN;
    const rightTime = right.scheduledAt ? new Date(right.scheduledAt).getTime() : Number.NaN;
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return leftTime - rightTime;
    if (left.matchId !== right.matchId) return left.matchId - right.matchId;
    if (left.gameOrder !== right.gameOrder) return left.gameOrder - right.gameOrder;
    return left.id - right.id;
};

const getMapKey = game => String(game.beatmapId || `pool:${game.mapId}`);

const buildSourceHash = games => crypto
    .createHash('sha256')
    .update(JSON.stringify(games.map(game => ({
        id: game.id,
        matchId: game.matchId,
        mapId: game.mapId,
        beatmapId: game.beatmapId,
        gameOrder: game.gameOrder,
        player1Id: game.player1.playerId,
        player1TeamId: game.player1.teamId,
        player1Score: game.player1.score,
        player1UserId: game.player1.userId,
        player2Id: game.player2.playerId,
        player2TeamId: game.player2.teamId,
        player2Score: game.player2.score,
        player2UserId: game.player2.userId,
        roundOrder: game.roundOrder,
        roundStage: game.roundStage,
        scheduledAt: game.scheduledAt ? new Date(game.scheduledAt).toISOString() : null
    }))))
    .digest('hex');

const flattenEligibleGames = matches => {
    const games = [];
    for (const match of matches) {
        if (String(match.result_type || 'normal').toLowerCase() !== 'normal') continue;
        for (const game of match.games || []) {
            const player1Id = numberValue(game.player1_id);
            const player2Id = numberValue(game.player2_id);
            const player1Score = numberValue(game.player1_score);
            const player2Score = numberValue(game.player2_score);
            const player1UserId = numberValue(game.player1?.user_id);
            const player2UserId = numberValue(game.player2?.user_id);
            if (numberValue(game.action_type) !== 2
                || player1Id <= 0
                || player2Id <= 0
                || player1UserId <= 0
                || player2UserId <= 0
                || player1Score <= 0
                || player2Score <= 0
                || player1Score === player2Score) continue;

            games.push({
                beatmapId: numberValue(game.map?.map_id),
                gameOrder: numberValue(game.order),
                id: numberValue(game.id),
                mapId: numberValue(game.map_id),
                matchId: numberValue(match.id),
                player1: {
                    playerId: player1Id,
                    score: player1Score,
                    teamId: numberValue(game.player1?.team_id) || null,
                    userId: player1UserId
                },
                player2: {
                    playerId: player2Id,
                    score: player2Score,
                    teamId: numberValue(game.player2?.team_id) || null,
                    userId: player2UserId
                },
                roundOrder: numberValue(match.round?.order),
                roundStage: roundStageService.getRoundStage(match.round),
                scheduledAt: match.scheduled_time || null
            });
        }
    }
    return games.sort(compareGames);
};

const loadTournamentGames = async (tid, options = {}) => {
    const tournament = await Tournament.findByPk(tid, {
        transaction: options.transaction,
        ...(options.lock ? { lock: options.lock } : {})
    });
    if (!tournament) throw makeError('赛事不存在', 404);

    const matches = await TMatch.findAll({
        include: [
            { model: TRound, as: 'round', where: { t_id: tid }, attributes: ['id', 'name', 'bracket_type', 'order'] },
            {
                model: TGame,
                as: 'games',
                required: false,
                include: [
                    { model: TMappool, as: 'map' },
                    { model: TPlayer, as: 'player1', attributes: ['id', 'team_id', 'user_id'] },
                    { model: TPlayer, as: 'player2', attributes: ['id', 'team_id', 'user_id'] }
                ]
            }
        ],
        order: [
            [{ model: TRound, as: 'round' }, 'order', 'ASC'],
            ['scheduled_time', 'ASC'],
            ['id', 'ASC'],
            [{ model: TGame, as: 'games' }, 'order', 'ASC'],
            [{ model: TGame, as: 'games' }, 'id', 'ASC']
        ],
        transaction: options.transaction
    });
    return { games: flattenEligibleGames(matches), tournament };
};

const buildMapStatistics = games => {
    const scoresByMap = new Map();
    for (const game of games) {
        const key = getMapKey(game);
        scoresByMap.set(key, [...(scoresByMap.get(key) || []), game.player1.score, game.player2.score]);
    }

    return new Map(Array.from(scoresByMap.entries()).map(([key, scores]) => {
        const percentileByScore = new Map();
        for (const score of new Set(scores)) {
            const below = scores.filter(candidate => candidate < score).length;
            percentileByScore.set(score, (below + 1) / scores.length);
        }
        return [key, {
            count: scores.length,
            percentileByScore
        }];
    }));
};

const getParticipationCoefficient = (gameCount, parameters) => {
    if (gameCount <= 0) return 0;
    return parameters.participation_base
        + parameters.participation_weight
        * Math.log(gameCount + 1)
        / Math.log(parameters.participation_reference_games + 1);
};

const getRoundCoefficient = (game, parameters) => {
    const stageIndex = roundStageService.getStageSortIndex(game.roundStage);
    const normalizedOrder = stageIndex < roundStageService.STAGE_ORDER.length
        ? stageIndex
        : Math.max(0, numberValue(game.roundOrder) - 1);
    return 1 + normalizedOrder * parameters.round_step;
};

const getHighScoreBonus = (score, parameters) => {
    const bonusRange = 1000000 - parameters.high_score_threshold;
    if (bonusRange <= 0) return 0;
    return Math.max(0, Math.min(
        parameters.high_score_max_bonus,
        (numberValue(score) - parameters.high_score_threshold)
            / bonusRange
            * parameters.high_score_max_bonus
    ));
};

const calculateTpr = (gprTotal, gameCount, parameters) => {
    if (gameCount <= 0) return 0;
    return getParticipationCoefficient(gameCount, parameters) * gprTotal / gameCount;
};

const calculateTournamentRatings = (sourceGames, overrides = {}) => {
    const parameters = { ...DEFAULT_PARAMETERS, ...overrides };
    const games = [...sourceGames].sort(compareGames);
    const mapStats = buildMapStatistics(games);
    const states = new Map();
    const plays = [];

    const ensureState = player => {
        if (!states.has(player.playerId)) {
            states.set(player.playerId, {
                bestJpp: Number.NEGATIVE_INFINITY,
                gameCount: 0,
                jppTotal: 0,
                playerId: player.playerId,
                rating: parameters.display_base,
                rawGprTotal: 0,
                rawRating: 0,
                teamId: player.teamId,
                userId: player.userId,
                winCount: 0
            });
        }
        return states.get(player.playerId);
    };

    const matches = [];
    for (const game of games) {
        const current = matches.at(-1);
        if (!current || current.matchId !== game.matchId) matches.push({ matchId: game.matchId, games: [game] });
        else current.games.push(game);
    }

    let gameIndex = 0;
    for (const match of matches) {
        for (const game of match.games) {
            for (const player of [game.player1, game.player2]) {
                ensureState(player);
            }
        }

        for (const game of match.games) {
            gameIndex += 1;
            const mapStatistic = mapStats.get(getMapKey(game));
            const roundCoefficient = getRoundCoefficient(game, parameters);
            const player1State = ensureState(game.player1);
            const player2State = ensureState(game.player2);

            const calculatePlay = (player, opponent, playerState, side) => {
                const mapPercentile = mapStatistic.percentileByScore.get(player.score) ?? (1 / mapStatistic.count);
                const won = player.score > opponent.score;
                const rankComponent = roundCoefficient * parameters.rank_scale * mapPercentile;
                const highScoreComponent = roundCoefficient * getHighScoreBonus(player.score, parameters);
                const rawGpr = rankComponent + highScoreComponent;
                const jpp = toDisplayRating(rawGpr, parameters);
                const ratingBefore = playerState.rating;
                const rawRatingAfter = calculateTpr(
                    playerState.rawGprTotal + rawGpr,
                    playerState.gameCount + 1,
                    parameters
                );
                const ratingAfter = toDisplayRating(rawRatingAfter, parameters);
                return {
                    absolute_component: roundRating(toDisplayRating(rankComponent, parameters)),
                    absolute_weight: roundRating(roundCoefficient),
                    game_id: game.id,
                    jpp: roundRating(jpp),
                    map_id: game.mapId,
                    match_component: roundRating(parameters.display_scale * highScoreComponent),
                    match_id: game.matchId,
                    opponent_player_id: opponent.playerId,
                    opponent_score: opponent.score,
                    opponent_user_id: opponent.userId,
                    playQuality: mapPercentile,
                    player_id: player.playerId,
                    rating_after: roundRating(ratingAfter),
                    rating_before: roundRating(ratingBefore),
                    rating_delta: roundRating(ratingAfter - ratingBefore),
                    rawGpr,
                    rawRatingAfter,
                    reliability: getReliability(playerState.gameCount + 1),
                    score: player.score,
                    sequence_no: gameIndex,
                    side,
                    user_id: player.userId,
                    won: won ? 1 : 0
                };
            };

            const player1Play = calculatePlay(game.player1, game.player2, player1State, 1);
            const player2Play = calculatePlay(game.player2, game.player1, player2State, 2);
            plays.push(player1Play, player2Play);

            for (const [state, play] of [[player1State, player1Play], [player2State, player2Play]]) {
                state.rating = play.rating_after;
                state.rawGprTotal += play.rawGpr;
                state.rawRating = play.rawRatingAfter;
                state.gameCount += 1;
                state.winCount += play.won;
                state.jppTotal += play.jpp;
                state.bestJpp = Math.max(state.bestJpp, play.jpp);
            }
        }
    }

    const ratings = Array.from(states.values()).map(state => ({
        average_jpp: roundRating(state.jppTotal / state.gameCount),
        best_jpp: roundRating(state.bestJpp),
        game_count: state.gameCount,
        player_id: state.playerId,
        rating_delta: roundRating(state.rating - parameters.display_base),
        reliability: getReliability(state.gameCount),
        team_id: state.teamId,
        tournament_rating: roundRating(state.rating),
        user_id: state.userId,
        win_count: state.winCount
    })).sort((left, right) => right.tournament_rating - left.tournament_rating || left.player_id - right.player_id);

    return { parameters, plays, ratings };
};

const serializeSnapshot = snapshot => snapshot ? {
    calculated_at: snapshot.calculated_at,
    calculated_by: snapshot.calculated_by,
    finalized_at: snapshot.finalized_at,
    finalized_by: snapshot.finalized_by,
    game_count: numberValue(snapshot.game_count),
    id: numberValue(snapshot.id),
    is_final: Boolean(snapshot.is_final),
    model_version: snapshot.model_version,
    player_count: numberValue(snapshot.player_count),
    source_hash: snapshot.source_hash
} : null;

const calculate = async (tid, operatorId) => sequelize.transaction(async transaction => {
    const { games } = await loadTournamentGames(tid, { transaction, lock: transaction.LOCK.UPDATE });
    if (games.length === 0) throw makeError('该赛事暂无可计算的有效 game');

    let snapshot = await TTournamentRatingSnapshot.findOne({
        where: { t_id: tid },
        transaction,
        lock: transaction.LOCK.UPDATE
    });
    if (snapshot?.is_final) throw makeError('最终 TPR 排名已锁定，请先解锁后再重新计算', 409);

    const sourceHash = buildSourceHash(games);
    const result = calculateTournamentRatings(games);
    const calculatedAt = new Date();
    const oldValue = serializeSnapshot(snapshot);
    const snapshotValues = {
        calculated_at: calculatedAt,
        calculated_by: operatorId || null,
        game_count: games.length,
        model_version: MODEL_VERSION,
        parameters_json: JSON.stringify(result.parameters),
        player_count: result.ratings.length,
        source_hash: sourceHash
    };

    if (snapshot) {
        await TTournamentPlayPerformance.destroy({ where: { snapshot_id: snapshot.id }, transaction });
        await TTournamentPlayerRating.destroy({ where: { snapshot_id: snapshot.id }, transaction });
        snapshot.set(snapshotValues);
        await snapshot.save({ transaction });
    } else {
        snapshot = await TTournamentRatingSnapshot.create({ t_id: tid, ...snapshotValues }, { transaction });
    }

    await TTournamentPlayPerformance.bulkCreate(
        result.plays.map(play => ({ ...play, snapshot_id: snapshot.id, t_id: tid })),
        { transaction }
    );
    await TTournamentPlayerRating.bulkCreate(
        result.ratings.map(rating => ({ ...rating, snapshot_id: snapshot.id, t_id: tid })),
        { transaction }
    );

    const serialized = serializeSnapshot(snapshot);
    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'tournament_rating',
        entity_id: snapshot.id,
        action: oldValue ? 'recalculate' : 'calculate',
        old_value: oldValue,
        new_value: serialized,
        operator_id: operatorId
    }, { transaction });

    return { message: '赛事评分计算完成', snapshot: serialized };
});

const listManage = async tid => {
    const [{ games }, snapshot] = await Promise.all([
        loadTournamentGames(tid),
        TTournamentRatingSnapshot.findOne({ where: { t_id: tid } })
    ]);
    const currentHash = games.length > 0 ? buildSourceHash(games) : null;
    return {
        can_calculate: games.length > 0 && !Boolean(snapshot?.is_final),
        current_game_count: games.length,
        is_calculated: Boolean(snapshot),
        is_stale: Boolean(snapshot && (
            currentHash !== snapshot.source_hash
            || snapshot.model_version !== MODEL_VERSION
        )),
        snapshot: serializeSnapshot(snapshot)
    };
};

const setFinal = async (tid, isFinal, operatorId) => sequelize.transaction(async transaction => {
    const { games } = await loadTournamentGames(tid, { transaction, lock: transaction.LOCK.UPDATE });
    const snapshot = await TTournamentRatingSnapshot.findOne({
        where: { t_id: tid },
        transaction,
        lock: transaction.LOCK.UPDATE
    });
    if (!snapshot) throw makeError('请先计算赛事评分');
    if (isFinal && snapshot.model_version !== MODEL_VERSION) throw makeError('评分模型已更新，请先重新计算评分');
    if (isFinal && buildSourceHash(games) !== snapshot.source_hash) throw makeError('比赛成绩已变化，请先重新计算评分');

    const oldValue = serializeSnapshot(snapshot);
    snapshot.is_final = isFinal ? 1 : 0;
    snapshot.finalized_by = isFinal ? operatorId || null : null;
    snapshot.finalized_at = isFinal ? new Date() : null;
    await snapshot.save({ transaction });
    const serialized = serializeSnapshot(snapshot);
    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'tournament_rating',
        entity_id: snapshot.id,
        action: isFinal ? 'finalize' : 'unlock',
        old_value: oldValue,
        new_value: serialized,
        operator_id: operatorId
    }, { transaction });
    return { message: isFinal ? '最终 TPR 排名已确认' : '最终 TPR 排名已解锁', snapshot: serialized };
});

const serializePlayer = player => player ? {
    avatar_snapshot: player.avatar_snapshot,
    id: player.id,
    team_id: player.team_id,
    user: player.user ? {
        avatar: player.user.avatar,
        osu_uid: player.user.osu_uid,
        user_id: player.user.user_id,
        user_name: player.user.user_name
    } : null,
    user_id: player.user_id,
    user_name_snapshot: player.user_name_snapshot
} : null;

const listPublished = async tid => {
    const snapshot = await TTournamentRatingSnapshot.findOne({ where: { t_id: tid } });
    if (!snapshot) return { ratings: [], snapshot: null, stages: [] };

    const [ratingRows, playRows] = await Promise.all([
        TTournamentPlayerRating.findAll({
            where: { snapshot_id: snapshot.id },
            include: [
                { model: TPlayer, as: 'player', include: [{ model: User, as: 'user', attributes: ['user_id', 'user_name', 'avatar', 'osu_uid'] }] },
                { model: TTeam, as: 'team', attributes: ['id', 'name', 'display_name', 'avatar'] }
            ],
            order: [['tournament_rating', 'DESC'], ['player_id', 'ASC']]
        }),
        TTournamentPlayPerformance.findAll({
            where: { snapshot_id: snapshot.id },
            include: [{
                model: TGame,
                as: 'game',
                include: [
                    { model: TMappool, as: 'map' },
                    {
                        model: TMatch,
                        as: 'match',
                        include: [
                            { model: TRound, as: 'round' },
                            { model: TTeam, as: 'team1', attributes: ['id', 'name', 'display_name', 'avatar'] },
                            { model: TTeam, as: 'team2', attributes: ['id', 'name', 'display_name', 'avatar'] }
                        ]
                    }
                ]
            }, {
                model: TPlayer,
                as: 'player',
                include: [{ model: User, as: 'user', attributes: ['user_id', 'user_name', 'avatar', 'osu_uid'] }]
            }],
            order: [['sequence_no', 'ASC'], ['side', 'ASC']]
        })
    ]);

    const ratings = ratingRows.map((row, index) => ({
        average_gpr: numberValue(row.average_jpp),
        average_jpp: numberValue(row.average_jpp),
        best_gpr: numberValue(row.best_jpp),
        best_jpp: numberValue(row.best_jpp),
        game_count: numberValue(row.game_count),
        player: serializePlayer(row.player),
        rank: index + 1,
        rating_delta: numberValue(row.rating_delta),
        reliability: row.reliability,
        team: row.team ? auditService.pickModelValues(row.team, ['id', 'name', 'display_name', 'avatar']) : null,
        tpr: numberValue(row.tournament_rating),
        tournament_rating: numberValue(row.tournament_rating),
        win_count: numberValue(row.win_count)
    }));

    const stageMap = new Map();
    for (const row of playRows) {
        const game = row.game;
        const match = game?.match;
        const round = match?.round;
        if (!game || !match || !round || !row.player) continue;
        const stage = roundStageService.getRoundStage(round);
        if (!stage) continue;
        if (!stageMap.has(stage)) stageMap.set(stage, { key: stage, label: roundStageService.getStageLabel(stage), maps: new Map() });
        const stageData = stageMap.get(stage);
        const mapKey = game.map ? `${String(game.map.type || '').toUpperCase()}-${game.map.map_id || game.map.id}` : `map-${game.map_id}`;
        if (!stageData.maps.has(mapKey)) {
            stageData.maps.set(mapKey, {
                entries: [],
                key: mapKey,
                map: game.map ? auditService.pickModelValues(game.map) : null
            });
        }
        const team = numberValue(row.side) === 1 ? match.team1 : match.team2;
        stageData.maps.get(mapKey).entries.push({
            absolute_component: numberValue(row.absolute_component),
            absolute_weight: numberValue(row.absolute_weight),
            game_id: numberValue(row.game_id),
            gpr: numberValue(row.jpp),
            jpp: numberValue(row.jpp),
            match_component: numberValue(row.match_component),
            match_id: numberValue(row.match_id),
            opponent_score: numberValue(row.opponent_score),
            player: serializePlayer(row.player),
            rating_after: numberValue(row.rating_after),
            rating_before: numberValue(row.rating_before),
            rating_delta: numberValue(row.rating_delta),
            reliability: row.reliability,
            score: numberValue(row.score),
            sequence_no: numberValue(row.sequence_no),
            side: numberValue(row.side),
            team: team ? auditService.pickModelValues(team, ['id', 'name', 'display_name', 'avatar']) : null,
            won: Boolean(row.won)
        });
    }

    const stages = Array.from(stageMap.values())
        .sort((left, right) => roundStageService.getStageSortIndex(left.key) - roundStageService.getStageSortIndex(right.key))
        .map(stage => ({
            key: stage.key,
            label: stage.label,
            maps: Array.from(stage.maps.values()).map(mapData => {
                const entries = mapData.entries.sort((left, right) => right.score - left.score);
                let lastScore = null;
                let lastRank = 0;
                return {
                    ...mapData,
                    entries: entries.map((entry, index) => {
                        const rank = entry.score === lastScore ? lastRank : index + 1;
                        lastScore = entry.score;
                        lastRank = rank;
                        return { ...entry, rank };
                    })
                };
            })
        }));

    return { ratings, snapshot: serializeSnapshot(snapshot), stages };
};

const listPublishedForUser = async userId => {
    const ratingRows = await TTournamentPlayerRating.findAll({
        where: { user_id: userId },
        include: [
            {
                model: TTournamentRatingSnapshot,
                as: 'snapshot',
                required: true,
                include: [{
                    model: Tournament,
                    as: 'tournament',
                    attributes: ['id', 'name', 'acronym', 'banner', 'status', 'qual_start', 'qual_end', 'created_time']
                }]
            },
            { model: TPlayer, as: 'player', include: [{ model: User, as: 'user', attributes: ['user_id', 'user_name', 'avatar', 'osu_uid'] }] },
            { model: TTeam, as: 'team', attributes: ['id', 'name', 'display_name', 'avatar'] }
        ],
        order: [[{ model: TTournamentRatingSnapshot, as: 'snapshot' }, 'calculated_at', 'DESC']]
    });

    const experiences = await Promise.all(ratingRows.map(async row => {
        const [higherRatedCount, playRows] = await Promise.all([
            TTournamentPlayerRating.count({
                where: {
                    snapshot_id: row.snapshot_id,
                    tournament_rating: { [Op.gt]: row.tournament_rating }
                }
            }),
            TTournamentPlayPerformance.findAll({
                where: { snapshot_id: row.snapshot_id },
                include: [{
                    model: TGame,
                    as: 'game',
                    include: [
                        { model: TMappool, as: 'map' },
                        {
                            model: TMatch,
                            as: 'match',
                            include: [
                                { model: TRound, as: 'round' },
                                { model: TTeam, as: 'team1', attributes: ['id', 'name', 'display_name', 'avatar'] },
                                { model: TTeam, as: 'team2', attributes: ['id', 'name', 'display_name', 'avatar'] }
                            ]
                        }
                    ]
                }, {
                    model: TPlayer,
                    as: 'player',
                    include: [{ model: User, as: 'user', attributes: ['user_id', 'user_name', 'avatar', 'osu_uid'] }]
                }],
                order: [['sequence_no', 'ASC'], ['side', 'ASC']]
            })
        ]);

        const rankByPerformanceId = new Map();
        const performanceRowsByMap = new Map();
        for (const play of playRows) {
            const game = play.game;
            const round = game?.match?.round;
            const stage = round ? roundStageService.getRoundStage(round) : null;
            if (!game || !stage) continue;
            const mapKey = game.map ? `${String(game.map.type || '').toUpperCase()}-${game.map.map_id || game.map.id}` : `map-${game.map_id}`;
            const groupKey = `${stage}:${mapKey}`;
            if (!performanceRowsByMap.has(groupKey)) performanceRowsByMap.set(groupKey, []);
            performanceRowsByMap.get(groupKey).push(play);
        }
        for (const rows of performanceRowsByMap.values()) {
            const rankedRows = rows.sort((left, right) => numberValue(right.score) - numberValue(left.score));
            let lastScore = null;
            let lastRank = 0;
            rankedRows.forEach((play, index) => {
                const score = numberValue(play.score);
                const rank = score === lastScore ? lastRank : index + 1;
                lastScore = score;
                lastRank = rank;
                rankByPerformanceId.set(numberValue(play.id), rank);
            });
        }

        const stageMap = new Map();
        for (const play of playRows) {
            if (numberValue(play.user_id) !== numberValue(userId)) continue;
            const game = play.game;
            const match = game?.match;
            const round = match?.round;
            if (!game || !match || !round || !play.player) continue;
            const stage = roundStageService.getRoundStage(round);
            if (!stage) continue;
            if (!stageMap.has(stage)) stageMap.set(stage, { key: stage, label: roundStageService.getStageLabel(stage), maps: new Map() });
            const stageData = stageMap.get(stage);
            const mapKey = game.map ? `${String(game.map.type || '').toUpperCase()}-${game.map.map_id || game.map.id}` : `map-${game.map_id}`;
            if (!stageData.maps.has(mapKey)) {
                stageData.maps.set(mapKey, { entries: [], key: mapKey, map: game.map ? auditService.pickModelValues(game.map) : null });
            }
            const team = numberValue(play.side) === 1 ? match.team1 : match.team2;
            stageData.maps.get(mapKey).entries.push({
                absolute_component: numberValue(play.absolute_component),
                absolute_weight: numberValue(play.absolute_weight),
                game_id: numberValue(play.game_id),
                gpr: numberValue(play.jpp),
                jpp: numberValue(play.jpp),
                match_component: numberValue(play.match_component),
                match_id: numberValue(play.match_id),
                opponent_score: numberValue(play.opponent_score),
                player: serializePlayer(play.player),
                rank: rankByPerformanceId.get(numberValue(play.id)) || 0,
                rating_after: numberValue(play.rating_after),
                rating_before: numberValue(play.rating_before),
                rating_delta: numberValue(play.rating_delta),
                reliability: play.reliability,
                score: numberValue(play.score),
                sequence_no: numberValue(play.sequence_no),
                side: numberValue(play.side),
                team: team ? auditService.pickModelValues(team, ['id', 'name', 'display_name', 'avatar']) : null,
                won: Boolean(play.won)
            });
        }

        const stages = Array.from(stageMap.values())
            .sort((left, right) => roundStageService.getStageSortIndex(left.key) - roundStageService.getStageSortIndex(right.key))
            .map(stage => ({ ...stage, maps: Array.from(stage.maps.values()) }));
        const rating = {
            average_gpr: numberValue(row.average_jpp),
            average_jpp: numberValue(row.average_jpp),
            best_gpr: numberValue(row.best_jpp),
            best_jpp: numberValue(row.best_jpp),
            game_count: numberValue(row.game_count),
            player: serializePlayer(row.player),
            rank: higherRatedCount + 1,
            rating_delta: numberValue(row.rating_delta),
            reliability: row.reliability,
            team: row.team ? auditService.pickModelValues(row.team, ['id', 'name', 'display_name', 'avatar']) : null,
            tpr: numberValue(row.tournament_rating),
            tournament_rating: numberValue(row.tournament_rating),
            win_count: numberValue(row.win_count)
        };

        return {
            rating,
            snapshot: serializeSnapshot(row.snapshot),
            stages,
            tournament: row.snapshot?.tournament
                ? auditService.pickModelValues(row.snapshot.tournament, ['id', 'name', 'acronym', 'banner', 'status', 'qual_start', 'qual_end', 'created_time'])
                : null
        };
    }));
    return experiences.filter(item => item.tournament && item.rating);
};

module.exports = {
    DEFAULT_PARAMETERS,
    MODEL_VERSION,
    buildSourceHash,
    calculate,
    calculateTournamentRatings,
    flattenEligibleGames,
    listManage,
    listPublished,
    listPublishedForUser,
    setFinal
};

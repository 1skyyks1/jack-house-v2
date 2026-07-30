const { Op } = require('sequelize');
const sequelize = require('../config/db');
const { TGame, TMatch, TMappool, TPlayer } = require('../models/tournament');
const User = require('../models/user/user');
const osuMatchService = require('../services/tournament/osuMatchService');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const parseIntegerOption = (name, fallback, { min = 0 } = {}) => {
    const prefix = `--${name}=`;
    const raw = process.argv.find(argument => argument.startsWith(prefix));
    if (!raw) return fallback;
    const value = Number(raw.slice(prefix.length));
    if (!Number.isInteger(value) || value < min) throw new Error(`--${name} must be an integer >= ${min}`);
    return value;
};

const APPLY = process.argv.includes('--apply');
const DELAY_MS = parseIntegerOption('delay-ms', 2000);
const PAGE_DELAY_MS = parseIntegerOption('page-delay-ms', 1000);
const LIMIT = parseIntegerOption('limit', 0);
const TOURNAMENT_ID = parseIntegerOption('tournament-id', 0);
const MAX_ATTEMPTS = 3;

const getPlayerOsuUid = player => {
    const value = Number(player?.user?.osu_uid);
    return Number.isInteger(value) && value > 0 ? value : null;
};

const buildUpstreamGames = match => osuMatchService.getGameEvents(match).map((event, index) => {
    const game = event.game;
    const scores = osuMatchService.getGameScores(game).map(score => ({
        missCount: osuMatchService.getScoreMissCount(score),
        score: osuMatchService.getScoreValue(score),
        userId: osuMatchService.getScoreUserId(score)
    })).filter(score => score.userId > 0);
    return {
        beatmapId: osuMatchService.getGameBeatmapId(game),
        id: Number(osuMatchService.getGameId(game, event)) || null,
        index,
        playedAt: osuMatchService.getGamePlayedAt(game, event),
        scores
    };
});

const findScore = (upstreamGame, osuUid, localScore) => {
    if (osuUid) {
        const byUser = upstreamGame.scores.find(score => score.userId === osuUid);
        if (byUser) return byUser;
    }
    const byValue = upstreamGame.scores.filter(score => score.score === Number(localScore));
    return byValue.length === 1 ? byValue[0] : null;
};

const scoreMatchesLocalGame = (upstreamGame, game) => {
    const player1 = findScore(upstreamGame, getPlayerOsuUid(game.player1), game.player1_score);
    const player2 = findScore(upstreamGame, getPlayerOsuUid(game.player2), game.player2_score);
    return player1?.score === Number(game.player1_score) && player2?.score === Number(game.player2_score);
};

const usersMatchLocalGame = (upstreamGame, game) => {
    const player1Uid = getPlayerOsuUid(game.player1);
    const player2Uid = getPlayerOsuUid(game.player2);
    if (!player1Uid || !player2Uid) return false;
    const upstreamUserIds = new Set(upstreamGame.scores.map(score => score.userId));
    return upstreamUserIds.has(player1Uid) && upstreamUserIds.has(player2Uid);
};

const atLeastOneUserMatchesLocalGame = (upstreamGame, game) => {
    const localUserIds = [getPlayerOsuUid(game.player1), getPlayerOsuUid(game.player2)].filter(Boolean);
    if (localUserIds.length === 0) return false;
    const upstreamUserIds = new Set(upstreamGame.scores.map(score => score.userId));
    return localUserIds.some(userId => upstreamUserIds.has(userId));
};

const chooseUpstreamGame = (game, upstreamGames, usedIds) => {
    const available = upstreamGames.filter(candidate => !candidate.id || !usedIds.has(candidate.id));
    const exactId = Number(game.mp_game_id);
    if (exactId > 0) {
        const exact = available.find(candidate => candidate.id === exactId);
        if (exact) return { candidate: exact, strategy: 'mp_game_id' };
    }

    const beatmapId = Number(game.map?.map_id);
    const sameMap = available.filter(candidate => candidate.beatmapId === beatmapId);
    const exactScores = sameMap.filter(candidate => scoreMatchesLocalGame(candidate, game));
    if (exactScores.length > 0) return { candidate: exactScores.at(-1), strategy: 'map_users_scores' };

    const exactUsers = sameMap.filter(candidate => usersMatchLocalGame(candidate, game));
    if (exactUsers.length > 0) return { candidate: exactUsers.at(-1), strategy: 'map_users_latest' };

    // osu! occasionally omits one side of a game. A unique same-map game with at
    // least one confirmed osu! UID is still safe to associate; the absent side's
    // miss count remains NULL instead of being incorrectly treated as zero.
    const partialUsers = sameMap.filter(candidate => atLeastOneUserMatchesLocalGame(candidate, game));
    if (partialUsers.length === 1) return { candidate: partialUsers[0], strategy: 'map_partial_users' };
    return { candidate: null, strategy: 'unmatched' };
};

const fetchMatchWithRetry = async mpId => {
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            return await osuMatchService.getCompleteMatch(mpId, { pageDelayMs: PAGE_DELAY_MS });
        } catch (error) {
            lastError = error;
            if (attempt < MAX_ATTEMPTS) await sleep(5000 * attempt);
        }
    }
    throw lastError;
};

const main = async () => {
    const summary = {
        apply: APPLY,
        failedMatches: [],
        gamesMatched: 0,
        gamesUpdated: 0,
        matchesFetched: 0,
        sidesUpdated: 0,
        strategies: {},
        unmatchedGames: []
    };

    try {
        await sequelize.authenticate();
        const where = { mp_id: { [Op.ne]: null } };
        if (TOURNAMENT_ID > 0) where['$round.t_id$'] = TOURNAMENT_ID;
        let matches = await TMatch.findAll({
            where,
            include: [
                { association: 'round', attributes: ['id', 't_id'] },
                {
                    model: TGame,
                    as: 'games',
                    required: true,
                    where: { action_type: 2 },
                    include: [
                        { model: TMappool, as: 'map', attributes: ['id', 'map_id', 'type'] },
                        { model: TPlayer, as: 'player1', attributes: ['id', 'user_id'], include: [{ model: User, as: 'user', attributes: ['user_id', 'osu_uid'] }] },
                        { model: TPlayer, as: 'player2', attributes: ['id', 'user_id'], include: [{ model: User, as: 'user', attributes: ['user_id', 'osu_uid'] }] }
                    ]
                }
            ],
            order: [['id', 'ASC'], [{ model: TGame, as: 'games' }, 'order', 'ASC'], [{ model: TGame, as: 'games' }, 'id', 'ASC']]
        });
        if (LIMIT > 0) matches = matches.slice(0, LIMIT);

        console.log(`${APPLY ? 'Applying' : 'Dry run for'} ${matches.length} MP matches; delay=${DELAY_MS}ms, pageDelay=${PAGE_DELAY_MS}ms.`);
        for (let index = 0; index < matches.length; index++) {
            const match = matches[index];
            if (index > 0 && DELAY_MS > 0) await sleep(DELAY_MS);
            try {
                const upstreamMatch = await fetchMatchWithRetry(match.mp_id);
                summary.matchesFetched++;
                const upstreamGames = buildUpstreamGames(upstreamMatch);
                const usedIds = new Set();
                const updates = [];

                for (const game of match.games) {
                    const { candidate, strategy } = chooseUpstreamGame(game, upstreamGames, usedIds);
                    if (!candidate) {
                        summary.unmatchedGames.push({ gameId: game.id, matchId: match.id, mpId: match.mp_id });
                        continue;
                    }
                    if (candidate.id) usedIds.add(candidate.id);
                    const player1Score = findScore(candidate, getPlayerOsuUid(game.player1), game.player1_score);
                    const player2Score = findScore(candidate, getPlayerOsuUid(game.player2), game.player2_score);
                    const values = {};
                    if (player1Score?.missCount !== null && player1Score?.missCount !== undefined) values.player1_miss_count = player1Score.missCount;
                    if (player2Score?.missCount !== null && player2Score?.missCount !== undefined) values.player2_miss_count = player2Score.missCount;
                    if (!game.mp_game_id && candidate.id) values.mp_game_id = candidate.id;
                    if (!game.played_at && candidate.playedAt) values.played_at = candidate.playedAt;
                    if (Object.keys(values).length === 0) continue;
                    updates.push({ game, values });
                    summary.gamesMatched++;
                    summary.sidesUpdated += Number(values.player1_miss_count !== undefined) + Number(values.player2_miss_count !== undefined);
                    summary.strategies[strategy] = (summary.strategies[strategy] || 0) + 1;
                }

                if (APPLY && updates.length > 0) {
                    await sequelize.transaction(async transaction => {
                        for (const { game, values } of updates) {
                            await TGame.update(values, { where: { id: game.id, match_id: match.id }, transaction });
                        }
                    });
                }
                summary.gamesUpdated += updates.length;
                console.log(`[${index + 1}/${matches.length}] match=${match.id} mp=${match.mp_id} matched=${updates.length}/${match.games.length}`);
            } catch (error) {
                summary.failedMatches.push({ matchId: match.id, message: error.message, mpId: match.mp_id });
                console.error(`[${index + 1}/${matches.length}] match=${match.id} mp=${match.mp_id} failed: ${error.message}`);
            }
        }

        console.log(JSON.stringify(summary, null, 2));
        if (summary.failedMatches.length > 0 || summary.unmatchedGames.length > 0) process.exitCode = 2;
    } finally {
        await sequelize.close();
    }
};

main().catch(error => {
    console.error('Tournament game miss-count backfill failed:', error);
    process.exitCode = 1;
});

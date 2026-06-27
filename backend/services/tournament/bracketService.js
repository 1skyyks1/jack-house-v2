const sequelize = require('../../config/db');
const { Op } = require('sequelize');
const { Tournament, TRound, TMappool, TMatch, TTeam, TPlayer, TGame } = require('../../models/tournament');
const auditService = require('./auditService');

const TEAM_STATUS = {
    APPROVED: 1
};

const BRACKET_SIZE = 32;

const makeError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const ROUND_DEFINITIONS = [
    { key: 'W1', name: 'Winners RO32', bracket_type: 0, bracket_group: 'winner', round_no: 1, match_count: 16, first_to: 5 },
    { key: 'W2', name: 'Winners RO16', bracket_type: 0, bracket_group: 'winner', round_no: 2, match_count: 8, first_to: 5 },
    { key: 'W3', name: 'Winners Quarterfinals', bracket_type: 0, bracket_group: 'winner', round_no: 3, match_count: 4, first_to: 5 },
    { key: 'W4', name: 'Winners Semifinals', bracket_type: 0, bracket_group: 'winner', round_no: 4, match_count: 2, first_to: 7 },
    { key: 'W5', name: 'Winners Finals', bracket_type: 0, bracket_group: 'winner', round_no: 5, match_count: 1, first_to: 7 },
    { key: 'L1', name: 'Losers Round 1', bracket_type: 1, bracket_group: 'loser', round_no: 1, match_count: 8, first_to: 5 },
    { key: 'L2', name: 'Losers Round 2', bracket_type: 1, bracket_group: 'loser', round_no: 2, match_count: 8, first_to: 5 },
    { key: 'L3', name: 'Losers Round 3', bracket_type: 1, bracket_group: 'loser', round_no: 3, match_count: 4, first_to: 5 },
    { key: 'L4', name: 'Losers Round 4', bracket_type: 1, bracket_group: 'loser', round_no: 4, match_count: 4, first_to: 5 },
    { key: 'L5', name: 'Losers Round 5', bracket_type: 1, bracket_group: 'loser', round_no: 5, match_count: 2, first_to: 7 },
    { key: 'L6', name: 'Losers Round 6', bracket_type: 1, bracket_group: 'loser', round_no: 6, match_count: 2, first_to: 7 },
    { key: 'L7', name: 'Losers Semifinals', bracket_type: 1, bracket_group: 'loser', round_no: 7, match_count: 1, first_to: 7 },
    { key: 'L8', name: 'Losers Finals', bracket_type: 1, bracket_group: 'loser', round_no: 8, match_count: 1, first_to: 7 },
    { key: 'GF', name: 'Grand Finals', bracket_type: 2, bracket_group: 'grand_final', round_no: 1, match_count: 1, first_to: 7 },
    { key: 'GFR', name: 'Grand Finals Reset', bracket_type: 3, bracket_group: 'reset_final', round_no: 1, match_count: 1, first_to: 7, hidden: true }
];

const ensureTournament = async (tid) => {
    const tournament = await Tournament.findByPk(tid);
    if (!tournament) {
        throw makeError('赛事不存在', 404);
    }
    return tournament;
};

const isMainStageEligible = (team) => {
    if (!Array.isArray(team.players) || team.players.length === 0) return false;
    return team.players.some(player => player.review_status !== 'review_failed');
};

const getQualifiedTeams = async (tid, limit) => {
    const teams = await TTeam.findAll({
        where: {
            t_id: tid,
            status: TEAM_STATUS.APPROVED
        },
        include: [{ model: TPlayer, as: 'players' }],
        order: [['qual_rank', 'ASC'], ['qual_score', 'DESC'], ['id', 'ASC']]
    });

    return teams
        .filter(team => team.qual_rank !== null && team.qual_rank !== undefined)
        .filter(isMainStageEligible)
        .slice(0, limit);
};

const createRounds = async (tid, transaction) => {
    const roundByKey = new Map();
    for (let i = 0; i < ROUND_DEFINITIONS.length; i++) {
        const def = ROUND_DEFINITIONS[i];
        const round = await TRound.create({
            t_id: tid,
            name: def.name,
            bracket_type: def.bracket_type,
            first_to: def.first_to,
            order: i + 1
        }, { transaction });
        roundByKey.set(def.key, round);
    }
    return roundByKey;
};

const createMatch = async (roundByKey, roundKey, slotNo, payload, transaction) => {
    const def = ROUND_DEFINITIONS.find(item => item.key === roundKey);
    const round = roundByKey.get(roundKey);
    return TMatch.create({
        round_id: round.id,
        team1_id: payload.team1_id || null,
        team2_id: payload.team2_id || null,
        scheduled_time: payload.scheduled_time || new Date(),
        status: payload.status || 0,
        winner_id: payload.winner_id || null,
        is_possible: payload.is_possible || 0,
        bracket_group: def.bracket_group,
        round_no: def.round_no,
        slot_no: slotNo,
        source_match_1_id: payload.source_match_1_id || null,
        source_match_1_result: payload.source_match_1_result || null,
        source_match_2_id: payload.source_match_2_id || null,
        source_match_2_result: payload.source_match_2_result || null,
        hidden_until_match_id: payload.hidden_until_match_id || null
    }, { transaction });
};

const createWinnerBracket = async (roundByKey, teams, transaction) => {
    const matchesByRound = new Map();

    const w1 = [];
    for (let i = 0; i < BRACKET_SIZE / 2; i++) {
        const seed1 = i + 1;
        const seed2 = BRACKET_SIZE - i;
        const team1 = teams[seed1 - 1];
        const team2 = teams[seed2 - 1];
        const match = await createMatch(roundByKey, 'W1', i + 1, {
            team1_id: team1.id,
            team2_id: team2.id
        }, transaction);
        w1.push(match);
    }
    matchesByRound.set('W1', w1);

    for (let roundNo = 2; roundNo <= 5; roundNo++) {
        const key = `W${roundNo}`;
        const previous = matchesByRound.get(`W${roundNo - 1}`);
        const current = [];
        for (let i = 0; i < previous.length; i += 2) {
            const match = await createMatch(roundByKey, key, current.length + 1, {
                source_match_1_id: previous[i].id,
                source_match_1_result: 'winner',
                source_match_2_id: previous[i + 1].id,
                source_match_2_result: 'winner'
            }, transaction);
            current.push(match);
        }
        matchesByRound.set(key, current);
    }

    return matchesByRound;
};

const createLoserBracket = async (roundByKey, winnerRounds, transaction) => {
    const loserRounds = new Map();
    const w1 = winnerRounds.get('W1');
    const w2 = winnerRounds.get('W2');
    const w3 = winnerRounds.get('W3');
    const w4 = winnerRounds.get('W4');
    const w5 = winnerRounds.get('W5');

    const l1 = [];
    for (let i = 0; i < 8; i++) {
        l1.push(await createMatch(roundByKey, 'L1', i + 1, {
            source_match_1_id: w1[i * 2].id,
            source_match_1_result: 'loser',
            source_match_2_id: w1[i * 2 + 1].id,
            source_match_2_result: 'loser'
        }, transaction));
    }
    loserRounds.set('L1', l1);

    const l2 = [];
    for (let i = 0; i < 8; i++) {
        l2.push(await createMatch(roundByKey, 'L2', i + 1, {
            source_match_1_id: l1[i].id,
            source_match_1_result: 'winner',
            source_match_2_id: w2[i].id,
            source_match_2_result: 'loser'
        }, transaction));
    }
    loserRounds.set('L2', l2);

    const l3 = [];
    for (let i = 0; i < 4; i++) {
        l3.push(await createMatch(roundByKey, 'L3', i + 1, {
            source_match_1_id: l2[i * 2].id,
            source_match_1_result: 'winner',
            source_match_2_id: l2[i * 2 + 1].id,
            source_match_2_result: 'winner'
        }, transaction));
    }
    loserRounds.set('L3', l3);

    const l4 = [];
    for (let i = 0; i < 4; i++) {
        l4.push(await createMatch(roundByKey, 'L4', i + 1, {
            source_match_1_id: l3[i].id,
            source_match_1_result: 'winner',
            source_match_2_id: w3[i].id,
            source_match_2_result: 'loser'
        }, transaction));
    }
    loserRounds.set('L4', l4);

    const l5 = [];
    for (let i = 0; i < 2; i++) {
        l5.push(await createMatch(roundByKey, 'L5', i + 1, {
            source_match_1_id: l4[i * 2].id,
            source_match_1_result: 'winner',
            source_match_2_id: l4[i * 2 + 1].id,
            source_match_2_result: 'winner'
        }, transaction));
    }
    loserRounds.set('L5', l5);

    const l6 = [];
    for (let i = 0; i < 2; i++) {
        l6.push(await createMatch(roundByKey, 'L6', i + 1, {
            source_match_1_id: l5[i].id,
            source_match_1_result: 'winner',
            source_match_2_id: w4[i].id,
            source_match_2_result: 'loser'
        }, transaction));
    }
    loserRounds.set('L6', l6);

    const l7 = [await createMatch(roundByKey, 'L7', 1, {
        source_match_1_id: l6[0].id,
        source_match_1_result: 'winner',
        source_match_2_id: l6[1].id,
        source_match_2_result: 'winner'
    }, transaction)];
    loserRounds.set('L7', l7);

    const l8 = [await createMatch(roundByKey, 'L8', 1, {
        source_match_1_id: l7[0].id,
        source_match_1_result: 'winner',
        source_match_2_id: w5[0].id,
        source_match_2_result: 'loser'
    }, transaction)];
    loserRounds.set('L8', l8);

    return loserRounds;
};

const createFinals = async (roundByKey, winnerRounds, loserRounds, transaction) => {
    const wf = winnerRounds.get('W5')[0];
    const lf = loserRounds.get('L8')[0];
    const gf = await createMatch(roundByKey, 'GF', 1, {
        source_match_1_id: wf.id,
        source_match_1_result: 'winner',
        source_match_2_id: lf.id,
        source_match_2_result: 'winner'
    }, transaction);

    const reset = await createMatch(roundByKey, 'GFR', 1, {
        source_match_1_id: gf.id,
        source_match_1_result: 'winner',
        source_match_2_id: gf.id,
        source_match_2_result: 'loser',
        hidden_until_match_id: gf.id,
        is_possible: 1
    }, transaction);

    return { gf, reset };
};

const getMatchLoserId = (match) => {
    if (!match.winner_id) return null;
    if (Number(match.winner_id) === Number(match.team1_id)) return match.team2_id || null;
    if (Number(match.winner_id) === Number(match.team2_id)) return match.team1_id || null;
    return null;
};

const getSourceTeamId = (sourceMatch, sourceResult) => {
    if (sourceResult === 'winner') return sourceMatch.winner_id || null;
    if (sourceResult === 'loser') return getMatchLoserId(sourceMatch);
    return null;
};

const ensureTargetCanChange = (targetMatch, field, nextTeamId) => {
    const currentTeamId = targetMatch[field];
    if (!currentTeamId || Number(currentTeamId) === Number(nextTeamId)) return;

    const hasStarted = targetMatch.status !== 0 ||
        targetMatch.winner_id ||
        targetMatch.team1_score > 0 ||
        targetMatch.team2_score > 0;

    if (hasStarted) {
        throw makeError('后续比赛已有结果，无法自动覆盖对阵，请先人工处理后续比赛');
    }
};

const shouldActivateResetFinal = (sourceMatch, targetMatch) => {
    if (targetMatch.bracket_group !== 'reset_final') return true;
    if (sourceMatch.bracket_group !== 'grand_final') return false;
    return Number(sourceMatch.winner_id) === Number(sourceMatch.team2_id);
};

const applySourceToTarget = async (sourceMatch, targetMatch, sourceIndex, transaction) => {
    if (!shouldActivateResetFinal(sourceMatch, targetMatch)) {
        return false;
    }

    const resultField = sourceIndex === 1 ? 'source_match_1_result' : 'source_match_2_result';
    const teamField = sourceIndex === 1 ? 'team1_id' : 'team2_id';
    const nextTeamId = getSourceTeamId(sourceMatch, targetMatch[resultField]);
    if (!nextTeamId) return false;

    ensureTargetCanChange(targetMatch, teamField, nextTeamId);

    if (Number(targetMatch[teamField]) === Number(nextTeamId)) {
        return false;
    }

    targetMatch[teamField] = nextTeamId;
    if (targetMatch.bracket_group === 'reset_final') {
        targetMatch.is_possible = 0;
    }
    await targetMatch.save({ transaction });
    return true;
};

const propagateMatchResult = async (matchId, operatorId, options = {}) => {
    const externalTransaction = options.transaction;
    const run = async (transaction) => {
        const sourceMatch = await TMatch.findByPk(matchId, {
            include: [{ model: TRound, as: 'round' }],
            transaction
        });
        if (!sourceMatch) {
            throw makeError('比赛不存在', 404);
        }
        if (sourceMatch.status !== 2 || !sourceMatch.winner_id) {
            return { updated: 0, targets: [] };
        }

        const targetMatches = await TMatch.findAll({
            where: {
                [Op.or]: [
                    { source_match_1_id: sourceMatch.id },
                    { source_match_2_id: sourceMatch.id }
                ]
            },
            transaction
        });

        const targets = [];
        for (const targetMatch of targetMatches) {
            let changed = false;
            if (Number(targetMatch.source_match_1_id) === Number(sourceMatch.id)) {
                changed = await applySourceToTarget(sourceMatch, targetMatch, 1, transaction) || changed;
            }
            if (Number(targetMatch.source_match_2_id) === Number(sourceMatch.id)) {
                changed = await applySourceToTarget(sourceMatch, targetMatch, 2, transaction) || changed;
            }
            if (changed) {
                targets.push({
                    match_id: targetMatch.id,
                    team1_id: targetMatch.team1_id,
                    team2_id: targetMatch.team2_id
                });
            }
        }

        if (targets.length > 0) {
            await auditService.writeAuditLog({
                t_id: sourceMatch.round?.t_id,
                entity_type: 'bracket',
                entity_id: sourceMatch.id,
                action: 'propagate_match_result',
                old_value: null,
                new_value: {
                    source_match_id: sourceMatch.id,
                    winner_id: sourceMatch.winner_id,
                    loser_id: getMatchLoserId(sourceMatch),
                    targets
                },
                operator_id: operatorId
            }, { transaction });
        }

        return { updated: targets.length, targets };
    };

    if (externalTransaction) {
        return run(externalTransaction);
    }
    return sequelize.transaction(run);
};

const clearExistingBracket = async (tid, transaction) => {
    const rounds = await TRound.findAll({ where: { t_id: tid }, transaction });
    const roundIds = rounds.map(round => round.id);
    if (roundIds.length === 0) return { roundCount: 0, matchCount: 0 };

    const matches = await TMatch.findAll({ where: { round_id: roundIds }, transaction });
    const matchIds = matches.map(match => match.id);
    if (matchIds.length > 0) {
        await TGame.destroy({ where: { match_id: matchIds }, transaction });
        await TMatch.destroy({ where: { id: matchIds }, transaction });
    }
    await TMappool.destroy({ where: { round_id: roundIds }, transaction });
    await TRound.destroy({ where: { id: roundIds }, transaction });
    return { roundCount: roundIds.length, matchCount: matchIds.length };
};

const generateDoubleEliminationBracket = async (tid, operatorId, options = {}) => {
    const tournament = await ensureTournament(tid);
    if (!tournament.qual_locked_at) {
        throw makeError('请先锁定资格赛排名，再生成正赛对阵');
    }

    const limit = Number(options.size || tournament.qual_locked_top_n || tournament.qual_top_n || BRACKET_SIZE);
    if (limit !== BRACKET_SIZE) {
        throw makeError('首期正赛仅支持 32 强');
    }

    const teams = await getQualifiedTeams(tid, BRACKET_SIZE);
    if (teams.length < BRACKET_SIZE) {
        throw makeError(`正赛需要 ${BRACKET_SIZE} 支通过资格的队伍，当前只有 ${teams.length} 支`);
    }

    return sequelize.transaction(async (transaction) => {
        const cleared = await clearExistingBracket(tid, transaction);
        const roundByKey = await createRounds(tid, transaction);
        const winnerRounds = await createWinnerBracket(roundByKey, teams, transaction);
        const loserRounds = await createLoserBracket(roundByKey, winnerRounds, transaction);
        const finals = await createFinals(roundByKey, winnerRounds, loserRounds, transaction);

        const rounds = await TRound.findAll({
            where: { t_id: tid },
            order: [['order', 'ASC']],
            transaction
        });
        const matches = await TMatch.findAll({
            include: [{ model: TRound, as: 'round', where: { t_id: tid } }],
            order: [[{ model: TRound, as: 'round' }, 'order', 'ASC'], ['slot_no', 'ASC']],
            transaction
        });

        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'bracket',
            entity_id: null,
            action: 'generate_double_elimination',
            old_value: cleared,
            new_value: {
                size: BRACKET_SIZE,
                round_count: rounds.length,
                match_count: matches.length,
                seed_team_ids: teams.map(team => team.id),
                grand_final_match_id: finals.gf.id,
                reset_final_match_id: finals.reset.id
            },
            operator_id: operatorId
        }, { transaction });

        return {
            message: '32 强双败对阵生成完成',
            rounds,
            matches
        };
    });
};

module.exports = {
    BRACKET_SIZE,
    ROUND_DEFINITIONS,
    generateDoubleEliminationBracket,
    propagateMatchResult
};

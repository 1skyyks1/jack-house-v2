const { TMatch, TGame, TMappool, TRound, TTeam, TPlayer } = require('../../models/tournament');
const User = require('../../models/user/user');
const osu = require('osu-api-v2-js');
const bracketService = require('../../services/tournament/bracketService');
const refereeActionService = require('../../services/tournament/refereeActionService');
const auditService = require('../../services/tournament/auditService');
const roundStageService = require('../../services/tournament/roundStageService');
const { translateMessage } = require('../../utils/tournamentI18n');

const CLIENT_ID = Number(process.env.OSU_CLIENT_ID);
const CLIENT_SECRET = process.env.OSU_CLIENT_SECRET;

const isMatchInTournament = (match, tid) => Number(match?.round?.t_id) === Number(tid);

// 获取裁判工作台数据
exports.getRefereeData = async (req, res) => {
    try {
        const { tid, matchId } = req.params;

        const match = await TMatch.findByPk(matchId, {
            include: [
                {
                    model: TRound,
                    as: 'round',
                    include: [{ model: TMappool, as: 'mappool', order: [['created_time', 'ASC'], ['id', 'ASC']] }]
                },
                {
                    model: TTeam,
                    as: 'team1',
                    include: [{ model: TPlayer, as: 'players', include: [{ model: User, as: 'user', attributes: ['user_id', 'user_name', 'osu_uid', 'discord'] }] }]
                },
                {
                    model: TTeam,
                    as: 'team2',
                    include: [{ model: TPlayer, as: 'players', include: [{ model: User, as: 'user', attributes: ['user_id', 'user_name', 'osu_uid', 'discord'] }] }]
                },
                {
                    model: TGame,
                    as: 'games',
                    include: [{ model: TMappool, as: 'map' }]
                }
            ],
            order: [[{ model: TGame, as: 'games' }, 'order', 'ASC'], [{ model: TGame, as: 'games' }, 'id', 'ASC']]
        });

        if (!match) {
            return res.status(404).json({ message: req.t('tournament.errors.matchNotFound') });
        }
        if (!isMatchInTournament(match, tid)) {
            return res.status(404).json({ message: req.t('tournament.errors.matchNotFound') });
        }
        const { maps } = await roundStageService.listStageMappool(tid, match.round.id);
        match.round.setDataValue('mappool', maps);

        const actions = await refereeActionService.listActions(matchId, tid);
        const usedMaps = refereeActionService.buildUsedMaps(actions, match);

        // 生成房间名
        const roomName = `${req.tournament?.acronym || match.round.name}: (${getTeamName(match.team1)}) vs (${getTeamName(match.team2)})`;

        res.json({
            match,
            actions,
            usedMaps,
            roomName,
            commands: generateCommands(match, actions, req.tournament?.acronym)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: req.t('common.serverError') });
    }
};

function getTeamName(team) {
    return team?.display_name || team?.name || 'TBD';
}

function getPlayers(match) {
    return [
        ...(match.team1?.players || []),
        ...(match.team2?.players || [])
    ];
}

function getOsuName(player) {
    return player?.user?.user_name || player?.user_name_snapshot || null;
}

function formatDiscordMention(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return null;
    if (normalized.startsWith('@') || normalized.startsWith('<@')) return normalized;
    return `@${normalized}`;
}

function getDiscordMention(player) {
    return formatDiscordMention(player?.contact_discord || player?.user?.discord || getOsuName(player));
}

function getOtherTeamId(match, teamId) {
    if (Number(teamId) === Number(match.team1_id)) return match.team2_id;
    if (Number(teamId) === Number(match.team2_id)) return match.team1_id;
    return null;
}

function getTeamNameById(match, teamId) {
    if (Number(teamId) === Number(match.team1_id)) return getTeamName(match.team1);
    if (Number(teamId) === Number(match.team2_id)) return getTeamName(match.team2);
    return 'TBD';
}

function getNextAction(match, actions) {
    const rollWinnerTeamId = match.roll_winner_id;
    const otherTeamId = getOtherTeamId(match, rollWinnerTeamId);
    const protectedCount = actions.filter(action => action.action_type === 'protect').length;
    const bannedCount = actions.filter(action => action.action_type === 'ban').length;
    const pickedActions = actions.filter(action => action.action_type === 'pick');

    if (!rollWinnerTeamId || !otherTeamId) return null;
    if (protectedCount === 0) return { actionType: 'Protect', teamId: rollWinnerTeamId };
    if (protectedCount === 1) return { actionType: 'Protect', teamId: otherTeamId };
    if (bannedCount === 0) return { actionType: 'Ban', teamId: otherTeamId };
    if (bannedCount === 1) return { actionType: 'Ban', teamId: rollWinnerTeamId };
    if (pickedActions.length === 0) return { actionType: 'Pick', teamId: rollWinnerTeamId };
    if (pickedActions.length === 1) return { actionType: 'Pick', teamId: otherTeamId };

    const lastPick = pickedActions[pickedActions.length - 1];
    const nextTeamId = Number(lastPick.team_id) === Number(rollWinnerTeamId) ? otherTeamId : rollWinnerTeamId;
    return { actionType: 'Pick', teamId: nextTeamId };
}

function generateScoreReport(match, actions) {
    const team1Name = getTeamName(match.team1);
    const team2Name = getTeamName(match.team2);
    const team1Score = match.team1_score ?? 0;
    const team2Score = match.team2_score ?? 0;
    const firstTo = Math.max(1, Number(match.round?.first_to || 1));
    const isTiebreaker = team1Score === team2Score && team1Score === firstTo - 1;

    if (isTiebreaker) {
        return `${team1Name} | ${team1Score} - ${team2Score} | ${team2Name} // We're going to Tiebreaker!`;
    }

    const winnerName = team1Score >= firstTo
        ? team1Name
        : team2Score >= firstTo
            ? team2Name
            : null;

    if (winnerName) {
        return `${team1Name} | ${team1Score} - ${team2Score} | ${team2Name} // ${winnerName} wins! GG`;
    }

    const nextAction = getNextAction(match, actions);
    if (!nextAction) return null;

    const bestOf = Math.max(1, Number(match.round?.first_to || 1) * 2 - 1);
    const nextTeamName = getTeamNameById(match, nextAction.teamId);

    return `${team1Name} | ${team1Score} - ${team2Score} | ${team2Name} // Best of ${bestOf} - ${nextAction.actionType}: ${nextTeamName}`;
}

// 生成裁判指令
function generateCommands(match, actions, tournamentAcronym) {
    const team1Name = getTeamName(match.team1);
    const team2Name = getTeamName(match.team2);
    const acronym = tournamentAcronym || match.round?.name || 'Tournament';
    const roundName = match.round?.name || acronym;
    const createRoomName = `${acronym}: (${team1Name}) vs (${team2Name})`;
    const roundTitle = `${roundName}: (${team1Name}) vs (${team2Name})`;
    const players = getPlayers(match);
    const invite = players
        .map(player => getOsuName(player))
        .filter(Boolean)
        .map(name => `!mp invite ${name}`);
    const mentions = players
        .map(player => getDiscordMention(player))
        .filter(Boolean)
        .join(' ');

    if (!match.mp_id) {
        return {
            createRoom: `!mp make ${createRoomName}`,
            settings: '!mp set 2 3 5',
            invite,
            notify: `${mentions ? `${mentions} ` : ''}**${roundTitle}** is in 15, invites in 10!`
        };
    }

    const scoreReport = match.roll_winner_id ? generateScoreReport(match, actions) : null;

    return {
        ...(scoreReport ? { scoreReport } : {}),
        settings: '!mp set 2 3 5',
        timer: '!mp timer 150',
        start: '!mp start 10',
        abort: '!mp abort',
        close: '!mp close',
        ...(!match.roll_winner_id ? { rollMessage: '请双方队长 Roll，裁判确认 Roll 胜方' } : {})
    };
}

// 记录 Roll 胜方
exports.recordRoll = async (req, res) => {
    try {
        const { tid, matchId } = req.params;
        const { winner_team_id } = req.body;

        const match = await TMatch.findByPk(matchId, {
            include: [{ model: TRound, as: 'round' }]
        });
        if (!match || !isMatchInTournament(match, tid)) {
            return res.status(404).json({ message: req.t('tournament.errors.matchNotFound') });
        }

        const winnerTeamId = Number(winner_team_id);
        if (winnerTeamId !== Number(match.team1_id) && winnerTeamId !== Number(match.team2_id)) {
            return res.status(400).json({ message: req.t('tournament.errors.invalidRoll') });
        }

        const oldValue = auditService.pickModelValues(match, ['id', 'roll_winner_id', 'status']);
        match.roll_winner_id = winnerTeamId;
        match.status = 1; // 进行中
        await match.save();

        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'match',
            entity_id: match.id,
            action: 'record_roll',
            old_value: oldValue,
            new_value: auditService.pickModelValues(match, ['id', 'roll_winner_id', 'status']),
            operator_id: req.user?.user_id
        });

        res.json({
            message: req.t('tournament.messages.rollRecorded'),
            roll_winner_id: winnerTeamId
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: req.t('common.serverError') });
    }
};

// 记录 Protect/Ban/Pick
exports.recordAction = async (req, res) => {
    try {
        const { tid, matchId } = req.params;
        const action = await refereeActionService.createAction(matchId, req.body, req.user?.user_id, tid);
        res.json({ message: req.t('tournament.messages.actionRecorded'), action, game: action });
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ message: error.status ? translateMessage(req, error.message) : req.t('common.serverError') });
    }
};

// 修改 Protect/Ban/Pick
exports.updateAction = async (req, res) => {
    try {
        const { tid, matchId, actionId } = req.params;
        const action = await refereeActionService.updateAction(matchId, actionId, req.body, req.user?.user_id, tid);
        res.json({ message: req.t('tournament.messages.actionUpdated'), action });
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ message: error.status ? translateMessage(req, error.message) : req.t('common.serverError') });
    }
};

// 记录技术暂停
exports.recordTimeout = async (req, res) => {
    try {
        const { tid, matchId } = req.params;
        const { team } = req.body; // 1 or 2

        const match = await TMatch.findByPk(matchId, {
            include: [{ model: TRound, as: 'round' }]
        });
        if (!match || !isMatchInTournament(match, tid)) {
            return res.status(404).json({ message: req.t('tournament.errors.matchNotFound') });
        }

        const oldValue = auditService.pickModelValues(match, ['id', 'team1_timeout_used', 'team2_timeout_used']);
        if (team === 1) {
            if (match.team1_timeout_used) {
                return res.status(400).json({ message: req.t('tournament.errors.team1TimeoutUsed') });
            }
            match.team1_timeout_used = 1;
        } else {
            if (match.team2_timeout_used) {
                return res.status(400).json({ message: req.t('tournament.errors.team2TimeoutUsed') });
            }
            match.team2_timeout_used = 1;
        }

        await match.save();
        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'match',
            entity_id: match.id,
            action: 'record_timeout',
            old_value: oldValue,
            new_value: {
                ...auditService.pickModelValues(match, ['id', 'team1_timeout_used', 'team2_timeout_used']),
                team
            },
            operator_id: req.user?.user_id
        });
        res.json({ message: req.t('tournament.messages.timeoutRecorded') });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: req.t('common.serverError') });
    }
};

// 更新单局比分（手动输入）
exports.updateGameScore = async (req, res) => {
    try {
        const { tid, matchId, gameId } = req.params;
        const { player1_id, player2_id, player1_score, player2_score } = req.body;

        const matchForTournament = await TMatch.findByPk(matchId, {
            include: [{ model: TRound, as: 'round' }]
        });
        if (!matchForTournament || !isMatchInTournament(matchForTournament, tid)) {
            return res.status(404).json({ message: req.t('tournament.errors.matchNotFound') });
        }

        const game = await TGame.findOne({ where: { id: gameId, match_id: matchId } });
        if (!game) {
            return res.status(404).json({ message: req.t('tournament.errors.gameNotFound') });
        }

        const oldGameValue = auditService.pickModelValues(game);
        const oldMatchValue = auditService.pickModelValues(matchForTournament, ['id', 'team1_score', 'team2_score', 'winner_id', 'status']);

        game.player1_id = player1_id || game.player1_id;
        game.player2_id = player2_id || game.player2_id;
        game.player1_score = player1_score;
        game.player2_score = player2_score;
        game.winner_team = player1_score > player2_score ? 1 : 2;

        await game.save();

        // 更新比赛总分
        const match = await TMatch.findByPk(matchId, {
            include: [
                { model: TGame, as: 'games', where: { action_type: 2 } }, // 只计算 pick 的局
                { model: TRound, as: 'round' }
            ]
        });

        if (match) {
            let t1 = 0, t2 = 0;
            for (const g of match.games || []) {
                if (g.winner_team === 1) t1++;
                else if (g.winner_team === 2) t2++;
            }
            match.team1_score = t1;
            match.team2_score = t2;

            // 检查是否结束
            const firstTo = roundStageService.getRoundFirstTo(match.round);
            if (t1 >= firstTo) {
                match.winner_id = match.team1_id;
                match.status = 2;
            } else if (t2 >= firstTo) {
                match.winner_id = match.team2_id;
                match.status = 2;
            }

            await match.save();
            if (match.status === 2 && match.winner_id) {
                await bracketService.propagateMatchResult(match.id, req.user?.user_id);
            }

            await auditService.writeAuditLog({
                t_id: tid,
                entity_type: 'game',
                entity_id: game.id,
                action: 'manual_score_update',
                old_value: {
                    game: oldGameValue,
                    match: oldMatchValue
                },
                new_value: {
                    game: auditService.pickModelValues(game),
                    match: auditService.pickModelValues(match, ['id', 'team1_score', 'team2_score', 'winner_id', 'status'])
                },
                operator_id: req.user?.user_id
            });
        }

        res.json({ message: req.t('tournament.messages.scoreUpdated'), game });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: req.t('common.serverError') });
    }
};

// 撤销上一步操作
exports.undoLastAction = async (req, res) => {
    try {
        res.status(400).json({ message: req.t('tournament.errors.undoUnsupported') });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: req.t('common.serverError') });
    }
};

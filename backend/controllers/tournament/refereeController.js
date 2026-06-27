const { TMatch, TGame, TMappool, TRound, TTeam, TPlayer } = require('../../models/tournament');
const User = require('../../models/user/user');
const osu = require('osu-api-v2-js');
const bracketService = require('../../services/tournament/bracketService');
const refereeActionService = require('../../services/tournament/refereeActionService');
const auditService = require('../../services/tournament/auditService');
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
                    include: [{ model: TMappool, as: 'mappool', order: [['type', 'ASC'], ['id', 'ASC']] }]
                },
                {
                    model: TTeam,
                    as: 'team1',
                    include: [{ model: TPlayer, as: 'players', include: [{ model: User, as: 'user', attributes: ['user_id', 'user_name', 'osu_uid'] }] }]
                },
                {
                    model: TTeam,
                    as: 'team2',
                    include: [{ model: TPlayer, as: 'players', include: [{ model: User, as: 'user', attributes: ['user_id', 'user_name', 'osu_uid'] }] }]
                },
                {
                    model: TGame,
                    as: 'games',
                    order: [['order', 'ASC']],
                    include: [{ model: TMappool, as: 'map' }]
                }
            ]
        });

        if (!match) {
            return res.status(404).json({ message: req.t('tournament.errors.matchNotFound') });
        }
        if (!isMatchInTournament(match, tid)) {
            return res.status(404).json({ message: req.t('tournament.errors.matchNotFound') });
        }

        const actions = await refereeActionService.listActions(matchId, tid);
        const usedMaps = refereeActionService.buildUsedMaps(actions, match);

        // 生成房间名
        const roomName = `${match.round.name}: (${match.team1.display_name}) vs (${match.team2.display_name})`;

        res.json({
            match,
            actions,
            usedMaps,
            roomName,
            commands: generateCommands(match, roomName)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: req.t('common.serverError') });
    }
};

// 生成裁判指令
function generateCommands(match, roomName) {
    return {
        createRoom: `!mp make ${roomName}`,
        invite: [
            ...(match.team1?.players?.map(p => `!mp invite ${p.user?.user_name}`) || []),
            ...(match.team2?.players?.map(p => `!mp invite ${p.user?.user_name}`) || [])
        ],
        settings: '!mp set 3 0 1',  // Team VS, ScoreV2
        timer: '!mp timer 150',
        start: '!mp start 10',
        abort: '!mp abort',
        close: '!mp close',
        rollMessage: '请双方队长 Roll 点，高 Roll 先 Protect'
    };
}

// 记录 Roll 点
exports.recordRoll = async (req, res) => {
    try {
        const { tid, matchId } = req.params;
        const { team1_roll, team2_roll } = req.body;

        const match = await TMatch.findByPk(matchId, {
            include: [{ model: TRound, as: 'round' }]
        });
        if (!match || !isMatchInTournament(match, tid)) {
            return res.status(404).json({ message: req.t('tournament.errors.matchNotFound') });
        }

        const oldValue = auditService.pickModelValues(match, ['id', 'team1_roll', 'team2_roll', 'status']);
        match.team1_roll = team1_roll;
        match.team2_roll = team2_roll;
        match.status = 1; // 进行中
        await match.save();

        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'match',
            entity_id: match.id,
            action: 'record_roll',
            old_value: oldValue,
            new_value: auditService.pickModelValues(match, ['id', 'team1_roll', 'team2_roll', 'status']),
            operator_id: req.user?.user_id
        });

        res.json({
            message: req.t('tournament.messages.rollRecorded'),
            team1_roll,
            team2_roll,
            highRoll: team1_roll > team2_roll ? 1 : 2
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
            if (t1 >= match.round.first_to) {
                match.winner_id = match.team1_id;
                match.status = 2;
            } else if (t2 >= match.round.first_to) {
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

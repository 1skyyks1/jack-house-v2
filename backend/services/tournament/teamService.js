const crypto = require('crypto');
const { Op } = require('sequelize');
const sequelize = require('../../config/db');
const { TTeam, TPlayer, TStaff, Tournament } = require('../../models/tournament');
const User = require('../../models/user/user');
const auditService = require('./auditService');

const TEAM_STATUS = {
    CREATED: 0,
    APPROVED: 1,
    SUBMITTED: 2,
    LOCKED: 3
};

const makeError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const generateInviteCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(crypto.randomInt(chars.length));
    }
    return code;
};

const buildPlayerSnapshot = (user) => ({
    user_name_snapshot: user.user_name,
    avatar_snapshot: user.avatar,
    contact_qq: user.qq,
    contact_discord: user.discord,
    timezone: user.timezone || null,
    review_status: 'review_pending'
});

const ensureTournament = async (tid) => {
    const tournament = await Tournament.findByPk(tid);
    if (!tournament) {
        throw makeError('赛事不存在', 404);
    }
    return tournament;
};

const ensureRegistrationOpen = (tournament) => {
    const now = new Date();
    if (now < new Date(tournament.reg_start) || now > new Date(tournament.reg_end)) {
        throw makeError('不在报名时间内');
    }
};

const ensureUserCanRegister = async (tid, userId) => {
    const existingPlayer = await TPlayer.findOne({ where: { t_id: tid, user_id: userId } });
    if (existingPlayer) {
        throw makeError('你已经在一支队伍中');
    }

    const existingStaff = await TStaff.findOne({ where: { t_id: tid, user_id: userId } });
    if (existingStaff) {
        throw makeError('赛事 staff 不能报名参赛，请先由 host 手动处理 staff 记录');
    }
};

const findPlayerInTournament = async (tid, userId) => {
    return TPlayer.findOne({
        where: { t_id: tid, user_id },
        include: [{ model: TTeam, as: 'team' }]
    });
};

const isTournamentStaff = async (tid, userId) => {
    const user = await User.findByPk(userId, { attributes: ['user_id', 'role'] });
    if (user && user.role === 2) return true;

    const staff = await TStaff.findOne({ where: { t_id: tid, user_id: userId } });
    return Boolean(staff);
};

const isTournamentHost = async (tid, userId) => {
    const user = await User.findByPk(userId, { attributes: ['user_id', 'role'] });
    if (user && user.role === 2) return true;

    const host = await TStaff.findOne({ where: { t_id: tid, user_id: userId, role: 'host' } });
    return Boolean(host);
};

const ensureUser = async (userId) => {
    const user = await User.findByPk(userId, {
        attributes: ['user_id', 'user_name', 'avatar', 'osu_uid', 'qq', 'discord']
    });
    if (!user) {
        throw makeError('用户不存在', 404);
    }
    if (!user.osu_uid) {
        throw makeError('请先绑定 osu 账号');
    }
    return user;
};

const ensureTeamMutableByPlayer = (team) => {
    if (team.status === TEAM_STATUS.SUBMITTED || team.status === TEAM_STATUS.APPROVED || team.status === TEAM_STATUS.LOCKED || team.locked_at) {
        throw makeError('队伍已锁定，无法修改成员');
    }
};

const isTeamCaptain = (team, userId) => {
    return team.captain_id === userId || team.players?.some(p => Number(p.id) === Number(team.captain_player_id) && Number(p.user_id) === Number(userId));
};

const listTeams = async (tid) => {
    await ensureTournament(tid);
    return TTeam.findAll({
        where: { t_id: tid },
        attributes: { exclude: ['invite_code'] },
        include: [
            { model: User, as: 'captain', attributes: ['user_id', 'user_name', 'avatar', 'osu_uid'] },
            { model: TPlayer, as: 'players', include: [{ model: User, as: 'user', attributes: ['user_id', 'user_name', 'avatar', 'osu_uid'] }] }
        ],
        order: [['qual_rank', 'ASC'], ['created_time', 'ASC']]
    });
};

const createTeam = async (tid, userId, body) => {
    const tournament = await ensureTournament(tid);
    ensureRegistrationOpen(tournament);
    await ensureUserCanRegister(tid, userId);
    const user = await ensureUser(userId);

    const name = String(body.name || '').trim();
    if (!name) {
        throw makeError('队伍名称不能为空');
    }

    const isOpen = body.is_open === true || body.is_open === 1 || body.is_open === '1';
    const inviteCode = isOpen ? null : generateInviteCode();

    return sequelize.transaction(async (transaction) => {
        const team = await TTeam.create({
            t_id: tid,
            name,
            display_name: body.display_name || name,
            avatar: body.avatar || null,
            is_open: isOpen ? 1 : 0,
            invite_code: inviteCode,
            captain_id: userId,
            status: TEAM_STATUS.CREATED
        }, { transaction });

        const captainPlayer = await TPlayer.create({
            team_id: team.id,
            t_id: tid,
            user_id: userId,
            is_captain: 1,
            ...buildPlayerSnapshot(user)
        }, { transaction });

        team.captain_player_id = captainPlayer.id;
        await team.save({ transaction });

        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'team',
            entity_id: team.id,
            action: 'create',
            old_value: null,
            new_value: {
                team: auditService.pickModelValues(team),
                player: auditService.pickModelValues(captainPlayer)
            },
            operator_id: userId
        }, { transaction });

        return team;
    });
};

const submitTeam = async (tid, userId, teamId) => {
    const tournament = await ensureTournament(tid);
    ensureRegistrationOpen(tournament);

    const team = await TTeam.findOne({
        where: { id: teamId, t_id: tid },
        include: [{ model: TPlayer, as: 'players' }]
    });
    if (!team) {
        throw makeError('队伍不存在', 404);
    }
    ensureTeamMutableByPlayer(team);

    const isCaptain = team.captain_id === userId || team.captain_player_id && team.players.some(p => p.id === team.captain_player_id && p.user_id === userId);
    if (!isCaptain) {
        throw makeError('只有队长可以提交队伍');
    }

    if (team.players.length < tournament.team_size_min || team.players.length > tournament.team_size_max) {
        throw makeError('队伍人数不符合赛事要求');
    }

    const oldValue = auditService.pickModelValues(team, ['id', 'status', 'locked_at']);
    team.status = TEAM_STATUS.SUBMITTED;
    await team.save();
    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'team',
        entity_id: team.id,
        action: 'submit',
        old_value: oldValue,
        new_value: auditService.pickModelValues(team, ['id', 'status', 'locked_at']),
        operator_id: userId
    });
    return team;
};

const findJoinTarget = async (tid, body) => {
    const include = [{ model: TPlayer, as: 'players' }];
    if (body.team_id) {
        return TTeam.findOne({ where: { id: body.team_id, t_id: tid }, include });
    }
    if (body.invite_code) {
        return TTeam.findOne({ where: { t_id: tid, invite_code: body.invite_code }, include });
    }
    throw makeError('缺少队伍或邀请码');
};

const joinTeam = async (tid, userId, body) => {
    const tournament = await ensureTournament(tid);
    ensureRegistrationOpen(tournament);
    await ensureUserCanRegister(tid, userId);
    const user = await ensureUser(userId);

    const team = await findJoinTarget(tid, body);
    if (!team) {
        throw makeError(body.team_id ? '队伍不存在' : '邀请码无效', 404);
    }

    ensureTeamMutableByPlayer(team);

    if (!team.is_open && !body.invite_code) {
        throw makeError('该队伍需要邀请码');
    }

    if (team.players.length >= tournament.team_size_max) {
        throw makeError('队伍已满');
    }

    const player = await TPlayer.create({
        team_id: team.id,
        t_id: tid,
        user_id: userId,
        is_captain: 0,
        ...buildPlayerSnapshot(user)
    });

    let oldInviteValue = null;
    if (!team.is_open && team.players.length + 1 >= tournament.team_size_max) {
        oldInviteValue = auditService.pickModelValues(team, ['id', 'invite_code']);
        team.invite_code = null;
        await team.save();
    }

    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'player',
        entity_id: player.id,
        action: 'join_team',
        old_value: null,
        new_value: auditService.pickModelValues(player),
        operator_id: userId
    });

    if (oldInviteValue) {
        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'team',
            entity_id: team.id,
            action: 'clear_invite_after_full',
            old_value: oldInviteValue,
            new_value: auditService.pickModelValues(team, ['id', 'invite_code']),
            operator_id: userId
        });
    }
};

const leaveTeam = async (tid, userId) => {
    const tournament = await ensureTournament(tid);
    ensureRegistrationOpen(tournament);

    const player = await findPlayerInTournament(tid, userId);
    if (!player) {
        throw makeError('你不在任何队伍中', 404);
    }
    if (!player.team) {
        throw makeError('队伍不存在', 404);
    }
    ensureTeamMutableByPlayer(player.team);

    if (player.is_captain) {
        const oldTeamValue = auditService.pickModelValues(player.team);
        const oldPlayerValue = auditService.pickModelValues(player);
        const teamPlayers = await TPlayer.count({ where: { team_id: player.team_id } });
        if (teamPlayers > 1) {
            throw makeError('队长不能离开，请先移除其他队员');
        }
        await TTeam.destroy({ where: { id: player.team_id, t_id: tid } });
        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'team',
            entity_id: player.team_id,
            action: 'captain_leave_delete_team',
            old_value: { team: oldTeamValue, player: oldPlayerValue },
            new_value: null,
            operator_id: userId
        });
        return;
    }

    const oldValue = auditService.pickModelValues(player);
    await player.destroy();
    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'player',
        entity_id: player.id,
        action: 'leave_team',
        old_value: oldValue,
        new_value: null,
        operator_id: userId
    });
};

const kickPlayer = async (tid, operatorId, teamId, playerId) => {
    const tournament = await ensureTournament(tid);
    const isHostOperator = await isTournamentHost(tid, operatorId);
    if (!isHostOperator) {
        ensureRegistrationOpen(tournament);
    }

    const team = await TTeam.findOne({
        where: { id: teamId, t_id: tid },
        include: [{ model: TPlayer, as: 'players' }]
    });
    if (!team) {
        throw makeError('队伍不存在', 404);
    }
    if (!isHostOperator) {
        ensureTeamMutableByPlayer(team);
    }

    const isCaptain = team.captain_id === operatorId || team.players.some(p => p.id === team.captain_player_id && p.user_id === operatorId);
    if (!isCaptain && !isHostOperator) {
        throw makeError('只有队长可以移除队员');
    }

    const target = team.players.find(p => Number(p.id) === Number(playerId));
    if (!target) {
        throw makeError('队员不存在', 404);
    }
    if (target.is_captain || Number(target.id) === Number(team.captain_player_id)) {
        throw makeError('不能移除队长');
    }

    const oldValue = auditService.pickModelValues(target);
    await target.destroy();
    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'player',
        entity_id: target.id,
        action: isHostOperator && !isCaptain ? 'host_kick_player' : 'kick_player',
        old_value: oldValue,
        new_value: null,
        operator_id: operatorId
    });
};

const resetInviteCode = async (tid, userId, teamId) => {
    const tournament = await ensureTournament(tid);
    ensureRegistrationOpen(tournament);

    const team = await TTeam.findOne({
        where: { id: teamId, t_id: tid },
        include: [{ model: TPlayer, as: 'players' }]
    });
    if (!team) {
        throw makeError('队伍不存在', 404);
    }
    ensureTeamMutableByPlayer(team);

    const isCaptain = team.captain_id === userId || team.players.some(p => p.id === team.captain_player_id && p.user_id === userId);
    if (!isCaptain) {
        throw makeError('只有队长可以重置邀请码');
    }

    if (team.is_open) {
        throw makeError('公开队伍不需要邀请码');
    }

    const oldValue = auditService.pickModelValues(team, ['id', 'invite_code']);
    team.invite_code = generateInviteCode();
    await team.save();
    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'team',
        entity_id: team.id,
        action: 'reset_invite',
        old_value: oldValue,
        new_value: auditService.pickModelValues(team, ['id', 'invite_code']),
        operator_id: userId
    });
    return team;
};

const updateTeamInfo = async (tid, userId, teamId, body) => {
    const tournament = await ensureTournament(tid);
    const isHostOperator = await isTournamentHost(tid, userId);
    if (!isHostOperator) {
        ensureRegistrationOpen(tournament);
    }

    const team = await TTeam.findOne({
        where: { id: teamId, t_id: tid },
        include: [{ model: TPlayer, as: 'players' }]
    });
    if (!team) {
        throw makeError('队伍不存在', 404);
    }
    if (!isHostOperator) {
        ensureTeamMutableByPlayer(team);
    }
    if (!isTeamCaptain(team, userId) && !isHostOperator) {
        throw makeError('只有队长可以修改队伍信息');
    }

    const patch = {};
    if (body.name !== undefined) {
        const name = String(body.name || '').trim();
        if (!name) throw makeError('队伍名称不能为空');
        patch.name = name;
    }
    if (body.display_name !== undefined) {
        const displayName = String(body.display_name || '').trim();
        patch.display_name = displayName || patch.name || team.name;
    }
    if (body.avatar !== undefined) {
        patch.avatar = body.avatar || null;
    }
    if (body.is_open !== undefined) {
        const isOpen = body.is_open === true || body.is_open === 1 || body.is_open === '1';
        patch.is_open = isOpen ? 1 : 0;
        patch.invite_code = isOpen ? null : (team.invite_code || generateInviteCode());
    }

    const oldValue = auditService.pickModelValues(team, ['id', 'name', 'display_name', 'avatar', 'is_open', 'invite_code']);
    await team.update(patch);
    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'team',
        entity_id: team.id,
        action: isHostOperator && !isTeamCaptain(team, userId) ? 'host_update_info' : 'update_info',
        old_value: oldValue,
        new_value: auditService.pickModelValues(team, ['id', 'name', 'display_name', 'avatar', 'is_open', 'invite_code']),
        operator_id: userId
    });

    return team;
};

const transferCaptain = async (tid, userId, teamId, playerId) => {
    const tournament = await ensureTournament(tid);
    ensureRegistrationOpen(tournament);

    const team = await TTeam.findOne({
        where: { id: teamId, t_id: tid },
        include: [{ model: TPlayer, as: 'players' }]
    });
    if (!team) {
        throw makeError('队伍不存在', 404);
    }
    ensureTeamMutableByPlayer(team);
    if (!isTeamCaptain(team, userId)) {
        throw makeError('只有队长可以转让队长');
    }

    const nextCaptain = team.players.find(player => Number(player.id) === Number(playerId));
    if (!nextCaptain) {
        throw makeError('目标队员不存在', 404);
    }
    if (Number(nextCaptain.id) === Number(team.captain_player_id)) {
        return team;
    }

    const oldValue = {
        team: auditService.pickModelValues(team, ['id', 'captain_id', 'captain_player_id']),
        players: team.players.map(player => auditService.pickModelValues(player, ['id', 'user_id', 'is_captain']))
    };

    await sequelize.transaction(async (transaction) => {
        await TPlayer.update(
            { is_captain: 0 },
            { where: { team_id: team.id }, transaction }
        );
        await nextCaptain.update({ is_captain: 1 }, { transaction });
        team.captain_id = nextCaptain.user_id;
        team.captain_player_id = nextCaptain.id;
        await team.save({ transaction });

        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'team',
            entity_id: team.id,
            action: 'transfer_captain',
            old_value: oldValue,
            new_value: {
                team: auditService.pickModelValues(team, ['id', 'captain_id', 'captain_player_id']),
                next_player_id: nextCaptain.id
            },
            operator_id: userId
        }, { transaction });
    });

    return team;
};

const updatePlayerByHost = async (tid, playerId, body, operatorId) => {
    await ensureTournament(tid);
    const player = await TPlayer.findOne({ where: { id: playerId, t_id: tid } });
    if (!player) {
        throw makeError('选手不存在', 404);
    }

    const allowedReviewStatus = new Set(['review_pending', 'review_passed', 'review_failed']);
    const patch = {};

    if (body.user_name_snapshot !== undefined) patch.user_name_snapshot = body.user_name_snapshot;
    if (body.avatar_snapshot !== undefined) patch.avatar_snapshot = body.avatar_snapshot;
    if (body.contact_qq !== undefined) patch.contact_qq = body.contact_qq;
    if (body.contact_discord !== undefined) patch.contact_discord = body.contact_discord;
    if (body.timezone !== undefined) patch.timezone = body.timezone;
    if (body.remark !== undefined) patch.remark = body.remark;
    if (body.review_status !== undefined) {
        if (!allowedReviewStatus.has(body.review_status)) {
            throw makeError('无效的选手审查状态');
        }
        patch.review_status = body.review_status;
    }

    const oldValue = auditService.pickModelValues(player);
    await player.update(patch);
    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'player',
        entity_id: player.id,
        action: 'update',
        old_value: oldValue,
        new_value: player,
        operator_id: operatorId
    });
    return player;
};

const updateTeamStatus = async (tid, teamId, status, operatorId) => {
    const team = await TTeam.findOne({ where: { id: teamId, t_id: tid } });
    if (!team) {
        throw makeError('队伍不存在', 404);
    }

    const nextStatus = Number(status);
    const allowedStatuses = new Set([TEAM_STATUS.CREATED, TEAM_STATUS.SUBMITTED, TEAM_STATUS.APPROVED, TEAM_STATUS.LOCKED]);
    if (!allowedStatuses.has(nextStatus)) {
        throw makeError('无效的队伍状态');
    }

    const oldValue = auditService.pickModelValues(team, ['id', 'status', 'locked_at']);
    team.status = nextStatus;
    if (nextStatus === TEAM_STATUS.LOCKED && !team.locked_at) {
        team.locked_at = new Date();
    }
    await team.save();
    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'team',
        entity_id: team.id,
        action: 'status_update',
        old_value: oldValue,
        new_value: auditService.pickModelValues(team, ['id', 'status', 'locked_at']),
        operator_id: operatorId
    });
    return team;
};

const approveAllTeams = async (tid, operatorId) => {
    await ensureTournament(tid);
    const result = await TTeam.update(
        { status: TEAM_STATUS.APPROVED },
        { where: { t_id: tid, status: { [Op.ne]: TEAM_STATUS.LOCKED } } }
    );
    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'team',
        action: 'approve_all',
        new_value: { affected_count: Array.isArray(result) ? result[0] : result },
        operator_id: operatorId
    });
    return result;
};

module.exports = {
    TEAM_STATUS,
    listTeams,
    createTeam,
    submitTeam,
    joinTeam,
    leaveTeam,
    kickPlayer,
    resetInviteCode,
    updateTeamInfo,
    transferCaptain,
    updatePlayerByHost,
    updateTeamStatus,
    approveAllTeams
};

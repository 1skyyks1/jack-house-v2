const crypto = require('crypto');
const fs = require('fs');
const { Op } = require('sequelize');
const sequelize = require('../../config/db');
const { TTeam, TPlayer, TStaff, Tournament } = require('../../models/tournament');
const User = require('../../models/user/user');
const storage = require('../storage');
const auditService = require('./auditService');
const { PLAYER_COMPATIBLE_STAFF_ROLES } = require('./staffRoles');
const { buildContentHashObjectName, hashFile, optimizeImageFile } = require('../../utils/imageOptimizer');

const TEAM_STATUS = {
    CREATED: 0,
    APPROVED: 1,
    SUBMITTED: 2,
    LOCKED: 3
};

const TEAM_AVATAR_STORAGE_SCOPE = process.env.TOURNAMENT_TEAM_AVATAR_STORAGE_SCOPE || (process.env.TOURNAMENT_TEAM_AVATAR_STORAGE_PROVIDER ? 'TOURNAMENT_TEAM_AVATAR' : 'RICHTEXT');
const TEAM_AVATAR_STORAGE_BUCKET = process.env.TOURNAMENT_TEAM_AVATAR_STORAGE_BUCKET || 'tournament-team-avatars';

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

const ensureUserCanRegister = async (tid, userId, options = {}) => {
    const existingPlayer = await TPlayer.findOne({
        where: { t_id: tid, user_id: userId },
        transaction: options.transaction
    });
    if (existingPlayer) {
        throw makeError('你已经在一支队伍中');
    }

    const existingStaff = await TStaff.findOne({
        where: {
            t_id: tid,
            user_id: userId,
            role: { [Op.notIn]: PLAYER_COMPATIBLE_STAFF_ROLES }
        },
        transaction: options.transaction
    });
    if (existingStaff) {
        throw makeError('当前 Staff 角色不能与选手身份兼任');
    }
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

const ensureUser = async (userId, options = {}) => {
    const user = await User.findByPk(userId, {
        attributes: ['user_id', 'user_name', 'avatar', 'osu_uid', 'qq', 'discord'],
        transaction: options.transaction,
        lock: options.lock
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

    const name = String(body.name || '').trim();
    if (!name) {
        throw makeError('队伍名称不能为空');
    }

    const isOpen = body.is_open === true || body.is_open === 1 || body.is_open === '1';
    const inviteCode = isOpen ? null : generateInviteCode();

    return sequelize.transaction(async (transaction) => {
        // Locking the user serializes concurrent registration attempts across different teams.
        const user = await ensureUser(userId, { transaction, lock: transaction.LOCK.UPDATE });
        await ensureUserCanRegister(tid, userId, { transaction });

        const team = await TTeam.create({
            t_id: tid,
            name,
            display_name: body.display_name || name,
            avatar: null,
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
    return sequelize.transaction(async (transaction) => {
        const team = await TTeam.findOne({
            where: { id: teamId, t_id: tid },
            include: [{ model: TPlayer, as: 'players' }],
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!team) throw makeError('队伍不存在', 404);
        ensureTeamMutableByPlayer(team);

        const isCaptain = team.captain_id === userId || team.captain_player_id && team.players.some(p => p.id === team.captain_player_id && p.user_id === userId);
        if (!isCaptain) throw makeError('只有队长可以提交队伍');
        if (team.players.length < tournament.team_size_min || team.players.length > tournament.team_size_max) {
            throw makeError('队伍人数不符合赛事要求');
        }

        const oldValue = auditService.pickModelValues(team, ['id', 'status', 'locked_at']);
        team.status = TEAM_STATUS.SUBMITTED;
        await team.save({ transaction });
        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'team',
            entity_id: team.id,
            action: 'submit',
            old_value: oldValue,
            new_value: auditService.pickModelValues(team, ['id', 'status', 'locked_at']),
            operator_id: userId
        }, { transaction });
        return team;
    });
};

const findJoinTarget = async (tid, body, transaction) => {
    const options = {
        transaction,
        lock: transaction.LOCK.UPDATE
    };
    if (body.team_id) {
        return TTeam.findOne({ where: { id: body.team_id, t_id: tid }, ...options });
    }
    if (body.invite_code) {
        return TTeam.findOne({ where: { t_id: tid, invite_code: body.invite_code }, ...options });
    }
    throw makeError('缺少队伍或邀请码');
};

const joinTeam = async (tid, userId, body) => {
    const tournament = await ensureTournament(tid);
    ensureRegistrationOpen(tournament);
    return sequelize.transaction(async (transaction) => {
        // Lock the user before the team so registration attempts use a consistent lock order.
        const user = await ensureUser(userId, { transaction, lock: transaction.LOCK.UPDATE });
        await ensureUserCanRegister(tid, userId, { transaction });

        const team = await findJoinTarget(tid, body, transaction);
        if (!team) {
            throw makeError(body.team_id ? '队伍不存在' : '邀请码无效', 404);
        }

        ensureTeamMutableByPlayer(team);

        const providedInviteCode = String(body.invite_code || '').trim();
        if (!team.is_open && (!providedInviteCode || providedInviteCode !== team.invite_code)) {
            throw makeError('邀请码无效');
        }

        const playerCount = await TPlayer.count({
            where: { team_id: team.id },
            transaction
        });
        if (playerCount >= tournament.team_size_max) {
            throw makeError('队伍已满');
        }

        const player = await TPlayer.create({
            team_id: team.id,
            t_id: tid,
            user_id: userId,
            is_captain: 0,
            ...buildPlayerSnapshot(user)
        }, { transaction });

        let oldInviteValue = null;
        if (!team.is_open && playerCount + 1 >= tournament.team_size_max) {
            oldInviteValue = auditService.pickModelValues(team, ['id', 'invite_code']);
            team.invite_code = null;
            await team.save({ transaction });
        }

        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'player',
            entity_id: player.id,
            action: 'join_team',
            old_value: null,
            new_value: auditService.pickModelValues(player),
            operator_id: userId
        }, { transaction });

        if (oldInviteValue) {
            await auditService.writeAuditLog({
                t_id: tid,
                entity_type: 'team',
                entity_id: team.id,
                action: 'clear_invite_after_full',
                old_value: oldInviteValue,
                new_value: auditService.pickModelValues(team, ['id', 'invite_code']),
                operator_id: userId
            }, { transaction });
        }

        return player;
    });
};

const leaveTeam = async (tid, userId) => {
    const tournament = await ensureTournament(tid);
    return sequelize.transaction(async (transaction) => {
        const player = await TPlayer.findOne({
            where: { t_id: tid, user_id: userId },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!player) {
            throw makeError('你不在任何队伍中', 404);
        }

        const team = player.team_id ? await TTeam.findOne({
            where: { id: player.team_id, t_id: tid },
            transaction,
            lock: transaction.LOCK.UPDATE
        }) : null;

        if (!team) {
            const oldValue = auditService.pickModelValues(player);
            await player.destroy({ transaction });
            await auditService.writeAuditLog({
                t_id: tid,
                entity_type: 'player',
                entity_id: player.id,
                action: 'cleanup_orphan_player',
                old_value: oldValue,
                new_value: null,
                operator_id: userId
            }, { transaction });
            return;
        }

        ensureRegistrationOpen(tournament);
        ensureTeamMutableByPlayer(team);

        if (player.is_captain || Number(team.captain_player_id) === Number(player.id)) {
            const oldTeamValue = auditService.pickModelValues(team);
            const oldPlayerValue = auditService.pickModelValues(player);
            const teamPlayers = await TPlayer.count({ where: { team_id: player.team_id }, transaction });
            if (teamPlayers > 1) {
                throw makeError('队长不能离开，请先移除其他队员');
            }

            const teamId = team.id;
            await player.destroy({ transaction });
            await team.destroy({ transaction });
            await auditService.writeAuditLog({
                t_id: tid,
                entity_type: 'team',
                entity_id: teamId,
                action: 'captain_leave_delete_team',
                old_value: { team: oldTeamValue, player: oldPlayerValue },
                new_value: null,
                operator_id: userId
            }, { transaction });
            return;
        }

        const oldValue = auditService.pickModelValues(player);
        await player.destroy({ transaction });
        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'player',
            entity_id: player.id,
            action: 'leave_team',
            old_value: oldValue,
            new_value: null,
            operator_id: userId
        }, { transaction });
    });
};

const kickPlayer = async (tid, operatorId, teamId, playerId) => {
    const tournament = await ensureTournament(tid);
    const isHostOperator = await isTournamentHost(tid, operatorId);
    if (!isHostOperator) {
        ensureRegistrationOpen(tournament);
    }
    return sequelize.transaction(async (transaction) => {
        const team = await TTeam.findOne({
            where: { id: teamId, t_id: tid },
            include: [{ model: TPlayer, as: 'players' }],
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!team) throw makeError('队伍不存在', 404);
        if (!isHostOperator) ensureTeamMutableByPlayer(team);

        const isCaptain = team.captain_id === operatorId || team.players.some(p => p.id === team.captain_player_id && p.user_id === operatorId);
        if (!isCaptain && !isHostOperator) throw makeError('只有队长可以移除队员');

        const target = team.players.find(p => Number(p.id) === Number(playerId));
        if (!target) throw makeError('队员不存在', 404);
        if (target.is_captain || Number(target.id) === Number(team.captain_player_id)) {
            throw makeError('不能移除队长');
        }

        const oldValue = auditService.pickModelValues(target);
        await target.destroy({ transaction });
        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'player',
            entity_id: target.id,
            action: isHostOperator && !isCaptain ? 'host_kick_player' : 'kick_player',
            old_value: oldValue,
            new_value: null,
            operator_id: operatorId
        }, { transaction });
    });
};

const resetInviteCode = async (tid, userId, teamId) => {
    const tournament = await ensureTournament(tid);
    ensureRegistrationOpen(tournament);
    return sequelize.transaction(async (transaction) => {
        const team = await TTeam.findOne({
            where: { id: teamId, t_id: tid },
            include: [{ model: TPlayer, as: 'players' }],
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!team) throw makeError('队伍不存在', 404);
        ensureTeamMutableByPlayer(team);

        const isCaptain = team.captain_id === userId || team.players.some(p => p.id === team.captain_player_id && p.user_id === userId);
        if (!isCaptain) throw makeError('只有队长可以重置邀请码');
        if (team.is_open) throw makeError('公开队伍不需要邀请码');

        const oldValue = auditService.pickModelValues(team, ['id', 'invite_code']);
        team.invite_code = generateInviteCode();
        await team.save({ transaction });
        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'team',
            entity_id: team.id,
            action: 'reset_invite',
            old_value: oldValue,
            new_value: auditService.pickModelValues(team, ['id', 'invite_code']),
            operator_id: userId
        }, { transaction });
        return team;
    });
};

const updateTeamInfo = async (tid, userId, teamId, body) => {
    const tournament = await ensureTournament(tid);
    const isHostOperator = await isTournamentHost(tid, userId);
    if (!isHostOperator) {
        ensureRegistrationOpen(tournament);
    }

    return sequelize.transaction(async (transaction) => {
        const team = await TTeam.findOne({
            where: { id: teamId, t_id: tid },
            include: [{ model: TPlayer, as: 'players' }],
            transaction,
            lock: transaction.LOCK.UPDATE
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
        if (body.is_open !== undefined) {
            const isOpen = body.is_open === true || body.is_open === 1 || body.is_open === '1';
            patch.is_open = isOpen ? 1 : 0;
            patch.invite_code = isOpen ? null : (team.invite_code || generateInviteCode());
        }

        const oldValue = auditService.pickModelValues(team, ['id', 'name', 'display_name', 'avatar', 'is_open', 'invite_code']);
        const action = isHostOperator && !isTeamCaptain(team, userId) ? 'host_update_info' : 'update_info';
        await team.update(patch, { transaction });
        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'team',
            entity_id: team.id,
            action,
            old_value: oldValue,
            new_value: auditService.pickModelValues(team, ['id', 'name', 'display_name', 'avatar', 'is_open', 'invite_code']),
            operator_id: userId
        }, { transaction });

        return team;
    });
};

const uploadTeamAvatar = async (tid, userId, teamId, file) => {
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
    if (!file?.path) {
        throw makeError('没有图片上传');
    }

    const removeTempFile = () => {
        if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
    };

    try {
        const optimized = await optimizeImageFile(file, { convertToWebp: true });
        const checksum = await hashFile(file.path);
        const fileName = buildContentHashObjectName(checksum, optimized.mimeType, file.filename);
        const objectName = `tournaments/${tid}/teams/${teamId}/${fileName}`;
        const uploaded = await storage.uploadFile(TEAM_AVATAR_STORAGE_SCOPE, {
            bucket: TEAM_AVATAR_STORAGE_BUCKET,
            objectName,
            filePath: file.path,
            mimeType: optimized.mimeType,
            size: optimized.size,
        });
        const avatarUrl = uploaded.publicUrl || uploaded.downloadUrl || uploaded.url;
        return sequelize.transaction(async (transaction) => {
            const lockedTeam = await TTeam.findOne({
                where: { id: teamId, t_id: tid },
                include: [{ model: TPlayer, as: 'players' }],
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!lockedTeam) {
                throw makeError('队伍不存在', 404);
            }
            if (!isHostOperator) {
                ensureTeamMutableByPlayer(lockedTeam);
            }
            if (!isTeamCaptain(lockedTeam, userId) && !isHostOperator) {
                throw makeError('只有队长可以修改队伍信息');
            }

            const oldValue = auditService.pickModelValues(lockedTeam, ['id', 'name', 'display_name', 'avatar']);
            const action = isHostOperator && !isTeamCaptain(lockedTeam, userId) ? 'host_upload_avatar' : 'upload_avatar';
            await lockedTeam.update({ avatar: avatarUrl || null }, { transaction });
            await auditService.writeAuditLog({
                t_id: tid,
                entity_type: 'team',
                entity_id: lockedTeam.id,
                action,
                old_value: oldValue,
                new_value: {
                    ...auditService.pickModelValues(lockedTeam, ['id', 'name', 'display_name', 'avatar']),
                    storage_provider: uploaded.provider,
                    object_key: uploaded.objectKey,
                    mime_type: uploaded.mimeType,
                    size: optimized.size,
                    checksum,
                },
                operator_id: userId
            }, { transaction });
            return lockedTeam;
        });
    } finally {
        removeTempFile();
    }
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

    return sequelize.transaction(async (transaction) => {
        const player = await TPlayer.findOne({
            where: { id: playerId, t_id: tid },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!player) throw makeError('选手不存在', 404);

        const oldValue = auditService.pickModelValues(player);
        await player.update(patch, { transaction });
        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'player',
            entity_id: player.id,
            action: 'update',
            old_value: oldValue,
            new_value: player,
            operator_id: operatorId
        }, { transaction });
        return player;
    });
};

const updateTeamStatus = async (tid, teamId, status, operatorId) => {
    const nextStatus = Number(status);
    const allowedStatuses = new Set([TEAM_STATUS.CREATED, TEAM_STATUS.SUBMITTED, TEAM_STATUS.APPROVED, TEAM_STATUS.LOCKED]);
    if (!allowedStatuses.has(nextStatus)) {
        throw makeError('无效的队伍状态');
    }

    return sequelize.transaction(async (transaction) => {
        const team = await TTeam.findOne({
            where: { id: teamId, t_id: tid },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!team) throw makeError('队伍不存在', 404);

        const oldValue = auditService.pickModelValues(team, ['id', 'status', 'locked_at']);
        team.status = nextStatus;
        if (nextStatus === TEAM_STATUS.LOCKED && !team.locked_at) team.locked_at = new Date();
        await team.save({ transaction });
        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'team',
            entity_id: team.id,
            action: 'status_update',
            old_value: oldValue,
            new_value: auditService.pickModelValues(team, ['id', 'status', 'locked_at']),
            operator_id: operatorId
        }, { transaction });
        return team;
    });
};

const approveAllTeams = async (tid, operatorId) => {
    await ensureTournament(tid);
    return sequelize.transaction(async (transaction) => {
        const result = await TTeam.update(
            { status: TEAM_STATUS.APPROVED },
            { where: { t_id: tid, status: { [Op.ne]: TEAM_STATUS.LOCKED } }, transaction }
        );
        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'team',
            action: 'approve_all',
            new_value: { affected_count: Array.isArray(result) ? result[0] : result },
            operator_id: operatorId
        }, { transaction });
        return result;
    });
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
    uploadTeamAvatar,
    transferCaptain,
    updatePlayerByHost,
    updateTeamStatus,
    approveAllTeams
};

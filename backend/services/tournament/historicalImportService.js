const { Op } = require('sequelize');
const sequelize = require('../../config/db');
const { TTeam, TPlayer, Tournament } = require('../../models/tournament');
const User = require('../../models/user/user');
const auditService = require('./auditService');

const REVIEW_STATUSES = new Set(['review_pending', 'review_passed', 'review_failed']);
const TEAM_STATUSES = new Set([0, 1, 2, 3]);

const makeError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const normalizeString = (value) => {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    return normalized || null;
};

const normalizeNullableNumber = (value, fieldName) => {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    if (!Number.isInteger(number)) {
        throw makeError(`${fieldName} 必须是整数`);
    }
    return number;
};

const normalizeBooleanFlag = (value) => {
    return value === true || value === 1 || value === '1' ? 1 : 0;
};

const validatePayload = (body) => {
    const batchId = normalizeString(body.batch_id);
    if (!batchId) {
        throw makeError('batch_id 不能为空');
    }

    if (!Array.isArray(body.teams) || body.teams.length === 0) {
        throw makeError('teams 必须是非空数组');
    }
    if (body.teams.length > 128) {
        throw makeError('单次最多导入 128 支队伍');
    }

    return batchId;
};

const resolveExistingUser = async (player, transaction) => {
    const userId = normalizeNullableNumber(player.user_id, 'user_id');
    if (userId) {
        const user = await User.findByPk(userId, { transaction });
        if (!user) {
            throw makeError(`用户 ${userId} 不存在`, 404);
        }
        return { created: false, user };
    }

    const osuUid = normalizeNullableNumber(player.osu_uid, 'osu_uid');
    if (osuUid) {
        const user = await User.findOne({ where: { osu_uid: osuUid }, transaction });
        if (user) {
            return { created: false, user };
        }
    }

    const userName = normalizeString(player.user_name) || normalizeString(player.user_name_snapshot);
    if (!userName) {
        throw makeError('导入非站内选手时 user_name 不能为空');
    }

    const user = await User.create({
        user_name: userName,
        password: null,
        email: null,
        avatar: normalizeString(player.avatar) || normalizeString(player.avatar_snapshot),
        role: 0,
        status: 0,
        osu_uid: osuUid,
        qq: null,
        discord: null
    }, { transaction });

    return { created: true, user };
};

const normalizePlayer = async (tid, player, batchId, seenUserIds, transaction) => {
    if (!player || typeof player !== 'object') {
        throw makeError('player 必须是对象');
    }

    const { created, user } = await resolveExistingUser(player, transaction);
    const existingPlayer = await TPlayer.findOne({
        where: { t_id: tid, user_id: user.user_id },
        transaction
    });
    if (existingPlayer) {
        throw makeError(`用户 ${user.user_name} 已经在本赛事中`);
    }
    if (seenUserIds.has(user.user_id)) {
        throw makeError(`导入批次中存在重复选手：${user.user_name}`);
    }
    seenUserIds.add(user.user_id);

    const reviewStatus = normalizeString(player.review_status) || 'review_passed';
    if (!REVIEW_STATUSES.has(reviewStatus)) {
        throw makeError(`无效的选手审查状态：${reviewStatus}`);
    }

    const userNameSnapshot = normalizeString(player.user_name_snapshot) || normalizeString(player.user_name) || user.user_name;
    const avatarSnapshot = normalizeString(player.avatar_snapshot) || normalizeString(player.avatar) || user.avatar;
    const remark = normalizeString(player.remark);
    const batchRemark = `[historical-import:${batchId}]`;

    return {
        createdUser: created,
        playerData: {
            t_id: tid,
            user_id: user.user_id,
            user_name_snapshot: userNameSnapshot,
            avatar_snapshot: avatarSnapshot,
            contact_qq: normalizeString(player.contact_qq),
            contact_discord: normalizeString(player.contact_discord),
            timezone: normalizeString(player.timezone),
            remark: remark ? `${batchRemark} ${remark}` : batchRemark,
            review_status: reviewStatus,
            is_captain: normalizeBooleanFlag(player.is_captain)
        },
        user
    };
};

const normalizeTeam = (team, index) => {
    if (!team || typeof team !== 'object') {
        throw makeError(`teams[${index}] 必须是对象`);
    }
    const name = normalizeString(team.name);
    if (!name) {
        throw makeError(`teams[${index}].name 不能为空`);
    }
    if (!Array.isArray(team.players) || team.players.length === 0) {
        throw makeError(`${name} 至少需要 1 名选手`);
    }
    if (team.players.length > 16) {
        throw makeError(`${name} 单队最多导入 16 名选手`);
    }

    const status = team.status === undefined || team.status === null || team.status === ''
        ? 1
        : Number(team.status);
    if (!Number.isInteger(status) || !TEAM_STATUSES.has(status)) {
        throw makeError(`${name} 的 status 无效`);
    }

    return {
        avatar: normalizeString(team.avatar),
        display_name: normalizeString(team.display_name) || name,
        is_open: normalizeBooleanFlag(team.is_open),
        locked_at: team.locked_at ? new Date(team.locked_at) : null,
        name,
        qual_mp_id: normalizeNullableNumber(team.qual_mp_id, 'qual_mp_id'),
        qual_rank: normalizeNullableNumber(team.qual_rank, 'qual_rank'),
        qual_score: normalizeNullableNumber(team.qual_score, 'qual_score'),
        status
    };
};

const ensureNoDuplicatePlayersInPayload = (players, teamName) => {
    const seen = new Set();
    for (const player of players) {
        const userId = normalizeNullableNumber(player.user_id, 'user_id');
        const osuUid = normalizeNullableNumber(player.osu_uid, 'osu_uid');
        const fallbackName = normalizeString(player.user_name) || normalizeString(player.user_name_snapshot);
        const key = userId ? `user:${userId}` : osuUid ? `osu:${osuUid}` : `name:${fallbackName}`;
        if (!key || key === 'name:null') {
            continue;
        }
        if (seen.has(key)) {
            throw makeError(`${teamName} 中存在重复选手：${key}`);
        }
        seen.add(key);
    }
};

const importTeams = async (tid, body, operatorId) => {
    const tournament = await Tournament.findByPk(tid);
    if (!tournament) {
        throw makeError('赛事不存在', 404);
    }

    const batchId = validatePayload(body);
    const dryRun = body.dry_run === true || body.dry_run === 1 || body.dry_run === '1';
    const transaction = await sequelize.transaction();

    try {
        const result = {
            batch_id: batchId,
            created_users: [],
            dry_run: dryRun,
            teams: []
        };
        const seenUserIds = new Set();

        for (const [index, teamInput] of body.teams.entries()) {
            const teamData = normalizeTeam(teamInput, index);
            ensureNoDuplicatePlayersInPayload(teamInput.players, teamData.name);

            const existingTeam = await TTeam.findOne({
                where: {
                    t_id: tid,
                    [Op.or]: [
                        { name: teamData.name },
                        { display_name: teamData.display_name }
                    ]
                },
                transaction
            });
            if (existingTeam) {
                throw makeError(`队伍已存在：${teamData.display_name}`);
            }

            const normalizedPlayers = [];
            for (const player of teamInput.players) {
                normalizedPlayers.push(await normalizePlayer(tid, player, batchId, seenUserIds, transaction));
            }

            const captainIndex = normalizedPlayers.findIndex((item) => item.playerData.is_captain);
            const resolvedCaptainIndex = captainIndex >= 0 ? captainIndex : 0;
            normalizedPlayers.forEach((item, playerIndex) => {
                item.playerData.is_captain = playerIndex === resolvedCaptainIndex ? 1 : 0;
            });
            const captain = normalizedPlayers[resolvedCaptainIndex];

            let team = null;
            let players = [];
            if (!dryRun) {
                team = await TTeam.create({
                    ...teamData,
                    captain_id: captain.user.user_id,
                    invite_code: null
                }, { transaction });

                players = await Promise.all(normalizedPlayers.map((item) => TPlayer.create({
                    ...item.playerData,
                    team_id: team.id
                }, { transaction })));

                const captainPlayer = players[resolvedCaptainIndex];
                team.captain_player_id = captainPlayer.id;
                await team.save({ transaction });

                for (const item of normalizedPlayers) {
                    if (item.createdUser) {
                        result.created_users.push({
                            osu_uid: item.user.osu_uid,
                            user_id: item.user.user_id,
                            user_name: item.user.user_name
                        });
                    }
                }

                await auditService.writeAuditLog({
                    t_id: tid,
                    entity_type: 'historical_import',
                    entity_id: team.id,
                    action: 'import_team',
                    old_value: null,
                    new_value: {
                        batch_id: batchId,
                        team: auditService.pickModelValues(team),
                        players: players.map((player) => auditService.pickModelValues(player))
                    },
                    operator_id: operatorId
                }, { transaction });
            }

            result.teams.push({
                captain_user_id: captain.user.user_id,
                display_name: teamData.display_name,
                player_count: normalizedPlayers.length,
                players: normalizedPlayers.map((item, playerIndex) => ({
                    created_user: item.createdUser,
                    is_captain: playerIndex === resolvedCaptainIndex,
                    osu_uid: item.user.osu_uid,
                    user_id: item.user.user_id,
                    user_name_snapshot: item.playerData.user_name_snapshot
                })),
                team_id: team ? team.id : null
            });
        }

        if (dryRun) {
            await transaction.rollback();
            return result;
        }

        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'historical_import',
            action: 'import_batch',
            old_value: null,
            new_value: {
                batch_id: batchId,
                created_user_count: result.created_users.length,
                team_count: result.teams.length
            },
            operator_id: operatorId
        }, { transaction });

        await transaction.commit();
        return result;
    } catch (error) {
        if (!transaction.finished) {
            await transaction.rollback();
        }
        throw error;
    }
};

module.exports = {
    importTeams
};

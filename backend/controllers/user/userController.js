const { User, Post, Badge } = require('../../models');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { getBadgeImageUrl } = require('../../services/badgeStorage');
const tournamentRatingService = require('../../services/tournament/ratingService');
const permissionService = require('../../services/permissionService');
const { can, resolveUserPermissions } = require('../../utils/permissions');
const sequelize = require('../../config/db');
const { listUserRecentScores } = require('../../services/userRecentScoreService');

const USER_SELF_UPDATE_FIELDS = ['password', 'qq', 'discord', 'default_pp_client'];
const ADMIN_UPDATE_FIELDS = ['user_name', 'password', 'email', 'status', 'osu_uid', 'avatar', 'qq', 'discord', 'default_pp_client'];
const PUBLIC_USER_DETAIL_FIELDS = [
    'user_id',
    'user_name',
    'avatar',
    'status',
    'osu_uid',
    'qq',
    'discord',
    'default_pp_client',
    'created_time',
    'updated_time',
];

const pickDefined = (source, fields) => {
    return fields.reduce((result, field) => {
        if (Object.prototype.hasOwnProperty.call(source, field) && source[field] !== undefined) {
            result[field] = source[field];
        }
        return result;
    }, {});
};

const parsePagination = (query, { defaultPageSize = 20, maxPageSize = 50 } = {}) => {
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const requestedPageSize = parseInt(query.pageSize, 10) || defaultPageSize;
    const limit = Math.min(Math.max(requestedPageSize, 1), maxPageSize);
    return {
        page,
        limit,
        offset: (page - 1) * limit,
    };
};

const createUserRecord = async ({ user_name, password, email, status = 0, osu_uid, avatar }) => {
    const data = {
        user_name,
        email,
        status,
        osu_uid,
        avatar
    };

    if (password) {
        data.password = await bcrypt.hash(password, 10);
    }

    return User.create(data);
};

// 创建用户
const createUser = async (req, res) => {
    try {
        await createUserRecord(req.body);
        res.status(201).json({ message: req.t('user.createSuccess') });
    } catch (err) {
        res.status(500).json({ message: req.t('user.createFailed') });
    }
};

// 获取所有用户
const getUsers = async (req, res) => {
    const { search, role } = req.query;
    const { page, limit, offset } = parsePagination(req.query, { defaultPageSize: 20, maxPageSize: 50 });
    try {
        const whereCondition = {};
        if (search) {
            whereCondition.user_name = {
                [Op.like]: `%${search}%`
            };
        }
        if (role && role !== 'all') {
            // 通过子查询过滤用户 ID，避免直接在 include.roles 加 where 导致用户持有的其他角色被意外过滤
            if (role === 'none') {
                whereCondition.user_id = {
                    [Op.notIn]: sequelize.literal('(SELECT DISTINCT user_id FROM user_roles)')
                };
            } else {
                whereCondition.user_id = {
                    [Op.in]: sequelize.literal(`(
                        SELECT ur.user_id
                        FROM user_roles ur
                        INNER JOIN role r ON ur.role_id = r.role_id
                        WHERE r.role_code = ${sequelize.escape(role)}
                    )`)
                };
            }
        }
        const findOptions = {
            attributes: can(req, 'users') ? { exclude: ['password'] } : PUBLIC_USER_DETAIL_FIELDS,
            where: whereCondition,
            order: [['created_time', 'DESC']],
            offset,
            limit,
        };
        if (can(req, 'users')) {
            findOptions.include = permissionService.USER_ROLES_INCLUDE;
            findOptions.distinct = true;
        }
        const { count, rows } = await User.findAndCountAll(findOptions);
        const data = rows.map(user => {
            const json = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
            if (can(req, 'users')) {
                const resolved = resolveUserPermissions(user);
                json.roles = resolved.roles;
            }
            return json;
        });
        const totalPages = Math.ceil(count / limit);
        res.status(200).json({ data, page, pageSize: limit, totalPages, total: count });
    } catch (err) {
        res.status(500).json({ message: req.t('user.listFailed') });
    }
};

const searchUsers = async (req, res) => {
    const { page, limit, offset } = parsePagination(req.query, { defaultPageSize: 20, maxPageSize: 20 });
    const search = String(req.query.search || '').trim();

    if (search.length < 2) {
        return res.status(200).json({ data: [], page, pageSize: limit, totalPages: 0, total: 0 });
    }

    try {
        const { count, rows } = await User.findAndCountAll({
            attributes: ['user_id', 'user_name', 'avatar', 'osu_uid'],
            where: {
                [Op.or]: [
                    { user_name: { [Op.like]: `%${search}%` } },
                    { osu_uid: { [Op.like]: `%${search}%` } },
                ],
            },
            order: [['user_name', 'ASC']],
            offset,
            limit,
        });
        const totalPages = Math.ceil(count / limit);
        res.status(200).json({ data: rows, page, pageSize: limit, totalPages, total: count });
    } catch (err) {
        res.status(500).json({ message: req.t('user.listFailed') });
    }
};

// 获取单个用户
const getUserById = async (req, res) => {
    try {
        const requestedUserId = Number(req.params.user_id);
        const isSelf = Number(req.user?.user_id) === requestedUserId;
        const canViewPrivateFields = isSelf || can(req, 'users');
        const user = await User.findByPk(req.params.user_id, {
            attributes: canViewPrivateFields ? { exclude: ['password'] } : PUBLIC_USER_DETAIL_FIELDS,
            include: [
                permissionService.USER_ROLES_INCLUDE[0],
                {
                    model: Badge,
                    as: 'badges',
                    through: { attributes: [User.associations.badges.through.model._timestampAttributes.createdAt] }
                }
            ]
        });
        if (!user) {
            return res.status(404).json({ message: req.t('user.notFound') });
        }

        // 获取badge
        const userData = user.toJSON();
        userData.roles = resolveUserPermissions(user).roles;
        if (userData.badges && userData.badges.length > 0) {
            const signedBadge = userData.badges.map(async (badge) => {
                const timestamp = User.associations.badges.through.model._timestampAttributes.createdAt;
                badge.acquired_at = badge.user_badges?.[timestamp] ?? badge.user_badges?.created_time ?? null;
                delete badge.user_badges;
                const signedUrl = await getBadgeImageUrl(badge);
                delete badge.minio_img_name;
                if (badge.url) {
                    delete badge.url;
                }
                badge.signedUrl = signedUrl;
                return badge;
            });
            userData.badges = (await Promise.all(signedBadge)).sort((a, b) =>
                (Date.parse(b.acquired_at) || 0) - (Date.parse(a.acquired_at) || 0));
        }
        res.status(200).json({ data: userData });
    } catch (err) {
        res.status(500).json({ message: req.t('user.getFailed') });
    }
};

const getUserTournamentExperiences = async (req, res) => {
    try {
        const requestedUserId = Number(req.params.user_id);
        if (!Number.isInteger(requestedUserId) || requestedUserId <= 0) {
            return res.status(400).json({ message: req.t('user.notFound') });
        }
        const user = await User.findByPk(requestedUserId, { attributes: ['user_id'] });
        if (!user) return res.status(404).json({ message: req.t('user.notFound') });
        const experiences = await tournamentRatingService.listPublishedForUser(requestedUserId);
        return res.status(200).json({ data: experiences });
    } catch (err) {
        return res.status(500).json({ message: req.t('user.getFailed') });
    }
};

// 更新用户。只有超级管理员可以修改授权；用户管理不能接管其他后台账号。
const updateUser = async (req, res) => {
    try {
        await sequelize.transaction(async transaction => {
            const user = await User.findByPk(req.params.user_id, {
                include: permissionService.USER_ROLES_INCLUDE,
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!user) throw Object.assign(new Error(req.t('user.notFound')), { status: 404 });
            const isOwner = Number(user.user_id) === Number(req.user.user_id);
            const isManager = can(req, 'users');
            const isSuperAdmin = can(req, '*');
            const targetPermissions = await permissionService.getUserPermissions(user);
            if ((!isOwner && !isManager) || (!isOwner && !isSuperAdmin && targetPermissions.permissions.length)) {
                throw Object.assign(new Error(req.t('user.noPermission')), { status: 403 });
            }
            const updateData = pickDefined(req.body, isManager ? ADMIN_UPDATE_FIELDS : USER_SELF_UPDATE_FIELDS);
            if (Object.prototype.hasOwnProperty.call(updateData, 'default_pp_client')
                && !['stable', 'lazer'].includes(updateData.default_pp_client)) {
                throw Object.assign(new Error(req.t('user.invalidPPClient')), { status: 400 });
            }
            if (updateData.password) updateData.password = await bcrypt.hash(updateData.password, 10);
            else delete updateData.password;
            await user.update(updateData, { transaction });
        });
        res.status(200).json({ message: req.t('user.updateSuccess') });
    } catch (err) {
        res.status(err.status || 500).json({ message: err.status ? err.message : req.t('user.updateFailed') });
    }
};

const deleteUser = async (req, res) => {
    try {
        await sequelize.transaction(async transaction => {
            const user = await User.findByPk(req.params.user_id, {
                include: permissionService.USER_ROLES_INCLUDE,
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!user) throw Object.assign(new Error(req.t('user.notFound')), { status: 404 });
            const targetPermissions = await permissionService.getUserPermissions(user);
            if (!can(req, 'users') || (!can(req, '*') && targetPermissions.permissions.length)) {
                throw Object.assign(new Error(req.t('user.noPermission')), { status: 403 });
            }
            if (targetPermissions.isSuperAdmin) {
                const hasOther = await permissionService.hasOtherSuperAdmin(user.user_id, transaction);
                if (!hasOther) {
                    throw Object.assign(new Error('系统至少保留一个有效超级管理员'), { status: 400 });
                }
            }
            await user.destroy({ transaction });
        });
        res.status(200).json({ message: req.t('user.deleteSuccess') });
    } catch (err) {
        res.status(err.status || 500).json({ message: err.status ? err.message : req.t('user.deleteFailed') });
    }
};

const getUserRecentScores = async (req, res) => {
    try {
        const userId = Number(req.params.user_id);
        if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ message: req.t('user.notFound') });
        const user = await User.findByPk(userId, { attributes: ['user_id'] });
        if (!user) return res.status(404).json({ message: req.t('user.notFound') });
        res.status(200).json(await listUserRecentScores(userId, req.query));
    } catch (err) {
        res.status(500).json({ message: req.t('user.getFailed') });
    }
};

// 根据token获取用户信息
const getUserInfo = async (req, res) => {
    try {
        // checkAuth 已经加载并验证了用户及其角色，直接复用，避免身份接口重复查库。
        const userData = req.user.toJSON();
        // 纵深防御：即使未来鉴权查询字段调整，也绝不向客户端返回密码哈希。
        delete userData.password;
        userData.roles = req.userRoles || [];
        userData.permissions = req.userPermissions ? Array.from(req.userPermissions) : [];
        res.status(200).json({ data: userData });
    } catch (error) {
        res.status(500).json({ message: req.t('user.getFailed') });
    }
};

module.exports = {
    createUser,
    createUserRecord,
    getUsers,
    searchUsers,
    getUserById,
    getUserTournamentExperiences,
    getUserRecentScores,
    updateUser,
    deleteUser,
    getUserInfo,
};

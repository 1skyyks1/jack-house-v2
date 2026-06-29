const { User, Post, Badge } = require('../../models');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { ROLES } = require("../../config/roles");
const storage = require('../../services/storage');

const USER_SELF_UPDATE_FIELDS = ['password', 'qq', 'discord'];
const ADMIN_UPDATE_FIELDS = ['user_name', 'password', 'email', 'role', 'status', 'osu_uid', 'avatar', 'qq', 'discord'];
const BADGES_STORAGE_SCOPE = 'BADGES';
const PUBLIC_USER_DETAIL_FIELDS = [
    'user_id',
    'user_name',
    'avatar',
    'role',
    'status',
    'osu_uid',
    'qq',
    'discord',
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

const normalizeRole = (role) => {
    if (role === undefined || role === null || role === '') {
        return undefined;
    }
    const value = Number(role);
    return Object.values(ROLES).includes(value) ? value : undefined;
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

const getBadgeObjectName = (badge) => badge.object_key || badge.minio_img_name;

const getBadgeProvider = (badge) => badge.storage_provider || 'minio';

const getBadgesBucket = () => storage.getBucketName(
    BADGES_STORAGE_SCOPE,
    ['MINIO_BADGES_BUCKET'],
    storage.getProviderName(BADGES_STORAGE_SCOPE) === 'github' ? 'badges' : null
);

const getBadgeImageUrl = async (badge) => {
    if (badge.public_url || badge.download_url) {
        return badge.public_url || badge.download_url;
    }

    const objectName = getBadgeObjectName(badge);
    if (!objectName) {
        return badge.url || null;
    }

    return storage.getDownloadUrl(BADGES_STORAGE_SCOPE, {
        provider: getBadgeProvider(badge),
        bucket: getBadgesBucket(),
        objectName,
    });
};

const createUserRecord = async ({ user_name, password, email, role = ROLES.USER, status = 0, osu_uid, avatar }) => {
    const data = {
        user_name,
        email,
        role: normalizeRole(role) ?? ROLES.USER,
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
    const { search } = req.query;
    const { page, limit, offset } = parsePagination(req.query, { defaultPageSize: 20, maxPageSize: 50 });
    try {
        const whereCondition = {};
        if (search) {
            whereCondition.user_name = {
                [Op.like]: `%${search}%`
            };
        }
        const { count, rows } = await User.findAndCountAll(
            {
                attributes: { exclude: ['password'] } ,
                where: whereCondition,
                order: [['created_time', 'DESC']],
                offset,
                limit
            }
        );
        const totalPages = Math.ceil(count / limit);
        res.status(200).json({ data: rows, page, pageSize: limit, totalPages, total: count });
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
        const canViewPrivateFields = isSelf || req.user?.role === ROLES.ADMIN;
        const user = await User.findByPk(req.params.user_id, {
            attributes: canViewPrivateFields ? { exclude: ['password'] } : PUBLIC_USER_DETAIL_FIELDS,
            include: [
                {
                    model: Badge,
                    as: 'badges',
                    through: { attributes: [] }
                }
            ]
        });
        if (!user) {
            return res.status(404).json({ message: req.t('user.notFound') });
        }

        // 获取badge
        const userData = user.toJSON();
        if (userData.badges && userData.badges.length > 0) {
            const signedBadge = userData.badges.map(async (badge) => {
                const signedUrl = await getBadgeImageUrl(badge);
                delete badge.minio_img_name;
                if (badge.url) {
                    delete badge.url;
                }
                badge.signedUrl = signedUrl;
                return badge;
            });
            userData.badges = await Promise.all(signedBadge);
        }
        res.status(200).json({ data: userData });
    } catch (err) {
        res.status(500).json({ message: req.t('user.getFailed') });
    }
};

// 更新用户
const updateUser = async (req, res) => {
    const user_id = req.user.user_id;
    const role = req.user.role;
    try {
        const user = await User.findByPk(req.params.user_id);
        if (!user) {
            return res.status(404).json({ message: req.t('user.notFound') });
        }
        const isAdmin = role === ROLES.ADMIN;
        const isOwner = user.user_id === user_id;
        if (isAdmin || isOwner) {
            const allowedFields = isAdmin ? ADMIN_UPDATE_FIELDS : USER_SELF_UPDATE_FIELDS;
            const updateData = pickDefined(req.body, allowedFields);

            if (Object.prototype.hasOwnProperty.call(updateData, 'role')) {
                const normalizedRole = normalizeRole(updateData.role);
                if (normalizedRole === undefined) {
                    delete updateData.role;
                } else {
                    updateData.role = normalizedRole;
                }
            }

            if (updateData.password) {
                updateData.password = await bcrypt.hash(updateData.password, 10);
            } else {
                delete updateData.password;
            }

            await user.update(updateData);
            res.status(200).json({ message: req.t('user.updateSuccess') });
        } else {
            res.status(403).json({ message: req.t('user.noPermission') });
        }
    } catch (err) {
        res.status(500).json({ message: req.t('user.updateFailed') });
    }
};

// 删除用户
const deleteUser = async (req, res) => {
    try {
        const user = await User.findByPk(req.params.user_id);
        if (!user) {
            return res.status(404).json({ message: req.t('user.notFound') });
        }
        await user.destroy();
        res.status(200).json({ message: req.t('user.deleteSuccess') });
    } catch (err) {
        res.status(500).json({ message: req.t('user.deleteFailed') });
    }
};

// 根据token获取用户信息
const getUserInfo = async (req, res) => {
    const user_id = req.user.user_id;
    try {
        const user = await User.findByPk(user_id, {
            attributes: { exclude: ['password'] }
        });
        if (!user) {
            return res.status(404).json({ message: req.t('user.notFound') });
        }
        res.status(200).json({ data: user });
    } catch (error) {
        res.status(500).json({ message: req.t('user.getFailed') });
    }
}

module.exports = {
    createUser,
    createUserRecord,
    getUsers,
    searchUsers,
    getUserById,
    updateUser,
    deleteUser,
    getUserInfo,
};

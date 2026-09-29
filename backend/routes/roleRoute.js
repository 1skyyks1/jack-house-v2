const express = require('express');
const router = express.Router();
const checkAuth = require('../middleware/authMiddleware');
const { requirePermission } = checkAuth;
const { PERMISSIONS } = require('../config/permissions');
const permissionService = require('../services/permissionService');
const { Role, User } = require('../models/index');
const sequelize = require('../config/db');

/**
 * 角色与权限管理路由
 * 用户管理权限可读取；角色分配和权限编辑仅允许超级管理员
 */

// 四个公开角色标识代码
const PUBLIC_ROLE_CODES = ['admin', 'organizer', 'moderator', 'pack_reviewer'];

// 0. 公开角色展示列表（免鉴权，供身份介绍页查看职责及属于各身份的用户）
router.get('/public', async (req, res) => {
    try {
        const roles = await Role.findAll({
            where: {
                role_code: PUBLIC_ROLE_CODES
            },
            attributes: ['role_id', 'role_code', 'role_name', 'name_zh', 'name_en', 'description'],
            order: [['role_id', 'ASC']],
            include: [{
                model: User,
                as: 'users',
                attributes: ['user_id', 'user_name', 'avatar', 'status'],
                where: { status: 0 },
                required: false,
                through: { attributes: [] },
                include: [{
                    model: Role,
                    as: 'roles',
                    attributes: ['role_code'],
                    through: { attributes: [] }
                }]
            }]
        });

        const isEn = req.language === 'en' || (req.headers['accept-language'] || '').toLowerCase().startsWith('en');
        // 严格白名单构造返回对象，禁止暴露 permissions、is_system、时间字段及自定义角色
        const data = roles
            .filter(role => PUBLIC_ROLE_CODES.includes(role.role_code))
            .map(role => {
                const defaultZh = req.t ? req.t(`rbacRole.${role.role_code}.name`, role.role_name) : role.role_name;
                const defaultEn = req.t && req.t(`rbacRole.${role.role_code}.name`, { lng: 'en' }) !== `rbacRole.${role.role_code}.name`
                    ? req.t(`rbacRole.${role.role_code}.name`, { lng: 'en' })
                    : role.role_name;
                const nameZh = role.name_zh || defaultZh;
                const nameEn = role.name_en || defaultEn;
                const localizedName = isEn ? (nameEn || nameZh || defaultEn) : (nameZh || nameEn || defaultZh);
                const localizedDescription = req.t ? req.t(`rbacRole.${role.role_code}.description`, role.description || '') : (role.description || '');

                const rawUsers = role.users || [];
                const members = rawUsers.map(u => ({
                    user_id: u.user_id,
                    user_name: u.user_name,
                    avatar: u.avatar,
                    roles: (u.roles || [])
                        .map(r => r.role_code)
                        .filter(code => PUBLIC_ROLE_CODES.includes(code))
                }));

                return {
                    role_id: role.role_id,
                    role_code: role.role_code,
                    role_name: role.role_name,
                    name_zh: nameZh,
                    name_en: nameEn,
                    localized_name: localizedName,
                    localized_description: localizedDescription,
                    members
                };
            });

        res.json({ data });
    } catch (err) {
        console.error('[RoleRoute] Failed to get public roles:', err);
        res.status(500).json({ message: '获取角色信息失败' });
    }
});

// 1. 获取所有角色列表（支持根据请求语言本地化展示名称与描述）
router.get('/', checkAuth(), requirePermission(PERMISSIONS.USERS), async (req, res) => {
    try {
        const roles = await permissionService.getAllRoles();
        const data = roles.map(role => {
            const json = role.toJSON();
            const isEn = req.language === 'en' || (req.headers['accept-language'] || '').toLowerCase().startsWith('en');
            const defaultZh = req.t ? req.t(`rbacRole.${role.role_code}.name`, role.role_name) : role.role_name;
            const defaultEn = req.t && req.t(`rbacRole.${role.role_code}.name`, { lng: 'en' }) !== `rbacRole.${role.role_code}.name`
                ? req.t(`rbacRole.${role.role_code}.name`, { lng: 'en' })
                : role.role_name;
            json.name_zh = role.name_zh || defaultZh;
            json.name_en = role.name_en || defaultEn;
            json.localized_name = isEn ? (json.name_en || json.name_zh) : (json.name_zh || json.name_en);
            json.localized_description = req.t ? req.t(`rbacRole.${role.role_code}.description`, role.description || '') : (role.description || '');
            return json;
        });
        res.json({ data });
    } catch (err) {
        console.error('[RoleRoute] Failed to get roles:', err);
        res.status(500).json({ message: req.t ? req.t('common.error') : '获取角色列表失败' });
    }
});

// 2. 获取系统中定义的所有可选权限点
router.get('/available-permissions', checkAuth(), requirePermission(PERMISSIONS.USERS), (req, res) => {
    try {
        const list = permissionService.getAvailablePermissions();
        res.json({ data: list });
    } catch (err) {
        res.status(500).json({ message: '获取权限点列表失败' });
    }
});

// 3. 获取指定用户的角色列表
router.get('/user/:user_id', checkAuth(), requirePermission(PERMISSIONS.USERS), async (req, res) => {
    try {
        const userId = Number(req.params.user_id);
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: '用户不存在' });
        }

        const permData = await permissionService.getUserPermissions(userId);
        res.json({
            data: {
                userId,
                roles: permData.roles,
                permissions: permData.permissions,
                updated_time: user.updated_time || user.updatedAt,
            }
        });
    } catch (err) {
        console.error('[RoleRoute] Failed to get user roles:', err);
        res.status(500).json({ message: '获取用户角色失败' });
    }
});

// 4. 为指定用户分配角色
router.post('/user/:user_id', checkAuth(), requirePermission(PERMISSIONS.ALL), async (req, res) => {
    try {
        const userId = Number(req.params.user_id);
        const { roleCodes, expectedUpdatedAt } = req.body;

        if (!Array.isArray(roleCodes)) {
            return res.status(400).json({ message: 'roleCodes 必须为数组' });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: '用户不存在' });
        }

        const assignedRoles = await permissionService.assignUserRoles(userId, roleCodes, { expectedUpdatedAt });
        res.json({
            message: '角色分配成功',
            data: assignedRoles.map(r => r.role_code)
        });
    } catch (err) {
        console.error('[RoleRoute] Failed to assign user roles:', err);
        res.status(err.status || 500).json({ message: err.status ? err.message : '分配用户角色失败' });
    }
});

// 5. 创建新角色
router.post('/', checkAuth(), requirePermission(PERMISSIONS.ALL), async (req, res) => {
    try {
        const { role_code, role_name, name_zh, name_en, description, permissions } = req.body;
        const resolvedNameZh = (name_zh || role_name || '').trim();
        const resolvedNameEn = (name_en || role_name || '').trim();
        if (!role_code || (!resolvedNameZh && !resolvedNameEn)) {
            return res.status(400).json({ message: '角色标识与中英文名称不能为空' });
        }

        const existing = await Role.findOne({ where: { role_code } });
        if (existing) {
            return res.status(409).json({ message: '角色标识已存在' });
        }

        const newRole = await Role.create({
            role_code,
            role_name: resolvedNameZh || resolvedNameEn,
            name_zh: resolvedNameZh || resolvedNameEn,
            name_en: resolvedNameEn || resolvedNameZh,
            description,
            permissions: permissionService.validatePermissions(permissions ?? []),
            is_system: false
        });

        res.status(201).json({
            message: '角色创建成功',
            data: newRole
        });
    } catch (err) {
        console.error('[RoleRoute] Failed to create role:', err);
        res.status(err.status || 500).json({ message: err.status ? err.message : '创建角色失败' });
    }
});

// 6. 更新角色权限与基本信息
router.put('/:role_id', checkAuth(), requirePermission(PERMISSIONS.ALL), async (req, res) => {
    try {
        const roleId = Number(req.params.role_id);
        const { role_name, name_zh, name_en, description, permissions, expectedUpdatedAt } = req.body;

        const roleResult = await sequelize.transaction(async transaction => {
            // 若包含权限更新，先按 role_id 升序排他锁定角色记录，避免与超管检查产生死锁
            if (permissions !== undefined) {
                await Role.findAll({ order: [['role_id', 'ASC']], lock: transaction.LOCK.UPDATE, transaction });
            }
            const role = await Role.findByPk(roleId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!role) {
                throw Object.assign(new Error('角色不存在'), { status: 404 });
            }

            // 乐观锁检查
            if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== null) {
                const rawServerTime = role.updated_time || role.updatedAt;
                const serverTime = rawServerTime ? new Date(rawServerTime).getTime() : 0;
                const expectedTime = new Date(expectedUpdatedAt).getTime();
                if (serverTime !== expectedTime) {
                    throw Object.assign(new Error('数据已被其他用户修改，请重新载入最新数据'), { status: 409 });
                }
            }

            const updateData = {};
            if (name_zh !== undefined) {
                updateData.name_zh = name_zh.trim();
                updateData.role_name = name_zh.trim();
            } else if (role_name !== undefined) {
                updateData.role_name = role_name.trim();
                updateData.name_zh = role_name.trim();
            }
            if (name_en !== undefined) {
                updateData.name_en = name_en.trim();
            }
            if (description !== undefined) updateData.description = description;

            if (permissions !== undefined) {
                const validated = permissionService.validatePermissions(permissions);
                const currentHasStar = Array.isArray(role.permissions) && role.permissions.includes('*');
                const newHasStar = validated.includes('*');

                if (currentHasStar && !newHasStar) {
                    const hasOther = await permissionService.hasSuperAdminExcludingRole(roleId, transaction);
                    if (!hasOther) {
                        throw Object.assign(new Error('系统至少保留一个有效超级管理员'), { status: 400 });
                    }
                }
                updateData.permissions = validated;
            }

            updateData.updated_time = new Date();
            await role.update(updateData, { transaction });
            return role;
        });

        res.json({
            message: '角色更新成功',
            data: roleResult
        });
    } catch (err) {
        console.error('[RoleRoute] Failed to update role:', err);
        res.status(err.status || 500).json({ message: err.status ? err.message : '更新角色失败' });
    }
});

module.exports = router;

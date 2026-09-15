const { Role, UserRole, User } = require('../models/index');
const { ALL_PERMISSIONS_LIST } = require('../config/permissions');
const { resolveUserPermissions, hasPermission } = require('../utils/permissions');
const { Op } = require('sequelize');
const sequelize = require('../config/db');

const USER_ROLES_INCLUDE = [{
    model: Role,
    as: 'roles',
    attributes: ['role_id', 'role_code', 'role_name', 'name_zh', 'name_en', 'permissions'],
    through: { attributes: [] },
}];

function inputError(message, status = 400) {
    return Object.assign(new Error(message), { status });
}

class PermissionService {
    async getUserPermissions(userOrId) {
        let user = typeof userOrId === 'object' ? userOrId : null;
        if (!user || !Array.isArray(user.roles)) {
            const userId = user?.user_id ?? userOrId;
            user = await User.findByPk(userId, {
                attributes: ['user_id'],
                include: USER_ROLES_INCLUDE,
            });
        }
        return resolveUserPermissions(user);
    }

    hasPermission(permissionSet, permission) {
        return hasPermission(permissionSet, permission);
    }

    async getAllRoles() {
        return Role.findAll({ order: [['role_id', 'ASC']] });
    }

    getAvailablePermissions() {
        return ALL_PERMISSIONS_LIST;
    }

    validatePermissions(permissions) {
        const allowed = new Set(['*', ...ALL_PERMISSIONS_LIST]);
        if (!Array.isArray(permissions) || permissions.some(p => !allowed.has(p))) {
            throw inputError('权限必须是有效权限点组成的数组');
        }
        return [...new Set(permissions)];
    }

    /**
     * 判断排除某个用户后，系统是否仍存在至少一个有效超级管理员
     * 为避免并发撤销/删除最后两名超级管理员的竞态条件：
     * 1. 事务内按 role_id 升序排他锁定系统所有角色记录，防止并发事务同时进入超管判定临界区；
     * 2. 对 UserRole 关联表使用排他锁当前读（LOCK.UPDATE），确保即使在可重复读隔离级别下也能看到最新提交结果。
     * @param {number|string} excludeUserId 排除的用户 ID
     * @param {object} transaction 数据库事务
     */
    async hasOtherSuperAdmin(excludeUserId, transaction) {
        const excludeId = Number(excludeUserId);
        const lock = transaction?.LOCK?.UPDATE;
        const allRoles = await Role.findAll({
            where: {},
            order: [['role_id', 'ASC']],
            lock,
            transaction,
        });
        const starRoleIds = (allRoles || [])
            .filter(r => Array.isArray(r.permissions) && r.permissions.includes('*'))
            .map(r => r.role_id);

        if (starRoleIds.length > 0) {
            const otherCount = await UserRole.count({
                where: {
                    role_id: starRoleIds,
                    user_id: { [Op.ne]: excludeId },
                },
                lock,
                transaction,
            });
            if (otherCount > 0) return true;
        }

        return false;
    }

    /**
     * 判断排除某个角色的 '*' 权限后，系统是否仍存在至少一个有效超级管理员
     * 同样按升序锁定角色记录并使用当前读查询用户角色，防止并发修改角色权限导致超管归零。
     * @param {number|string} excludeRoleId 排除的角色 ID
     * @param {object} transaction 数据库事务
     */
    async hasSuperAdminExcludingRole(excludeRoleId, transaction) {
        const excludeId = Number(excludeRoleId);
        const lock = transaction?.LOCK?.UPDATE;
        const allRoles = await Role.findAll({
            where: {},
            order: [['role_id', 'ASC']],
            lock,
            transaction,
        });
        const otherStarRoleIds = (allRoles || [])
            .filter(r => r.role_id !== excludeId && Array.isArray(r.permissions) && r.permissions.includes('*'))
            .map(r => r.role_id);

        if (otherStarRoleIds.length > 0) {
            const count = await UserRole.count({
                where: { role_id: otherStarRoleIds },
                lock,
                transaction,
            });
            if (count > 0) return true;
        }

        return false;
    }

    async assignUserRoles(userId, roleCodes = [], options = {}) {
        if (!Array.isArray(roleCodes) || roleCodes.some(code => typeof code !== 'string' || !code.trim())) {
            throw inputError('roleCodes 必须为角色标识数组');
        }
        const codes = [...new Set(roleCodes)];
        const assign = async transaction => {
            const user = await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!user) throw inputError('用户不存在', 404);

            // 乐观锁检查：比对更新时间戳
            if (options.expectedUpdatedAt !== undefined && options.expectedUpdatedAt !== null) {
                const rawServerTime = user.updated_time || user.updatedAt;
                const serverTime = rawServerTime ? new Date(rawServerTime).getTime() : 0;
                const expectedTime = new Date(options.expectedUpdatedAt).getTime();
                if (serverTime !== expectedTime) {
                    throw inputError('数据已被其他用户修改，请重新载入最新数据', 409);
                }
            }

            const targetRoles = await Role.findAll({ where: { role_code: codes }, transaction });
            if (targetRoles.length !== codes.length) throw inputError('包含不存在的角色');

            // 超级管理员保留保护：若目标用户原本为有效超管，而新角色不含 '*'
            const currentPermissions = await this.getUserPermissions(user);
            const willRemainSuperAdmin = targetRoles.some(r => Array.isArray(r.permissions) && r.permissions.includes('*'));

            if (currentPermissions.isSuperAdmin && !willRemainSuperAdmin) {
                const hasOther = await this.hasOtherSuperAdmin(userId, transaction);
                if (!hasOther) {
                    throw inputError('系统至少保留一个有效超级管理员', 400);
                }
            }

            await UserRole.destroy({ where: { user_id: userId }, transaction });
            if (targetRoles.length) {
                await UserRole.bulkCreate(targetRoles.map(role => ({ user_id: userId, role_id: role.role_id })), { transaction });
            }
            await user.update({ updated_time: new Date() }, { transaction });
            return targetRoles;
        };
        return options.transaction ? assign(options.transaction) : sequelize.transaction(assign);
    }
}

module.exports = new PermissionService();
module.exports.USER_ROLES_INCLUDE = USER_ROLES_INCLUDE;

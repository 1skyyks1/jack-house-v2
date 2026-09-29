const assert = require('node:assert/strict');
const { test } = require('node:test');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const sequelize = require('../config/db');
const { User, Role, UserRole, Post, PackScore, PackMap } = require('../models');
const service = require('../services/permissionService');
const { resolveUserPermissions } = require('../utils/permissions');
const auth = require('../middleware/authMiddleware');
const { getCookieName } = require('../utils/authCookie');
const roleRouter = require('../routes/roleRoute');
const userController = require('../controllers/user/userController');
const postController = require('../controllers/post/postController');
const { listUserRecentScores } = require('../services/userRecentScoreService');

function response() {
    return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
function user(permissions = [], userId = 7) {
    return { user_id: userId, roles: [{ role_id: 5, role_code: 'custom', permissions }] };
}
function request(actor, body = {}, target = 8) {
    const effective = resolveUserPermissions(actor);
    return { user: actor, userPermissions: effective.permissionSet, userRoles: effective.roles,
        isSuperAdmin: effective.isSuperAdmin, body, params: { user_id: String(target) }, query: {}, t: key => key };
}
async function authorize(t, router, method, path, actor) {
    t.mock.method(User, 'findByPk', async () => actor);
    t.mock.method(jwt, 'verify', () => ({ userId: actor.user_id }));
    const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route;
    const req = { headers: { cookie: `${getCookieName()}=test-token` }, t: key => key };
    const res = response();
    let passed = false;
    for (const layer of route.stack.slice(0, 2)) {
        passed = false;
        await layer.handle(req, res, () => { passed = true; });
        if (!passed) break;
    }
    return { res, passed, req };
}

for (const permissions of [['admin'], ['users'], ['admin', 'events', 'badges'], ['admin', 'posts', 'postFiles'], ['admin', 'packTags']]) {
    test(`role mutation rejects ordinary permissions: ${permissions.join(',')}`, async t => {
        for (const [method, path] of [['post', '/user/:user_id'], ['post', '/'], ['put', '/:role_id']]) {
            const { res, passed } = await authorize(t, roleRouter, method, path, user(permissions));
            assert.equal(res.statusCode, 403);
            assert.equal(passed, false);
        }
    });
}
test('only RBAC superadmins can assign roles', async t => {
    assert.equal((await authorize(t, roleRouter, 'post', '/user/:user_id', { user_id: 7, roles: [] })).res.statusCode, 403);
    assert.equal((await authorize(t, roleRouter, 'post', '/user/:user_id', user(['*']))).passed, true);
});

test('roleRouter registers public route without auth middleware', () => {
    const route = roleRouter.stack.find(layer => layer.route?.path === '/public' && layer.route.methods.get)?.route;
    assert.ok(route, 'GET /public route should be registered');
    assert.equal(route.stack.length, 1, 'GET /public should have only handler without auth middleware');
});

test('GET /roles/public returns only 4 public roles without leaking permissions, is_system, timestamps or custom roles', async t => {
    const mockDbRoles = [
        {
            role_id: 1,
            role_code: 'admin',
            role_name: '超级管理员',
            name_zh: '管理员',
            name_en: 'Administrator',
            description: '核心管理团队',
            permissions: ['*'],
            is_system: true,
            created_time: '2026-01-01T00:00:00.000Z',
            updated_time: '2026-01-02T00:00:00.000Z',
            users: [
                {
                    user_id: 1,
                    user_name: 'SuperUser',
                    avatar: 'https://example.com/avatar1.png',
                    status: 0,
                    roles: [
                        { role_code: 'admin' },
                        { role_code: 'secret_auditor' } // 混杂的非公开角色
                    ]
                }
            ]
        },
        {
            role_id: 2,
            role_code: 'organizer',
            role_name: '活动策划',
            name_zh: '活动策划',
            name_en: 'Organizer',
            description: '赛事组织',
            permissions: ['events', 'badges'],
            is_system: true,
            created_time: '2026-01-01T00:00:00.000Z',
            updated_time: '2026-01-02T00:00:00.000Z',
            users: []
        },
        {
            role_id: 3,
            role_code: 'moderator',
            role_name: '投稿审核',
            name_zh: '投稿审核',
            name_en: 'Reviewer',
            description: '审核谱面',
            permissions: ['posts', 'postFiles'],
            is_system: true,
            created_time: '2026-01-01T00:00:00.000Z',
            updated_time: '2026-01-02T00:00:00.000Z',
            users: []
        },
        {
            role_id: 4,
            role_code: 'pack_reviewer',
            role_name: '叠包主理人',
            name_zh: '叠包主理人',
            name_en: 'Pack Curator',
            description: '图包维护',
            permissions: ['packTags'],
            is_system: true,
            created_time: '2026-01-01T00:00:00.000Z',
            updated_time: '2026-01-02T00:00:00.000Z',
            users: []
        },
        // 敏感的自定义内部角色，绝不可被公开接口返回
        {
            role_id: 5,
            role_code: 'custom_security_role',
            role_name: '内部安全员',
            name_zh: '内部安全员',
            name_en: 'Security Officer',
            description: '高危审计',
            permissions: ['internal_audit', 'db_dump'],
            is_system: false,
            created_time: '2026-01-01T00:00:00.000Z',
            updated_time: '2026-01-02T00:00:00.000Z',
            users: [{ user_id: 99, user_name: 'SecretAgent', avatar: null, status: 0, roles: [{ role_code: 'custom_security_role' }] }]
        }
    ];

    t.mock.method(Role, 'findAll', async (options = {}) => {
        const requestedCodes = options.where?.role_code;
        if (Array.isArray(requestedCodes)) {
            return mockDbRoles.filter(r => requestedCodes.includes(r.role_code));
        }
        return mockDbRoles;
    });

    const route = roleRouter.stack.find(layer => layer.route?.path === '/public' && layer.route.methods.get).route;
    const handler = route.stack[0].handle;

    const req = { language: 'zh', headers: {}, t: (key, fallback) => (typeof fallback === 'string' ? fallback : key) };
    const res = response();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body?.data), 'data 必须为数组');
    const returnedRoles = res.body.data;

    // 1. 严格只返回 4 个公开角色
    assert.equal(returnedRoles.length, 4, '只允许返回 4 个公开角色');
    const returnedCodes = returnedRoles.map(r => r.role_code);
    assert.deepEqual(returnedCodes, ['admin', 'organizer', 'moderator', 'pack_reviewer']);
    assert.equal(returnedCodes.includes('custom_security_role'), false, '禁止返回自定义角色');

    // 2. 验证每个角色对象禁止泄露权限、系统标识与时间字段
    for (const role of returnedRoles) {
        assert.equal('permissions' in role, false, '公开角色禁止暴露 permissions 权限');
        assert.equal('is_system' in role, false, '公开角色禁止暴露 is_system 字段');
        assert.equal('created_time' in role, false, '公开角色禁止暴露 created_time 字段');
        assert.equal('updated_time' in role, false, '公开角色禁止暴露 updated_time 字段');
        assert.equal('createdAt' in role, false, '公开角色禁止暴露 createdAt 字段');
        assert.equal('updatedAt' in role, false, '公开角色禁止暴露 updatedAt 字段');

        // 验证前端展示必要字段存在
        assert.ok(typeof role.role_id === 'number', 'role_id 必须存在且为数字');
        assert.ok(typeof role.role_code === 'string', 'role_code 必须存在且为字符串');
        assert.ok(typeof role.role_name === 'string', 'role_name 必须存在且为字符串');
        assert.ok(Array.isArray(role.members), 'members 必须为数组');
    }

    // 3. 验证成员角色列表中剔除了非公开角色
    const adminRole = returnedRoles.find(r => r.role_code === 'admin');
    assert.equal(adminRole.members.length, 1);
    assert.deepEqual(adminRole.members[0].roles, ['admin'], '成员角色列表中必须剔除非公开角色');
});

for (const [file, method, path, permission] of [
    ['tagRoute', 'get', '/admin', 'packTags'],
    ['postFileRoute', 'put', '/review/:file_id', 'postFiles'],
    ['badgeRoute', 'post', '/', 'badges'],
    ['eventRoute', 'post', '/', 'events'],
    ['packRoute', 'patch', '/:pack_id/recommendation', 'packTags'],
    ['noticeRoute', 'post', '/', 'announcement'],
    ['tournamentRoute', 'post', '/', 'tournaments'],
]) {
    test(`${permission} grants only its intended route access`, async t => {
        const router = require(`../routes/${file}`);
        assert.equal((await authorize(t, router, method, path, user([permission]))).passed, true);
        assert.equal((await authorize(t, router, method, path, user(['admin']))).res.statusCode, 403);
    });
}

test('associated roles are authoritative and unassigned users have no permissions', async () => {
    assert.equal((await service.getUserPermissions(user(['posts']))).isSuperAdmin, false);
    assert.equal((await service.getUserPermissions(user([]))).isSuperAdmin, false);
    assert.deepEqual((await service.getUserPermissions({ roles: [] })).permissions, []);
});
test('ID lookup uses fetched RBAC roles and database errors propagate', async t => {
    t.mock.method(User, 'findByPk', async () => ({ user_id: 7, roles: [{ role_code: 'admin', permissions: ['*'] }] }));
    assert.equal((await service.getUserPermissions(7)).isSuperAdmin, true);
    t.mock.method(User, 'findByPk', async () => { throw new Error('database unavailable'); });
    await assert.rejects(service.getUserPermissions({ user_id: 7 }), /database unavailable/);
});

function assignmentFixture(t, otherSuperAdmin = true) {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const actor = { user_id: 7, roles: [{ role_id: 1, role_code: 'admin', permissions: ['*'] }], updated_time: new Date('2026-01-01T00:00:00.000Z') };
    const calls = [];
    const rolesDb = [
        { role_id: 1, role_code: 'admin', permissions: ['*'] },
        { role_id: 5, role_code: 'moderator', permissions: ['posts'] },
    ];
    actor.update = async (values, options) => { assert.equal(options.transaction, transaction); Object.assign(actor, values); };
    t.mock.method(sequelize, 'transaction', async callback => callback(transaction));
    t.mock.method(User, 'findByPk', async (_id, options) => { assert.equal(options.lock, 'UPDATE'); return actor; });
    t.mock.method(Role, 'findAll', async (options = {}) => {
        const where = options.where || {};
        if (Array.isArray(where.role_code)) {
            return rolesDb.filter(r => where.role_code.includes(r.role_code));
        }
        return otherSuperAdmin ? rolesDb : [];
    });
    t.mock.method(UserRole, 'destroy', async options => { assert.equal(options.transaction, transaction); calls.push('destroy'); actor.roles = []; });
    t.mock.method(UserRole, 'bulkCreate', async (rows, options) => { assert.equal(options.transaction, transaction); calls.push('create'); actor.roles = rows.map(row => ({ ...row, role_code: 'moderator', permissions: ['posts'] })); });
    t.mock.method(UserRole, 'count', async () => otherSuperAdmin ? 1 : 0);
    return { actor, calls };
}
test('clearing assigned roles removes all permissions', async t => {
    const { actor } = assignmentFixture(t, true);
    await service.assignUserRoles(7, []);
    assert.deepEqual((await service.getUserPermissions(actor)).permissions, []);
});
test('downgrade retains only selected permissions and unknown role codes do not erase assignments', async t => {
    const { actor, calls } = assignmentFixture(t, true);
    await assert.rejects(service.assignUserRoles(7, ['typo']), { status: 400 });
    assert.deepEqual(calls, []);
    await service.assignUserRoles(7, ['moderator', 'moderator']);
    assert.deepEqual((await service.getUserPermissions(actor)).permissions, ['posts']);
    assert.deepEqual(calls, ['destroy', 'create']);
});
test('role permissions reject malformed and unknown values', () => {
    for (const value of [null, '*', {}, ['unknown'], [3]]) assert.throws(() => service.validatePermissions(value), { status: 400 });
    assert.deepEqual(service.validatePermissions(['posts', 'posts']), ['posts']);
    assert.deepEqual(service.validatePermissions(['*']), ['*']);
});

test('clearing or downgrading the last superadmin rejects with 400', async t => {
    assignmentFixture(t, false);
    await assert.rejects(service.assignUserRoles(7, []), {
        status: 400,
        message: '系统至少保留一个有效超级管理员'
    });
    await assert.rejects(service.assignUserRoles(7, ['moderator']), {
        status: 400,
        message: '系统至少保留一个有效超级管理员'
    });
});

test('assignUserRoles rejects with 409 on optimistic lock mismatch', async t => {
    assignmentFixture(t, false);
    await assert.rejects(
        service.assignUserRoles(7, ['moderator'], { expectedUpdatedAt: '2020-01-01T00:00:00.000Z' }),
        { status: 409, message: '数据已被其他用户修改，请重新载入最新数据' }
    );
});

test('user managers cannot take over existing privileged accounts', async t => {
    t.mock.method(sequelize, 'transaction', async callback => callback({ LOCK: { UPDATE: 'UPDATE' } }));
    t.mock.method(User, 'findByPk', async () => user(['*'], 8));
    const updateRes = response();
    await userController.updateUser(request(user(['users']), { password: 'attempt' }), updateRes);
    assert.equal(updateRes.statusCode, 403);
    const deleteRes = response();
    await userController.deleteUser(request(user(['users'])), deleteRes);
    assert.equal(deleteRes.statusCode, 403);
});
test('deleting the last superadmin rejects with 400', async t => {
    t.mock.method(sequelize, 'transaction', async callback => callback({ LOCK: { UPDATE: 'UPDATE' } }));
    t.mock.method(User, 'findByPk', async () => user(['*'], 8));
    t.mock.method(service, 'hasOtherSuperAdmin', async () => false);
    const deleteRes = response();
    await userController.deleteUser(request(user(['*']), {}, 8), deleteRes);
    assert.equal(deleteRes.statusCode, 400);
    assert.equal(deleteRes.body.message, '系统至少保留一个有效超级管理员');
});
test('getUsers returns RBAC roles when requester has users permission', async t => {
    const mockUsers = [
        {
            user_id: 10,
            user_name: 'ModUser',
            roles: [{ role_id: 3, role_code: 'moderator', permissions: ['posts'] }],
            toJSON() { return { user_id: 10, user_name: 'ModUser' }; }
        }
    ];
    t.mock.method(User, 'findAndCountAll', async (options) => {
        assert.equal(options.distinct, true);
        assert.deepEqual(options.include, service.USER_ROLES_INCLUDE);
        return { count: 1, rows: mockUsers };
    });
    const res = response();
    await userController.getUsers(request(user(['users'])), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.data[0].roles, ['moderator']);
});

test('getUserInfo reuses the authenticated user without another lookup and strips password defensively', async t => {
    let lookupCount = 0;
    t.mock.method(User, 'findByPk', async () => {
        lookupCount += 1;
        return null;
    });
    const req = {
        user: { toJSON: () => ({ user_id: 7, user_name: 'Tester', password: 'hash', roles: [{ role_code: 'moderator' }] }) },
        userRoles: ['moderator'],
        userPermissions: new Set(['posts']),
        t: key => key,
    };
    const res = response();
    await userController.getUserInfo(req, res);
    assert.equal(lookupCount, 0);
    assert.equal('password' in res.body.data, false);
    assert.deepEqual(res.body.data.roles, ['moderator']);
    assert.deepEqual(res.body.data.permissions, ['posts']);
});

test('PUT /roles/:role_id rejects with 409 on optimistic lock mismatch and 400 on removing last superadmin', async t => {
    const mockRole = {
        role_id: 1,
        role_code: 'admin',
        role_name: 'Admin',
        permissions: ['*'],
        updated_time: new Date('2026-01-01T00:00:00.000Z'),
        update: async () => {},
    };
    t.mock.method(sequelize, 'transaction', async callback => callback({ LOCK: { UPDATE: 'UPDATE' } }));
    t.mock.method(Role, 'findAll', async () => [mockRole]);
    t.mock.method(Role, 'findByPk', async () => mockRole);
    t.mock.method(service, 'hasSuperAdminExcludingRole', async () => false);

    const route = roleRouter.stack.find(layer => layer.route?.path === '/:role_id' && layer.route.methods.put).route;
    const handler = route.stack.at(-1).handle;

    // 1. 乐观锁冲突 409
    const conflictRes = response();
    const reqConflict = request(user(['*']), { expectedUpdatedAt: '2020-01-01T00:00:00.000Z' });
    reqConflict.params = { role_id: '1' };
    await handler(reqConflict, conflictRes);
    assert.equal(conflictRes.statusCode, 409);

    // 2. 移除唯一超管星号权限 400
    const lastAdminRes = response();
    const reqRemoveStar = request(user(['*']), { permissions: ['users'] });
    reqRemoveStar.params = { role_id: '1' };
    await handler(reqRemoveStar, lastAdminRes);
    assert.equal(lastAdminRes.statusCode, 400);
    assert.equal(lastAdminRes.body.message, '系统至少保留一个有效超级管理员');
});
test('post moderation works for RBAC users but cannot turn a regular post into an announcement', async t => {
    let destroyed = false;
    t.mock.method(Post, 'findByPk', async () => ({ post_id: 1, user_id: 8, type: 0, destroy: async () => { destroyed = true; } }));
    const req = request(user(['posts']), { type: 3 }); req.params.post_id = '1';
    const res = response();
    await postController.updatePost(req, res);
    assert.equal(res.statusCode, 403);
    await postController.deletePost(req, response());
    assert.equal(destroyed, true);
});
test('RBAC tournament administrators bypass staff checks', async () => {
    const { isHost, isCreatorHost } = require('../middleware/tournamentAuth');
    for (const guard of [isHost, isCreatorHost]) {
        let passed = false;
        await guard(request(user(['tournaments'])), response(), () => { passed = true; });
        assert.equal(passed, true);
    }
});
test('all user route callbacks register successfully', () => {
    const router = require('../routes/userRoute');
    const recent = router.stack.find(layer => layer.route?.path === '/:user_id/recent-scores');
    assert.equal(recent.route.stack.at(-1).handle, userController.getUserRecentScores);
});
test('recent scores filter by user and featured pack, paginate and serialize score details', async t => {
    t.mock.method(PackScore, 'findAndCountAll', async options => {
        assert.equal(options.where.user_id, 7);
        assert.equal(options.include[0].where.leaderboard_enabled, true);
        assert.equal(options.limit, 50); assert.equal(options.offset, 5);
        assert.deepEqual(options.order, [['played_at', 'DESC'], ['id', 'DESC']]);
        return { count: 8, rows: [{ pack_id: 3, beatmap_id: 4, toJSON: () => ({ id: 1, pack_id: 3, beatmap_id: 4, accuracy: '0.98', score: 100, build_id: 2, mods: '[{"acronym":"DT"}]', statistics: '{}', pack: { pack_id: 3 } }) }] };
    });
    t.mock.method(PackMap, 'findAll', async () => [{ pack_id: 3, beatmap_id: 4, rating: '2.50', version: 'Hard' }]);
    const result = await listUserRecentScores(7, { limit: '100', offset: '5' });
    assert.equal(result.nextOffset, 6); assert.equal(result.hasMore, true);
    assert.equal(result.data[0].accuracy, 0.98); assert.equal(result.data[0].is_lazer, true);
    assert.equal(result.data[0].beatmap.rating, 2.5);
    assert.deepEqual(result.data[0].mods, [{ acronym: 'DT' }]);
});

test('concurrent demotions of the last two superadmins serialize and reject the second request', async t => {
    let activeLockHolder = null;
    const lockWaiters = [];
    const acquireLock = async (holder) => {
        if (activeLockHolder && activeLockHolder !== holder) {
            await new Promise(resolve => lockWaiters.push({ holder, resolve }));
        }
        activeLockHolder = holder;
    };
    const releaseLock = (holder) => {
        if (activeLockHolder === holder) {
            activeLockHolder = null;
            if (lockWaiters.length > 0) {
                const next = lockWaiters.shift();
                activeLockHolder = next.holder;
                next.resolve();
            }
        }
    };

    let userRoles = [
        { user_id: 1, role_id: 1 },
        { user_id: 2, role_id: 1 },
    ];
    const rolesDb = [
        { role_id: 1, role_code: 'admin', permissions: ['*'] },
        { role_id: 5, role_code: 'moderator', permissions: ['posts'] },
    ];
    const usersDb = {
        1: { user_id: 1, roles: [{ role_id: 1, role_code: 'admin', permissions: ['*'] }], updated_time: new Date('2026-01-01T00:00:00.000Z'), update: async () => {} },
        2: { user_id: 2, roles: [{ role_id: 1, role_code: 'admin', permissions: ['*'] }], updated_time: new Date('2026-01-01T00:00:00.000Z'), update: async () => {} },
    };

    let txCounter = 0;
    t.mock.method(sequelize, 'transaction', async callback => {
        const txId = ++txCounter;
        const tx = { id: txId, LOCK: { UPDATE: 'UPDATE' } };
        try {
            return await callback(tx);
        } finally {
            releaseLock(txId);
        }
    });

    t.mock.method(User, 'findByPk', async (id, options) => {
        assert.equal(options?.lock, 'UPDATE');
        return usersDb[id] || null;
    });

    t.mock.method(Role, 'findAll', async (options = {}) => {
        if (options.lock === 'UPDATE') {
            assert.deepEqual(options.order, [['role_id', 'ASC']]);
            await acquireLock(options.transaction.id);
        }
        const where = options.where || {};
        if (Array.isArray(where.role_code)) {
            return rolesDb.filter(r => where.role_code.includes(r.role_code));
        }
        return rolesDb;
    });

    t.mock.method(UserRole, 'count', async (options = {}) => {
        assert.equal(options?.lock, 'UPDATE');
        const roleIds = options.where?.role_id || [];
        const excludeUserId = options.where?.user_id?.[Op.ne];
        return userRoles.filter(ur => roleIds.includes(ur.role_id) && ur.user_id !== excludeUserId).length;
    });

    t.mock.method(UserRole, 'destroy', async options => {
        const userId = options.where.user_id;
        userRoles = userRoles.filter(ur => ur.user_id !== userId);
        if (usersDb[userId]) usersDb[userId].roles = [];
    });

    t.mock.method(UserRole, 'bulkCreate', async (rows, _options) => {
        for (const row of rows) userRoles.push(row);
    });

    // 两个超管同时发起角色降级
    const results = await Promise.allSettled([
        service.assignUserRoles(1, ['moderator']),
        service.assignUserRoles(2, ['moderator']),
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, '恰好一个超管降级请求成功');
    assert.equal(rejected.length, 1, '另一个并发请求被拦截');
    assert.equal(rejected[0].reason.status, 400);
    assert.equal(rejected[0].reason.message, '系统至少保留一个有效超级管理员');

    // 最终数据库中必须严格保留且只保留 1 个有效超级管理员
    const remainingSuperAdmins = userRoles.filter(ur => ur.role_id === 1);
    assert.equal(remainingSuperAdmins.length, 1, '系统最终保证有且仅有1名超级管理员存留');
});

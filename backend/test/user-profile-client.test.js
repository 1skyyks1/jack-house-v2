const assert = require('node:assert/strict');
const { test } = require('node:test');
const sequelize = require('../config/db');
const { User } = require('../models');
const permissions = require('../services/permissionService');
const controller = require('../controllers/user/userController');

function response() {
    return { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

function request(body, actorId = 7) {
    return { params: { user_id: '7' }, body, user: { user_id: actorId },
        userPermissions: new Set(), t: key => key };
}

function fixture(t) {
    const updates = [];
    t.mock.method(sequelize, 'transaction', async callback => callback({ LOCK: { UPDATE: 'UPDATE' } }));
    t.mock.method(permissions, 'getUserPermissions', async () => ({ permissions: [] }));
    t.mock.method(User, 'findByPk', async () => ({
        user_id: 7, update: async data => updates.push(data),
    }));
    return updates;
}

test('owners can save either default client without changing protected profile fields', async t => {
    const updates = fixture(t);
    for (const client of ['lazer', 'stable']) {
        const res = response();
        await controller.updateUser(request({ default_pp_client: client, user_name: 'ignored', status: 2 }), res);
        assert.equal(res.statusCode, 200);
    }
    assert.deepEqual(updates, [{ default_pp_client: 'lazer' }, { default_pp_client: 'stable' }]);
});

test('invalid default clients fail before any fields are saved', async t => {
    const updates = fixture(t);
    for (const client of [null, '', 'Lazer', 'unknown', 1, {}, ['stable']]) {
        const res = response();
        await controller.updateUser(request({ default_pp_client: client, qq: 'would-change' }), res);
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.message, 'user.invalidPPClient');
    }
    assert.deepEqual(updates, []);
    const res = response();
    await controller.updateUser(request({ qq: 'existing-client-unchanged' }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(updates, [{ qq: 'existing-client-unchanged' }]);
});

test('ordinary users cannot change another user’s default client', async t => {
    const updates = fixture(t);
    const res = response();
    await controller.updateUser(request({ default_pp_client: 'lazer' }, 8), res);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(updates, []);
});

test('public profiles return the owner’s default client while excluding private fields', async t => {
    t.mock.method(User, 'findByPk', async (_id, options) => {
        assert.ok(options.attributes.includes('default_pp_client'));
        assert.ok(!options.attributes.includes('email'));
        assert.ok(!options.attributes.includes('password'));
        return { toJSON: () => ({ user_id: 7, default_pp_client: 'lazer', badges: [] }) };
    });
    const res = response();
    await controller.getUserById({ params: { user_id: '7' }, t: key => key }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.default_pp_client, 'lazer');
});

test('profile client persists independently of existing user data (rolled back)', {
    skip: process.env.PROFILE_CLIENT_DB_TEST !== 'true',
}, async () => {
    const transaction = await sequelize.transaction();
    try {
        const user = await User.findOne({ transaction, lock: transaction.LOCK.UPDATE, order: [['user_id', 'ASC']] });
        assert.ok(user);
        const before = user.toJSON();
        for (const client of ['lazer', 'stable']) {
            await user.update({ default_pp_client: client }, { transaction, logging: false });
            await user.reload({ transaction, logging: false });
            const { default_pp_client, updated_time, ...after } = user.toJSON();
            const { default_pp_client: oldClient, updated_time: oldUpdatedTime, ...existing } = before;
            assert.equal(default_pp_client, client);
            assert.deepEqual(after, existing);
        }
    } finally {
        await transaction.rollback();
        await sequelize.close();
    }
});

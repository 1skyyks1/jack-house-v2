const assert = require('node:assert/strict');
const { test } = require('node:test');
const { User } = require('../models');
const { getUserById } = require('../controllers/user/userController');

async function getProfile(t, badges) {
    t.mock.method(User, 'findByPk', async (_id, options) => {
        const awardTimestamp = User.associations.badges.through.model._timestampAttributes.createdAt;
        const badgesInclude = options.include.find((include) => include.as === 'badges');
        assert.ok(badgesInclude.through.attributes.includes(awardTimestamp));
        return {
            roles: [],
            toJSON: () => ({ user_id: 7, roles: [], badges: structuredClone(badges) }),
        };
    });
    const res = {
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
    await getUserById({ params: { user_id: '7' }, t: (key) => key }, res);
    assert.equal(res.statusCode, 200);
    return res.body.data.badges;
}

function badge(id, acquiredAt, createdAt = '2025-01-01T00:00:00Z') {
    return {
        id,
        name: `Badge ${id}`,
        created_time: createdAt,
        user_badges: { created_time: acquiredAt },
        storage_provider: 'github',
        public_url: `https://cdn.example.test/badge-${id}.png`,
    };
}

test('profile orders badges by acquisition, independent of badge creation or ID', async (t) => {
    const badges = await getProfile(t, [
        badge(90, '2026-08-01T00:00:00Z', '2026-07-01T00:00:00Z'),
        badge(3, '2026-09-10T00:00:00Z'),
        badge(50, '2026-09-01T00:00:00Z'),
    ]);
    assert.deepEqual(badges.map(({ id }) => id), [3, 50, 90]);
    assert.equal(badges[0].acquired_at, '2026-09-10T00:00:00Z');
    assert.equal(badges[0].signedUrl, 'https://cdn.example.test/badge-3.png');
    assert.ok(badges.every((item) => !Object.hasOwn(item, 'user_badges')));
});

test('equal acquisition times keep their order and undated badges follow dated badges', async (t) => {
    const badges = await getProfile(t, [
        badge(8, null),
        badge(2, '2026-09-10T00:00:00Z'),
        badge(1, '2026-09-10T00:00:00Z'),
        badge(9, undefined),
    ]);
    assert.deepEqual(badges.map(({ id }) => id), [2, 1, 8, 9]);
    assert.equal(badges[2].acquired_at, null);
    assert.deepEqual(await getProfile(t, []), []);
});

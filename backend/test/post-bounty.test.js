const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const sequelize = require('../config/db');
const { Post, PostPack, PostTranslation, Pack, Tag, User, PackMap, RichTextAssetReference } = require('../models');
const postController = require('../controllers/post/postController');
const packController = require('../controllers/pack/packController');
const router = require('../routes/postRoute');
const service = require('../services/postBountyService');
const { migratePostBounties } = require('../scripts/migrate-post-bounties');

const now = new Date('2030-01-01T00:00:00.000Z');
const future = '2099-12-01T12:30:00.000Z';
const translations = [{ language: 'zh', title: 'FC 挑战', content: '<p>达成 FC，截图回复。</p>' }];
function response() {
    return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
function request(body = {}, permissions = [], userId = 7) {
    return { body, user: { user_id: userId }, userPermissions: new Set(permissions),
        params: { post_id: '12', pack_id: '42' }, query: {}, t: key => key };
}
function fixture(t, values = {}) {
    const events = [];
    const transaction = { LOCK: { UPDATE: 'UPDATE' }, finished: undefined,
        async commit() { this.finished = 'commit'; events.push('commit'); },
        async rollback() { this.finished = 'rollback'; events.push('rollback'); },
    };
    const post = { post_id: 12, user_id: 7, type: 4, end: null, bounty_closed_at: null,
        ...values, changed() {}, async save(options) { assert.equal(options.transaction, transaction); events.push('save'); },
    };
    t.mock.method(sequelize, 'transaction', async () => transaction);
    t.mock.method(Post, 'findByPk', async (_id, options) => {
        if (options?.transaction) assert.equal(options.lock, 'UPDATE');
        return post;
    });
    t.mock.method(Post, 'create', async (data, options) => {
        assert.equal(options.transaction, transaction);
        events.push('create');
        Object.assign(post, data);
        return post;
    });
    t.mock.method(Pack, 'findAll', async options => {
        assert.equal(options.transaction, transaction);
        return options.where.pack_id[Op.in].map(pack_id => ({ pack_id }));
    });
    t.mock.method(PostPack, 'destroy', async options => {
        assert.equal(options.transaction, transaction); events.push('unlink');
    });
    t.mock.method(PostPack, 'bulkCreate', async (rows, options) => {
        assert.equal(options.transaction, transaction); events.push(rows);
    });
    t.mock.method(PostTranslation, 'findOne', async options => {
        assert.equal(options.transaction, transaction); return null;
    });
    t.mock.method(PostTranslation, 'create', async (data, options) => {
        assert.equal(options.transaction, transaction); events.push(data); return { ...data, post_translation_id: 1 };
    });
    t.mock.method(RichTextAssetReference, 'findAll', async options => {
        assert.equal(options.transaction, transaction); return [];
    });
    return { post, transaction, events };
}

test('bounty activity includes permanent and future deadlines, excludes exact deadline and manual closure', () => {
    for (const [post, status] of [
        [{ type: 0 }, null], [{ type: 4, end: null }, 'active'],
        [{ type: 4, end: '2030-01-02T00:00:00Z' }, 'active'],
        [{ type: 4, end: now.toISOString() }, 'expired'],
        [{ type: 4, end: '2029-01-01T00:00:00Z' }, 'expired'],
        [{ type: 4, end: null, bounty_closed_at: now }, 'closed'],
        [{ type: 4, end: '2029-01-01T00:00:00Z', bounty_closed_at: now }, 'closed'],
    ]) assert.equal(service.getBountyStatus(post, now), status);
});

test('deadline accepts permanent and explicit timezone, permits unchanged expired date', () => {
    assert.equal(service.parseBountyEnd(null), null);
    assert.equal(service.parseBountyEnd(undefined), null);
    assert.equal(service.parseBountyEnd('2030-01-02T08:00:00+08:00', { now }).toISOString(), '2030-01-02T00:00:00.000Z');
    const end = '2029-01-01T00:00:00Z';
    assert.equal(service.parseBountyEnd(end, { now, existingEnd: end }).toISOString(), '2029-01-01T00:00:00.000Z');
});

test('deadline rejects malformed, timezone-free, impossible and newly elapsed times', () => {
    for (const end of ['', 'permanent', false, 0, [], 'invalid', '2030-01-02',
        '2030-01-02T12:00', '2030-02-30T12:00:00Z', '2030-13-01T00:00:00Z', '2030-01-02T24:00:00Z',
        now.toISOString(), '2029-01-01T00:00:00Z']) {
        assert.throws(() => service.parseBountyEnd(end, { now }), service.BountyValidationError, String(end));
    }
});

test('pack links reject duplicates, invalid IDs, missing packs and excessive selections', async t => {
    t.mock.method(Pack, 'findAll', async () => [{ pack_id: 42 }]);
    assert.deepEqual(await service.validateBountyPackIds([42]), [42]);
    for (const ids of [undefined, [], [42, 42], [0], [-1], [1.2], ['42'], [2147483648], Array.from({ length: 6 }, (_, i) => i + 1)]) {
        await assert.rejects(service.validateBountyPackIds(ids), { key: 'post.invalidBountyPacks' });
    }
    await assert.rejects(service.validateBountyPackIds([42, 43]), { key: 'post.bountyPackNotFound' });
});

test('five pack links are accepted; six fail create and update before any writes', async t => {
    const { transaction } = fixture(t);
    const five = [1, 2, 3, 4, 5];
    const six = [...five, 6];
    assert.deepEqual(await service.validateBountyPackIds(five, transaction), five);
    for (const action of [postController.createPost, postController.updatePost]) {
        t.mock.restoreAll();
        const { events } = fixture(t);
        const res = response();
        await action(request({ type: 4, pack_ids: six, translations, end: future }), res);
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.message, 'post.invalidBountyPacks');
        assert.deepEqual(events, ['rollback']);
    }
});

test('rules require meaningful sanitized content in a supported language', () => {
    service.validateBountyTranslations(translations);
    service.validateBountyTranslations([...translations, { language: 'en', title: '', content: '' }]);
    for (const items of [undefined, [], [{ language: 'fr', title: 'x', content: 'x' }],
        [...translations, ...translations], [{ language: 'zh', title: 'x', content: '<script>alert(1)</script>' }],
        [{ language: 'zh', title: 'x', content: '<p>&nbsp;</p>' }]]) {
        assert.throws(() => service.validateBountyTranslations(items), { key: 'post.invalidBountyContent' });
    }
});

test('any authenticated ordinary user can publish a permanent bounty for someone else’s packs', async t => {
    const { post, transaction, events } = fixture(t);
    const res = response();
    await postController.createPost(request({ type: 4, translations, pack_ids: [42, 43], limit: 99, bounty_closed_at: now }), res);
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body.data, { post_id: 12 });
    assert.equal(post.end, null);
    assert.equal(post.limit, null);
    assert.equal(post.bounty_closed_at, null, 'Request cannot set the internal closure timestamp');
    assert.equal(transaction.finished, 'commit');
    assert.deepEqual(events.find(Array.isArray), [{ post_id: 12, pack_id: 42 }, { post_id: 12, pack_id: 43 }]);
});

test('limited bounty preserves an explicit future deadline and sanitizes rules', async t => {
    const { post, events } = fixture(t);
    const res = response();
    await postController.createPost(request({ type: '4', pack_ids: [42], end: future,
        translations: [{ ...translations[0], content: '<p>Rules</p><script>bad()</script>' }] }), res);
    assert.equal(res.statusCode, 201);
    assert.equal(post.type, 4);
    assert.equal(post.end.toISOString(), future);
    assert.equal(events.find(event => event?.language === 'zh').content, '<p>Rules</p>');
});

test('missing referenced pack fails atomically before post creation', async t => {
    const { transaction, events } = fixture(t);
    t.mock.method(Pack, 'findAll', async () => []);
    const res = response();
    await postController.createPost(request({ type: 4, pack_ids: [42], translations }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'post.bountyPackNotFound');
    assert.equal(transaction.finished, 'rollback');
    assert.equal(events.includes('create'), false);
});

test('association or translation failure rolls back the entire create', async t => {
    for (const model of [PostPack, PostTranslation]) {
        const { transaction } = fixture(t);
        t.mock.method(console, 'error', () => {});
        t.mock.method(model, model === PostPack ? 'bulkCreate' : 'create', async () => { throw new Error('write failed'); });
        const res = response();
        await postController.createPost(request({ type: 4, pack_ids: [42], translations }), res);
        assert.equal(res.statusCode, 500);
        assert.equal(transaction.finished, 'rollback');
        t.mock.restoreAll();
    }
});

test('bounty date can switch from limited to permanent and back', async t => {
    const { post } = fixture(t, { end: new Date(future) });
    let res = response();
    await postController.updatePost(request({ end: null }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(post.end, null);
    res = response();
    await postController.updatePost(request({ end: future }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(post.end.toISOString(), future);
});

test('editing rules of expired bounty preserves its deadline and status', async t => {
    const end = new Date('2020-01-01T00:00:00Z');
    const { post } = fixture(t, { end });
    const res = response();
    await postController.updatePost(request({ translations, end: end.toISOString() }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(service.getBountyStatus(post), 'expired');
});

test('manual closure survives edits, including attempts to clear the internal timestamp', async t => {
    const closed = new Date('2020-01-01T00:00:00Z');
    const { post } = fixture(t, { bounty_closed_at: closed });
    const res = response();
    await postController.updatePost(request({ translations, end: null, bounty_closed_at: null }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(post.bounty_closed_at, closed);
    assert.equal(service.getBountyStatus(post), 'closed');
});

test('editing pack associations replaces them in the same transaction', async t => {
    const { events } = fixture(t);
    const res = response();
    await postController.updatePost(request({ pack_ids: [43] }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(events.slice(0, 2), ['unlink', [{ post_id: '12', pack_id: 43 }]]);
    assert.equal(events.at(-1), 'commit');
});

test('invalid association update rolls back without saving or removing previous links', async t => {
    const { transaction, events } = fixture(t);
    const res = response();
    await postController.updatePost(request({ end: null, pack_ids: [] }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(transaction.finished, 'rollback');
    assert.deepEqual(events, ['rollback']);
});

test('ordinary users cannot edit someone else’s bounty or publish restricted post types', async t => {
    fixture(t, { user_id: 8 });
    const res = response();
    await postController.updatePost(request({ translations, end: null }), res);
    assert.equal(res.statusCode, 403);
    for (const type of [1, 2, 3]) {
        const createRes = response();
        await postController.createPost(request({ type, translations }), createRes);
        assert.equal(createRes.statusCode, 403);
    }
});

test('bounty posts cannot change type to bypass closure or leave dangling active associations', async t => {
    fixture(t);
    const res = response();
    await postController.updatePost(request({ type: 0 }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'post.bountyTypeFixed');
});

test('ordinary post can become bounty only with valid rules and linked packs', async t => {
    const { post } = fixture(t, { type: 0 });
    const res = response();
    await postController.updatePost(request({ type: 4, translations, pack_ids: [42] }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(post.type, 4);
    assert.equal(post.end, null);
});

test('invalid post types and links on non-bounty posts return 400', async t => {
    fixture(t);
    for (const type of [undefined, null, '', false, true, [], {}, ' 4 ', 5, -1, 1.5]) {
        const res = response();
        await postController.createPost(request({ type, translations }), res);
        assert.equal(res.statusCode, 400, String(type));
    }
    const res = response();
    await postController.createPost(request({ type: 0, translations, pack_ids: [42] }), res);
    assert.equal(res.body.message, 'post.bountyPacksOnly');
});

test('owner and post moderator can close permanently; repeated close is idempotent', async t => {
    const { post, events } = fixture(t);
    let res = response();
    await postController.closeBounty(request(), res);
    const closedAt = post.bounty_closed_at;
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.bounty_status, 'closed');
    res = response();
    await postController.closeBounty(request({}, ['posts'], 99), res);
    assert.equal(res.statusCode, 200);
    assert.equal(post.bounty_closed_at, closedAt);
    assert.equal(events.filter(event => event === 'save').length, 1);
});

test('other users and unrelated permissions cannot close a bounty', async t => {
    const { post, transaction } = fixture(t, { user_id: 8 });
    for (const permissions of [[], ['packTags'], ['events'], ['admin']]) {
        const res = response();
        await postController.closeBounty(request({}, permissions), res);
        assert.equal(res.statusCode, 403);
        assert.equal(post.bounty_closed_at, null);
        assert.equal(transaction.finished, 'rollback');
    }
});

test('close rejects missing and non-bounty posts', async t => {
    const { transaction } = fixture(t, { type: 0 });
    let res = response();
    await postController.closeBounty(request(), res);
    assert.equal(res.statusCode, 400);
    assert.equal(transaction.finished, 'rollback');
    t.mock.method(Post, 'findByPk', async () => null);
    res = response();
    await postController.closeBounty(request(), res);
    assert.equal(res.statusCode, 404);
});

test('post detail exposes linked packs and IDs for editor and rules page', async t => {
    const row = Post.build({ post_id: 12, user_id: 7, type: 4, end: null });
    row.setDataValue('linked_packs', [{ pack_id: 42, title: 'Pack' }]);
    let options;
    t.mock.method(Post, 'findByPk', async (_id, value) => { options = value; return row; });
    const res = response();
    await postController.getPostById(request(), res);
    assert.equal(res.body.data.bounty_status, 'active');
    assert.deepEqual(res.body.data.pack_ids, [42]);
    assert.equal(res.body.data.linked_packs[0].title, 'Pack');
    assert.ok(options.include.find(include => include.as === 'linked_packs'));
});

test('pack list combines bounty with existing filters and preserves pagination and sort', async t => {
    let options;
    t.mock.method(Pack, 'findAndCountAll', async value => {
        options = value;
        return { count: 1, rows: [{ pack_id: 42, bounty_count: '2', bounty_next_end_at: new Date(future) }] };
    });
    const req = request();
    req.query = { bounty: '1', recommended: '1', featured: '1', searchKeys: 'test', page: '2', pageSize: '10', sort: '2' };
    const res = response();
    await packController.getAllPacks(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data[0].has_bounty, true);
    assert.equal(res.body.data[0].bounty_count, 2);
    assert.equal(res.body.data[0].bounty_next_end_at, future);
    assert.equal(res.body.total, 1);
    assert.equal(res.body.page, 2);
    assert.equal(options.offset, 10);
    assert.equal(options.distinct, true);
    assert.deepEqual(options.order, [['submitted_date', 'DESC']]);
    assert.equal(options.where.is_recommended, true);
    assert.equal(options.where.leaderboard_enabled, true);
    assert.ok(options.where[Op.or]);
    assert.match(options.where[Op.and].val, /bounty_closed_at IS NULL/);
    assert.match(options.where[Op.and].val, /b\.type = 4/);
    assert.match(options.where[Op.and].val, /b\.\`end\` IS NULL OR b\.\`end\` >/);
    const deadlineSql = options.attributes.include.find(([, alias]) => alias === 'bounty_next_end_at')[0].val;
    assert.match(deadlineSql, /SELECT MIN\(b\.\`end\`\)/);
    assert.match(deadlineSql, /b\.type = 4 AND b\.bounty_closed_at IS NULL/);
    assert.match(deadlineSql, /AND b\.\`end\` >/);
});

test('pack list deadlines serialize dates in UTC and leave permanent bounties unscheduled', () => {
    for (const value of [new Date(future), future, '2099-12-01T20:30:00.000+08:00']) {
        const data = service.serializePackBountyCount({ bounty_count: 2, bounty_next_end_at: value });
        assert.equal(data.bounty_next_end_at, future);
        assert.equal(data.has_bounty, true);
    }
    for (const value of [null, undefined]) {
        const data = service.serializePackBountyCount({ bounty_count: 1, bounty_next_end_at: value });
        assert.equal(data.bounty_next_end_at, null);
        assert.equal(data.has_bounty, true);
    }
});

test('pack without active bounty has no badge and false/omitted filter does not restrict results', async t => {
    let options;
    t.mock.method(Pack, 'findAndCountAll', async value => { options = value; return { count: 1, rows: [{ pack_id: 42, bounty_count: 0 }] }; });
    for (const bounty of [undefined, '0', 'false']) {
        const req = request(); req.query = { page: '1', pageSize: '10', bounty };
        const res = response();
        await packController.getAllPacks(req, res);
        assert.equal(res.body.data[0].has_bounty, false);
        assert.equal(res.body.data[0].bounty_count, 0);
        assert.equal(res.body.data[0].bounty_next_end_at, null);
        assert.equal(options.where[Op.and], undefined);
    }
});

test('pack details return active bounties with translated titles, stable ordering and no rules payload', async t => {
    let options;
    t.mock.method(Pack, 'findByPk', async () => ({ pack_id: 42, title: 'Pack' }));
    t.mock.method(Post, 'findAll', async value => {
        options = value;
        return [{ post_id: 12, type: 4, end: null, translations: [{ language: 'zh', title: 'FC' }], user: { user_id: 7, user_name: 'Jack' } }];
    });
    const res = response();
    await packController.getPackById(request(), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.has_bounty, true);
    assert.equal(res.body.data.bounty_count, 1);
    assert.equal(res.body.data.bounties[0].post_id, 12);
    assert.equal(res.body.data.bounties[0].bounty_status, 'active');
    assert.equal(res.body.data.bounties[0].translations[0].title, 'FC');
    assert.equal(res.body.data.bounties[0].user.user_name, 'Jack');
    assert.equal(options.where.type, 4);
    assert.equal(options.where.bounty_closed_at, null);
    assert.equal(options.include[0].where.pack_id, 42);
    assert.deepEqual(options.include[1].attributes, ['title', 'language']);
    assert.deepEqual(options.order, [['created_time', 'DESC'], ['post_id', 'DESC']]);
});

test('pack details without active bounties return empty array; missing pack is 404', async t => {
    t.mock.method(Pack, 'findByPk', async () => ({ pack_id: 42 }));
    t.mock.method(Post, 'findAll', async () => []);
    let res = response();
    await packController.getPackById(request(), res);
    assert.equal(res.body.data.has_bounty, false);
    assert.deepEqual(res.body.data.bounties, []);
    t.mock.method(Pack, 'findByPk', async () => null);
    res = response();
    await packController.getPackById(request(), res);
    assert.equal(res.statusCode, 404);
});

test('forum preview includes public bounty category', async t => {
    t.mock.method(Post, 'findAndCountAll', async () => ({ count: 0, rows: [] }));
    const res = response();
    await postController.getAllType3Posts(request(), res);
    assert.deepEqual(res.body.data.map(group => group.type), [0, 1, 2, 3, 4]);
});

test('bounty route requires authentication and associations cascade on deletion', () => {
    const route = router.stack.find(layer => layer.route?.path === '/:post_id/bounty/close').route;
    assert.equal(route.methods.patch, true);
    assert.equal(route.stack.length, 2);
    assert.equal(route.stack.at(-1).handle, postController.closeBounty);
    assert.equal(PostPack.rawAttributes.post_id.onDelete, 'CASCADE');
    assert.equal(PostPack.rawAttributes.pack_id.onDelete, 'CASCADE');
    assert.equal(PostPack.rawAttributes.post_id.primaryKey, true);
    assert.equal(PostPack.rawAttributes.pack_id.primaryKey, true);
});

test('migration can be rerun safely and verifies required columns', async () => {
    const statements = [];
    const db = { async query(sql) { statements.push(sql); }, getQueryInterface() {
        return { async describeTable(name) { return name === 'post' ? { bounty_closed_at: {} } : { post_id: {}, pack_id: {} }; } };
    } };
    await migratePostBounties(db);
    await migratePostBounties(db);
    assert.equal(statements.length, 6);
    assert.ok(statements.every(sql => /IF NOT EXISTS/.test(sql)));
    assert.match(statements[2], /ON DELETE CASCADE/);
});

test('actual MariaDB query generation preserves bounty aliases and filters inside paginated joins', () => {
    const count = service.activeBountyCountSql(now);
    const options = {
        model: Pack, limit: 10, offset: 10,
        attributes: { include: [
            [sequelize.literal(count), 'bounty_count'],
            [sequelize.literal(service.activeBountyNextEndSql(now)), 'bounty_next_end_at'],
        ] },
        where: { [Op.and]: sequelize.literal(`${count} > 0`) },
        include: [{ model: Tag, as: 'tags', through: { attributes: [] } },
            { model: User, as: 'user' }, { model: PackMap, as: 'maps' }],
    };
    Pack._expandAttributes(options);
    Pack._validateIncludedElements(options);
    const sql = sequelize.getQueryInterface().queryGenerator.selectQuery('pack', options, Pack);
    assert.match(sql, /FROM `pack` AS `Pack`/);
    assert.match(sql, /bp.pack_id = `Pack`.`pack_id`/);
    assert.match(sql, /LIMIT 10, 10/);
    assert.match(sql, /bounty_count/);
    assert.match(sql, /bounty_next_end_at/);
    assert.match(sql, /SELECT MIN\(b\.\`end\`\)/);
    const detailOptions = {
        model: Post, attributes: ['post_id', 'type', 'end'], where: service.activeBountyWhere(now),
        include: [{ model: Pack, as: 'linked_packs', where: { pack_id: 42 }, required: true, through: { attributes: [] } }],
    };
    Post._validateIncludedElements(detailOptions);
    const detailSql = sequelize.getQueryInterface().queryGenerator.selectQuery('post', detailOptions, Post);
    assert.match(detailSql, /INNER JOIN/);
    assert.match(detailSql, /`Post`.`bounty_closed_at` IS NULL/);
});

test('a translation write failure rolls back bounty edits and link replacement together', async t => {
    const { transaction, events } = fixture(t);
    t.mock.method(PostTranslation, 'create', async () => { throw new Error('write failed'); });
    t.mock.method(console, 'error', () => {});
    const res = response();
    await postController.updatePost(request({ translations, pack_ids: [43] }), res);
    assert.equal(res.statusCode, 500);
    assert.equal(transaction.finished, 'rollback');
    assert.equal(events.includes('commit'), false);
});

test('post moderators can edit other users’ rules and ordinary post editing still succeeds', async t => {
    const { post, transaction } = fixture(t, { user_id: 8, type: 0 });
    const res = response();
    await postController.updatePost(request({ type: 0, translations }, ['posts']), res);
    assert.equal(res.statusCode, 200);
    assert.equal(post.type, 0);
    assert.equal(transaction.finished, 'commit');
});

test('bounty edits can clear an optional language without retaining its old title or rules', async t => {
    fixture(t);
    const english = { post_translation_id: 2, title: 'Old title', content: '<p>Old rules</p>',
        async save() {},
    };
    t.mock.method(PostTranslation, 'findOne', async options => options.where.language === 'en' ? english : null);
    const res = response();
    await postController.updatePost(request({ translations: [
        ...translations, { language: 'en', title: '', content: '' },
    ] }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(english.title, '');
    assert.equal(english.content, '');
});

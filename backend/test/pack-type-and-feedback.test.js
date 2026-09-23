const test = require('node:test');
const assert = require('node:assert/strict');
const { getAllowedTagCategories } = require('../utils/packTag');
const packRoute = require('../routes/packRoute');
const PackController = require('../controllers/pack/packController');
const postFileRoute = require('../routes/postFileRoute');
const { PostFile, PostFileComment, Pack, PackFeedback } = require('../models');

test('getAllowedTagCategories returns expected categories for each pack type', () => {
    assert.deepEqual(getAllowedTagCategories(0), ['pattern', 'bpm', 'difficulty']);
    assert.deepEqual(getAllowedTagCategories(1), []);
    assert.deepEqual(getAllowedTagCategories(2), ['difficulty']);
    assert.deepEqual(getAllowedTagCategories(3), ['pattern']);
    assert.deepEqual(getAllowedTagCategories(99), []);
});

test('PackFeedback model allows null pack_id and has pack_title_snapshot', () => {
    const rawAttrs = PackFeedback.rawAttributes;
    assert.equal(rawAttrs.pack_id.allowNull, true);
    assert.ok(rawAttrs.pack_title_snapshot);
    assert.equal(rawAttrs.pack_title_snapshot.allowNull, true);
});

test('PostFileComment model has expected schema', () => {
    const rawAttrs = PostFileComment.rawAttributes;
    assert.equal(rawAttrs.comment_id.primaryKey, true);
    assert.equal(rawAttrs.file_id.allowNull, false);
    assert.equal(rawAttrs.user_id.allowNull, false);
    assert.equal(rawAttrs.comment.allowNull, false);
});

test('PostFile association with reviewerComments exists', () => {
    assert.ok(PostFile.associations.reviewerComments);
    assert.equal(PostFile.associations.reviewerComments.target, PostFileComment);
});

test('packRoute has PATCH /:pack_id/type route registered', () => {
    const route = packRoute.stack.find(
        (layer) => layer.route && layer.route.path === '/:pack_id/type' && layer.route.methods.patch
    );
    assert.ok(route, 'PATCH /:pack_id/type should be registered in packRoute');
});

test('getAllPacks filters by packId exactly', async (t) => {
    let receivedOptions;
    t.mock.method(Pack, 'findAndCountAll', async (options) => {
        receivedOptions = options;
        return { count: 1, rows: [] };
    });

    let payload;
    const req = {
        query: { packId: '1017', page: '1', pageSize: '10', sort: '0' },
        t: (key) => key,
    };
    const res = {
        status() { return this; },
        json(value) { payload = value; return value; },
    };

    await PackController.getAllPacks(req, res);

    assert.equal(receivedOptions.where.pack_id, 1017);
    const mapsInclude = receivedOptions.include.find((include) => include.as === 'maps');
    assert.deepEqual(mapsInclude.attributes, ['map_id', 'rating', 'version', 'key_count']);
    assert.equal(payload.total, 1);
    assert.equal(payload.page, 1);
});

test('postFileRoute has comments routes registered', () => {
    const getCommentsRoute = postFileRoute.stack.find(
        (layer) => layer.route && layer.route.path === '/:file_id/comments' && layer.route.methods.get
    );
    const postCommentsRoute = postFileRoute.stack.find(
        (layer) => layer.route && layer.route.path === '/:file_id/comments' && layer.route.methods.post
    );
    const deleteCommentsRoute = postFileRoute.stack.find(
        (layer) => layer.route && layer.route.path === '/comments/:comment_id' && layer.route.methods.delete
    );

    assert.ok(getCommentsRoute, 'GET /:file_id/comments should be registered');
    assert.ok(postCommentsRoute, 'POST /:file_id/comments should be registered');
    assert.ok(deleteCommentsRoute, 'DELETE /comments/:comment_id should be registered');
});

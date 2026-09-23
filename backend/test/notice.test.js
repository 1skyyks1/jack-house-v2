const assert = require('node:assert/strict');
const { after, beforeEach, test } = require('node:test');

const sequelize = require('../config/db');
const Notice = require('../models/notice');
const richTextAssetService = require('../services/richTextAssetService');

const originalSyncRichTextAssetReferences = richTextAssetService.syncRichTextAssetReferences;
const assetSyncCalls = [];
richTextAssetService.syncRichTextAssetReferences = async (input) => {
    assetSyncCalls.push(input);
};

delete require.cache[require.resolve('../controllers/noticeController')];
const controller = require('../controllers/noticeController');

after(() => {
    richTextAssetService.syncRichTextAssetReferences = originalSyncRichTextAssetReferences;
});

beforeEach(() => {
    assetSyncCalls.length = 0;
});

const patchMethod = (t, object, name, implementation) => {
    const original = object[name];
    object[name] = implementation;
    t.after(() => {
        object[name] = original;
    });
};

const createResponse = () => ({
    body: undefined,
    statusCode: 200,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(body) {
        this.body = body;
        return this;
    },
});

const mockTransaction = (t) => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    patchMethod(t, sequelize, 'transaction', async (callback) => callback(transaction));
    return transaction;
};

const createNoticeRecord = (values = {}) => ({
    id: 2,
    content_zh: '<p>中文通知</p>',
    content_en: '',
    is_active: false,
    ...values,
    async destroy(options) {
        this.destroyOptions = options;
    },
    async save(options) {
        this.saveOptions = options;
        return this;
    },
});

test('creating an active notice deactivates every other notice and records rich-text assets', async (t) => {
    const transaction = mockTransaction(t);
    let createdValues;
    let deactivation;
    const notice = createNoticeRecord();

    patchMethod(t, Notice, 'create', async (values, options) => {
        createdValues = values;
        assert.equal(options.transaction, transaction);
        return notice;
    });
    patchMethod(t, Notice, 'update', async (values, options) => {
        deactivation = { values, options };
        return [1];
    });

    const response = createResponse();
    await controller.createNotice({
        body: {
            content_zh: '<p>中文通知</p><script>alert(1)</script>',
            content_en: '',
            is_active: true,
        },
    }, response);

    assert.equal(response.statusCode, 201);
    assert.equal(createdValues.content_zh, '<p>中文通知</p>');
    assert.equal(createdValues.is_active, false);
    assert.deepEqual(deactivation.values, { is_active: false });
    assert.equal(deactivation.options.transaction, transaction);
    assert.equal(notice.is_active, true);
    assert.equal(notice.saveOptions.transaction, transaction);
    assert.equal(assetSyncCalls.length, 1);
    assert.equal(assetSyncCalls[0].contentType, 'notice');
    assert.equal(assetSyncCalls[0].contentId, notice.id);
    assert.equal(assetSyncCalls[0].transaction, transaction);
});

test('activating an existing notice deactivates the previous active notice in the same transaction', async (t) => {
    const transaction = mockTransaction(t);
    const notice = createNoticeRecord({ id: 7 });
    let deactivation;

    patchMethod(t, Notice, 'findByPk', async (_id, options) => {
        assert.equal(options.lock, transaction.LOCK.UPDATE);
        assert.equal(options.transaction, transaction);
        return notice;
    });
    patchMethod(t, Notice, 'update', async (values, options) => {
        deactivation = { values, options };
        return [1];
    });

    const response = createResponse();
    await controller.updateNotice({ params: { id: '7' }, body: { is_active: true } }, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(deactivation.values, { is_active: false });
    assert.equal(deactivation.options.transaction, transaction);
    assert.equal(notice.is_active, true);
    assert.equal(notice.saveOptions.transaction, transaction);
    assert.equal(assetSyncCalls.length, 1);
});

test('empty notice content is rejected before opening a transaction', async (t) => {
    patchMethod(t, sequelize, 'transaction', async () => assert.fail('Empty content opened a transaction'));
    const response = createResponse();

    await controller.createNotice({
        body: { content_zh: '<p>&nbsp;</p>', content_en: '', is_active: true },
    }, response);

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.message, 'At least one language content is required');
});

test('deleting a notice clears rich-text references before destroying the row', async (t) => {
    const transaction = mockTransaction(t);
    const notice = createNoticeRecord({ id: 9 });

    patchMethod(t, Notice, 'findByPk', async () => notice);
    const response = createResponse();
    await controller.deleteNotice({ params: { id: '9' } }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(assetSyncCalls.length, 1);
    assert.equal(assetSyncCalls[0].html, '');
    assert.equal(assetSyncCalls[0].transaction, transaction);
    assert.equal(notice.destroyOptions.transaction, transaction);
});

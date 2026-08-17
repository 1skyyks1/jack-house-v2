const assert = require('node:assert/strict');
const test = require('node:test');

const {
    POST_FILE_DELETE_WINDOW_MS,
    getPostFileDeleteAccess,
    getPostFileLockedAt,
    isPostFileLocked,
} = require('../utils/postFileLock');

test('post files lock exactly 24 hours after upload', () => {
    const uploadedAt = new Date('2026-08-15T00:00:00.000Z');
    const lockedAt = getPostFileLockedAt(uploadedAt);

    assert.equal(lockedAt.toISOString(), '2026-08-16T00:00:00.000Z');
    assert.equal(isPostFileLocked(uploadedAt, new Date(lockedAt.getTime() - 1)), false);
    assert.equal(isPostFileLocked(uploadedAt, lockedAt), true);
    assert.equal(lockedAt.getTime() - uploadedAt.getTime(), POST_FILE_DELETE_WINDOW_MS);
});

test('post files with invalid upload times are locked', () => {
    assert.equal(getPostFileLockedAt('invalid'), null);
    assert.equal(isPostFileLocked('invalid'), true);
});

test('owners can delete only during the window while reviewers retain moderation access', () => {
    const uploadedTime = new Date('2026-08-15T00:00:00.000Z');
    const duringWindow = new Date('2026-08-15T12:00:00.000Z');
    const afterWindow = new Date('2026-08-16T00:00:00.000Z');

    assert.equal(getPostFileDeleteAccess({ ownerId: 7, uploadedTime, userId: 7, userRole: 0, now: duringWindow }), 'owner');
    assert.equal(getPostFileDeleteAccess({ ownerId: 7, uploadedTime, userId: 8, userRole: 0, now: duringWindow }), 'forbidden');
    assert.equal(getPostFileDeleteAccess({ ownerId: 7, uploadedTime, userId: 7, userRole: 0, now: afterWindow }), 'expired');
    assert.equal(getPostFileDeleteAccess({ ownerId: 7, uploadedTime, userId: 8, userRole: 1, now: afterWindow }), 'reviewer');
    assert.equal(getPostFileDeleteAccess({ ownerId: 7, uploadedTime, userId: 8, userRole: 2, now: afterWindow }), 'reviewer');
});

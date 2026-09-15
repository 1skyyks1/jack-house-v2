const POST_FILE_DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;

const getPostFileLockedAt = (uploadedTime) => {
    const uploadedAt = new Date(uploadedTime);
    if (Number.isNaN(uploadedAt.getTime())) {
        return null;
    }

    return new Date(uploadedAt.getTime() + POST_FILE_DELETE_WINDOW_MS);
};

const isPostFileLocked = (uploadedTime, now = new Date()) => {
    const lockedAt = getPostFileLockedAt(uploadedTime);
    if (!lockedAt) {
        return true;
    }

    return now.getTime() >= lockedAt.getTime();
};

const getPostFileDeleteAccess = ({ ownerId, uploadedTime, userId, canReview = false, now = new Date() }) => {
    if (canReview) {
        return 'reviewer';
    }
    if (Number(ownerId) !== Number(userId)) {
        return 'forbidden';
    }
    if (isPostFileLocked(uploadedTime, now)) {
        return 'expired';
    }

    return 'owner';
};

module.exports = {
    POST_FILE_DELETE_WINDOW_MS,
    getPostFileDeleteAccess,
    getPostFileLockedAt,
    isPostFileLocked,
};

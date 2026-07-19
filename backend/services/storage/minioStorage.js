const mc = require('../../config/minio');

const getDownloadUrl = async ({ bucket, objectName, expires = 24 * 60 * 60 }) => {
    return mc.presignedUrl('GET', bucket, objectName, expires);
};

const deleteFile = async ({ bucket, objectName }) => {
    return mc.removeObject(bucket, objectName);
};

module.exports = {
    getDownloadUrl,
    deleteFile,
};

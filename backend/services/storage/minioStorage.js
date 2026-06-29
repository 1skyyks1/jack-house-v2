const mc = require('../../config/minio');

const uploadFile = async ({ bucket, objectName, filePath, mimeType }) => {
    await mc.fPutObject(bucket, objectName, filePath, {
        'Content-Type': mimeType,
    });

    return {
        objectName,
        objectKey: objectName,
        url: `${bucket}/${objectName}`,
        publicUrl: null,
    };
};

const getDownloadUrl = async ({ bucket, objectName, expires = 24 * 60 * 60 }) => {
    return mc.presignedUrl('GET', bucket, objectName, expires);
};

const deleteFile = async ({ bucket, objectName }) => {
    return mc.removeObject(bucket, objectName);
};

module.exports = {
    uploadFile,
    getDownloadUrl,
    deleteFile,
};

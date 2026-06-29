const { User, PostFile, Post } = require('../../models')
const sequelize = require('../../config/db')
const { Op } = require("sequelize");
// const { fetchUploadUrl, getSign, getAuthCode } = require('../../utils/pan');
const { postFileUpload } = require('../../config/multer')
const { handleUpload } = require('../../middleware/uploadErrorHandler')
// const { uploadToStorage, preSign } = require('../../utils/tebiS3')
const fs = require('fs')
const path = require('path')
const storage = require('../../services/storage')
const { getObjectNameHash, hashFile } = require('../../utils/imageOptimizer')

const POSTFILES_STORAGE_SCOPE = 'POSTFILES';
const EXTERNAL_STORAGE_PROVIDER = 'external';
const getPostFileObjectName = (file) => file.object_key || file.file_url;
const getPostFileProvider = (file) => file.storage_provider || 'minio';
const getPostFilesBucket = () => storage.getBucketName(
    POSTFILES_STORAGE_SCOPE,
    ['MINIO_POSTFILES_BUCKET'],
    null
);

const getMaxTotalSizeBytes = () => {
    const value = Number(process.env.POSTFILE_MAX_TOTAL_SIZE_MB);
    const mb = Number.isFinite(value) && value > 0 ? value : 100;
    return mb * 1024 * 1024;
};

const getMaxFileSizeBytes = () => {
    const value = Number(process.env.POSTFILE_MAX_SIZE_MB);
    const mb = Number.isFinite(value) && value > 0 ? value : 20;
    return mb * 1024 * 1024;
};

const ensurePostFileSizeLimit = (fileSize) => {
    if (Number(fileSize || 0) > getMaxFileSizeBytes()) {
        const error = new Error('postFile.fileSizeLimit');
        error.status = 413;
        throw error;
    }
};

const ensurePostFileTotalSize = async ({ post_id, user_id, nextFileSize, excludeFileId }) => {
    const currentSize = await PostFile.sum('size', {
        where: {
            post_id,
            user_id,
            ...(excludeFileId ? { file_id: { [Op.ne]: excludeFileId } } : {}),
        }
    });
    const totalSize = Number(currentSize || 0) + Number(nextFileSize || 0);

    if (totalSize > getMaxTotalSizeBytes()) {
        const error = new Error('postFile.totalSizeLimit');
        error.status = 403;
        throw error;
    }
};

const ensurePostFileUploadCount = async ({ post, post_id, user_id }) => {
    if (post.limit === null) {
        return;
    }

    const uploadCount = await PostFile.count({
        where: { post_id, user_id }
    });

    if (uploadCount >= post.limit) {
        const error = new Error('postFile.uploadLimit');
        error.status = 403;
        throw error;
    }
};

const handlePostFileUpload = handleUpload(postFileUpload.single('file'));

const buildPostFileObjectName = (checksum, fileName) => {
    const extension = path.extname(fileName || '').toLowerCase();
    return `${getObjectNameHash(checksum)}${extension}`;
};

const normalizeOptionalString = (value) => {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed || null;
};

const normalizePositiveInteger = (value) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const parsePagination = (query, { defaultPageSize = 10, maxPageSize = 20 } = {}) => {
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const requestedPageSize = parseInt(query.pageSize, 10) || defaultPageSize;
    const limit = Math.min(Math.max(requestedPageSize, 1), maxPageSize);

    return {
        limit,
        offset: (page - 1) * limit,
        page,
    };
};

const assertValidUrl = (url) => {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (error) {
        return false;
    }
};

const normalizeCreatePostFilePayload = (body) => {
    const postId = normalizePositiveInteger(body.post_id);
    const userId = normalizePositiveInteger(body.user_id);
    const size = normalizePositiveInteger(body.size);
    const fileName = normalizeOptionalString(body.file_name);
    const fileUrl = normalizeOptionalString(body.file_url);
    const publicUrl = normalizeOptionalString(body.public_url);
    const downloadUrl = normalizeOptionalString(body.download_url);
    const requestedProvider = normalizeOptionalString(body.storage_provider);
    const provider = requestedProvider || ((publicUrl || downloadUrl) ? EXTERNAL_STORAGE_PROVIDER : 'minio');
    const objectKey = normalizeOptionalString(body.object_key) || fileUrl;
    const mimeType = normalizeOptionalString(body.mime_type);
    const checksum = normalizeOptionalString(body.checksum);

    if (!postId || !size || !fileName || !fileUrl || (body.user_id !== undefined && !userId)) {
        const error = new Error('postFile.invalidCreatePayload');
        error.status = 400;
        throw error;
    }

    if (fileName.length > 255 || fileUrl.length > 255 || (objectKey && objectKey.length > 255)) {
        const error = new Error('postFile.invalidCreatePayload');
        error.status = 400;
        throw error;
    }

    if (provider && !['minio', 'github', EXTERNAL_STORAGE_PROVIDER].includes(provider)) {
        const error = new Error('postFile.invalidStorageProvider');
        error.status = 400;
        throw error;
    }

    if (provider === EXTERNAL_STORAGE_PROVIDER && !publicUrl && !downloadUrl) {
        const error = new Error('postFile.invalidUrl');
        error.status = 400;
        throw error;
    }

    if ((publicUrl && !assertValidUrl(publicUrl)) || (downloadUrl && !assertValidUrl(downloadUrl))) {
        const error = new Error('postFile.invalidUrl');
        error.status = 400;
        throw error;
    }

    if (checksum && !/^[a-f0-9]{64}$/i.test(checksum)) {
        const error = new Error('postFile.invalidChecksum');
        error.status = 400;
        throw error;
    }

    return {
        post_id: postId,
        user_id: userId,
        file_name: fileName,
        file_url: fileUrl,
        storage_provider: provider,
        object_key: objectKey,
        public_url: publicUrl,
        download_url: downloadUrl,
        mime_type: mimeType,
        size,
        checksum,
    };
};

// 条件获取所有投稿
exports.getFileByPostId = async (req, res) => {
    const { page, pageSize, post_id, status, keyword } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);

    const where = {};

    if (post_id) {
        where.post_id = post_id;
    }

    if (status) {
        where.status = status;
    }

    if (keyword) {
        where[Op.or] = [
            { file_name: { [Op.like]: `%${keyword}%` } },
            sequelize.where(sequelize.col('user.user_name'), {
                [Op.like]: `%${keyword}%`,
            })
        ];
    }

    const options = {
        limit,
        offset,
        order: [['uploaded_time', 'DESC']],
        where,
        include: [
            {
                model: User,
                as: 'user',
                attributes: ['user_name']
            }
        ]
    };

    try {
        const { count, rows } = await PostFile.findAndCountAll(options);

        const result = rows.map(file => {
            const fileData = file.toJSON();
            fileData.user_name = fileData.user.user_name;
            delete fileData.user;
            return fileData;
        })
        const totalPages = Math.ceil(count / limit)
        res.json({ data: result, page: parseInt(page, 10), pageSize: limit, totalPages, total: count });
    } catch (error){
        res.status(500).json({ message: req.t('postFile.getFailed') });
    }
}

// 获取指定征稿中指定用户的投稿
exports.getFileByPostAndUser = async (req, res) => {
    const { post_id } = req.params;
    const user_id = req.user.user_id;

    try {
        const rows = await PostFile.findAll({
            order: [['uploaded_time', 'DESC']],
            where: {
                post_id: post_id,
                user_id: user_id,
            },
        });

        res.json({ data: rows });
    } catch (error){
        res.status(500).json({ message: req.t('postFile.getFailed') });
    }
}

// 获取指定用户的所有投稿
exports.getFileByUserId = async (req, res) => {
    const { user_id } = req.params;
    const { limit, offset, page } = parsePagination(req.query, { defaultPageSize: 5, maxPageSize: 20 });

    try {
        const { count, rows } = await PostFile.findAndCountAll({
            attributes: ['file_id', 'post_id', 'user_id', 'file_name', 'uploaded_time', 'status', 'size'],
            where: { user_id },
            order: [['uploaded_time', 'DESC']],
            limit,
            offset,
        });
        const totalPages = Math.ceil(count / limit)
        res.json({ data: rows, page, pageSize: limit, totalPages, total: count });
    } catch (error){
        res.status(500).json({ message: req.t('postFile.getFailed') });
    }
}

// 上传文件
exports.uploadFile = [
    handlePostFileUpload,
    async (req, res) => {
        const { post_id } = req.params;
        const user_id = req.user.user_id;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ message: req.t('postFile.noFile') });
        }

        const filePath = file.path;
        const fileName = file.filename;

        const removeTempFile = () => {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        };

        try {
            const post = await Post.findByPk(post_id);
            if (!post) {
                removeTempFile();
                return res.status(404).json({ message: req.t('post.notFound') });
            }

            await ensurePostFileUploadCount({ post, post_id, user_id });
            ensurePostFileSizeLimit(file.size);
            const checksum = await hashFile(filePath);
            const objectName = buildPostFileObjectName(checksum, file.originalname);

            await ensurePostFileTotalSize({
                post_id,
                user_id,
                nextFileSize: file.size,
            });

            const uploaded = await storage.uploadFile(POSTFILES_STORAGE_SCOPE, {
                bucket: getPostFilesBucket(),
                objectName,
                filePath,
                mimeType: file.mimetype,
                size: file.size,
            });

            const postFile = await PostFile.create({
                post_id,
                user_id,
                file_name: Buffer.from(file.originalname, 'latin1').toString('utf8'),
                file_url: uploaded.objectName,
                storage_provider: uploaded.provider,
                object_key: uploaded.objectKey,
                public_url: uploaded.publicUrl,
                download_url: uploaded.downloadUrl,
                mime_type: uploaded.mimeType,
                size: file.size,
                checksum,
            });

            removeTempFile();
            res.status(201).json({ message: req.t('postFile.uploadSuccess'), data: postFile });
        } catch (error) {
            // 如果上传失败，删除临时文件
            removeTempFile();
            if (error.status) {
                return res.status(error.status).json({ message: req.t(error.message) });
            }
            console.log(error)
            res.status(500).json({ message: req.t('postFile.uploadFailed') });
        }
    }
];

// 创建投稿
exports.createPostFile = async (req, res) => {
    try {
        const payload = normalizeCreatePostFilePayload(req.body);
        const user_id = payload.user_id || req.user.user_id;
        const post = await Post.findByPk(payload.post_id);
        if (!post) {
            return res.status(404).json({ message: req.t('post.notFound') });
        }

        const user = await User.findByPk(user_id);
        if (!user) {
            return res.status(404).json({ message: req.t('user.notFound') });
        }

        await ensurePostFileUploadCount({
            post,
            post_id: payload.post_id,
            user_id,
        });

        ensurePostFileSizeLimit(payload.size);

        await ensurePostFileTotalSize({
            post_id: payload.post_id,
            user_id,
            nextFileSize: payload.size,
        });

        const postFile = await PostFile.create({
            ...payload,
            user_id,
        });
        res.status(201).json({ message: req.t('postFile.createSuccess'), data: postFile })
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ message: req.t(error.message) });
        }
        res.status(500).json({ message: req.t('postFile.createFailed') });
    }
}

// // 获取上传链接
// exports.getUploadUrl = async (req, res) => {
//     const { post_id } = req.params;
//     const user_id = req.user.user_id;
//     try {
//         const cnt = await PostFile.count({
//             where: { user_id, post_id }
//         })
//         const post = await Post.findByPk(post_id)
//         if(cnt >= post.limit){
//             return res.status(403).json({ message: req.t('postFile.uploadLimit') });
//         }
//         const authCode = await getAuthCode()
//         const url = await fetchUploadUrl(authCode, String(post.folder_id));
//         if(url){
//             res.status(200).json({ data: url });
//         }
//     } catch (err) {
//         res.status(500).json({ message: req.t('postFile.uploadFailed') });
//     }
// }

// 获取文件下载url
// exports.getFileUrl = async (req, res) => {
//     const { file_id } = req.params;
//     try {
//         const file = await PostFile.findByPk(file_id);
//         if(!file) {
//             return res.status(404).json({ message: req.t('postFile.notFound') });
//         }
//         const authCode = await getAuthCode()
//         const url = await getSign(file.file_url, authCode)
//         res.status(200).json({ data: url.data });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: req.t('postFile.getUrlFailed') });
//     }
// }

exports.getFileUrl = async (req, res) => {
    const { file_id } = req.params;
    try {
        const file = await PostFile.findByPk(file_id);
        if(!file) {
            return res.status(404).json({ message: req.t('postFile.notFound') });
        }
        if (file.public_url || file.download_url) {
            return res.status(200).json({ data: file.public_url || file.download_url });
        }
        const url = await storage.getDownloadUrl(POSTFILES_STORAGE_SCOPE, {
            provider: getPostFileProvider(file),
            bucket: getPostFilesBucket(),
            objectName: getPostFileObjectName(file),
        })
        res.status(200).json({ data: url });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: req.t('postFile.getUrlFailed') });
    }
}

// 更新投稿备注
exports.updatePostFile = async (req, res) => {
    const { note } = req.body;
    const { file_id } = req.params;
    const userId = req.user.user_id;
    try {
        const originalPostFile = await PostFile.findByPk(file_id);
        if(!originalPostFile) {
            return res.status(404).json({ message: req.t('postFile.notFound') });
        }
        const isOwner = originalPostFile.user_id === userId;
        if(isOwner) {
            await originalPostFile.update({ note });
            res.status(200).json({ message: req.t('postFile.updateSuccess') });
        } else {
            res.status(403).json({ message: req.t('postFile.updateFailed') });
        }
    } catch (err) {
        res.status(500).json({ message: req.t('postFile.updateFailed') });
    }
}

// 审核投稿
exports.reviewPostFile = async (req, res) => {
    const { status, feedback } = req.body;
    const { file_id } = req.params;
    try {
        const originalPostFile = await PostFile.findByPk(file_id);
        if(!originalPostFile) {
            return res.status(404).json({ message: req.t('postFile.notFound') });
        }
        await originalPostFile.update({ status, feedback });
        res.status(200).json({ message: req.t('postFile.reviewSuccess') });
    } catch (err) {
        res.status(500).json({ message: req.t('postFile.updateFailed') });
    }
}

// 删除投稿，删除文件
exports.deleteFile = async (req, res) => {
    const { file_id } = req.params;
    try {
        const file = await PostFile.findByPk(file_id);
        if (!file) {
            return res.status(404).json({ message: req.t('postFile.notFound') });
        }
        await sequelize.transaction(async (t) => {
            await file.destroy({ transaction: t });
            if (getPostFileProvider(file) === EXTERNAL_STORAGE_PROVIDER) {
                return;
            }

            await storage.deleteFile(POSTFILES_STORAGE_SCOPE, {
                provider: getPostFileProvider(file),
                bucket: getPostFilesBucket(),
                objectName: getPostFileObjectName(file),
            });
        })
        res.json({ message: req.t('postFile.deleteSuccess') });
    } catch (error) {
        res.status(500).json({ message: req.t('postFile.deleteFailed') });
    }
}

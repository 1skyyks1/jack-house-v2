const { Badge } = require('../../models');
const upload = require('../../config/multer')
const { handleUpload } = require('../../middleware/uploadErrorHandler')
const fs = require('fs')
const sequelize = require('../../config/db')
const storage = require('../../services/storage')
const { buildContentHashObjectName, hashFile, optimizeImageFile } = require('../../utils/imageOptimizer')

const BADGES_STORAGE_SCOPE = 'BADGES';
const getBadgeObjectName = (badge) => badge.object_key || badge.minio_img_name;
const getBadgeProvider = (badge) => badge.storage_provider || 'minio';
const getBadgesBucket = () => storage.getBucketName(
    BADGES_STORAGE_SCOPE,
    ['MINIO_BADGES_BUCKET'],
    storage.getProviderName(BADGES_STORAGE_SCOPE) === 'github' ? 'badges' : null
);

// 上传牌子
exports.uploadBadge = [
    handleUpload(upload.badgeUpload.single('file')),
    async (req, res) => {
        const { name, redirect_url } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ message: req.t('badge.fileMissing') });
        }

        const filePath = file.path;
        const fileName = file.filename;

        try {
            const optimized = await optimizeImageFile(file, { convertToWebp: true });
            const checksum = await hashFile(filePath);
            const objectName = buildContentHashObjectName(checksum, optimized.mimeType, fileName);
            const uploaded = await storage.uploadFile(BADGES_STORAGE_SCOPE, {
                bucket: getBadgesBucket(),
                objectName,
                filePath,
                mimeType: optimized.mimeType,
                size: optimized.size,
            });

            await Badge.create({
                name: name,
                url: uploaded.url,
                redirect_url: redirect_url,
                minio_img_name: uploaded.objectName,
                storage_provider: uploaded.provider,
                object_key: uploaded.objectKey,
                public_url: uploaded.publicUrl,
                download_url: uploaded.downloadUrl,
                mime_type: uploaded.mimeType,
                checksum,
            });

            fs.unlinkSync(filePath);

            res.status(201).json({ message: req.t('badge.uploadSuccess') })
        } catch (error) {
            console.error('上传徽章时出错：', error);
            // 如果上传失败，删除临时文件
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            res.status(500).json({ message: req.t('badge.uploadFailed') });
        }
    }
]

// 获取牌子列表（管理系统用）
exports.getAllBadges = async (req, res) => {
    const { page, pageSize } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);
    try {
        const { count, rows } = await Badge.findAndCountAll({
            limit,
            offset,
            distinct: true,
            attributes: { exclude: ['url'] },
        });

        const signBadge = rows.map(async (badge) => {
            const signedUrl = badge.public_url || badge.download_url || await storage.getDownloadUrl(BADGES_STORAGE_SCOPE, {
                provider: getBadgeProvider(badge),
                bucket: getBadgesBucket(),
                objectName: getBadgeObjectName(badge),
            });
            const badgeData = badge.toJSON();
            delete badgeData.minio_img_name;
            badgeData.signedUrl = signedUrl;
            return badgeData;
        }) ;

        const signedBadges = await Promise.all(signBadge);

        const totalPages = Math.ceil(count / limit)
        res.status(200).json({
            data: signedBadges,
            page: parseInt(page, 10),
            pageSize: limit,
            total: count,
            totalPages: totalPages
        });
    } catch (error) {
        res.status(500).json({ message: req.t('badge.getFailed') });
    }
}

// 在牌子中添加拥有者
exports.addUsersToBadge = async (req, res) => {
    const badgeId = req.params.id;
    const { userIds } = req.body;
    if (!badgeId || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ message: req.t('badge.invalidParams') });
    }
    const t = await sequelize.transaction();
    try {
        const badge = await Badge.findByPk(badgeId, { transaction: t });
        if (!badge) {
            await t.rollback();
            return res.status(404).json({ message: req.t('badge.notFound') });
        }
        await badge.addUsers(userIds, { transaction: t });
        await t.commit();
        res.status(200).json({ message: req.t('badge.grantSuccess') });
    } catch (error) {
        await t.rollback();
        res.status(500).json({ message: req.t('badge.grantFailed') });
    }
}

exports.deleteBadge = async (req, res) => {
    const badgeId = req.params.id;
    try {
        const badge = await Badge.findByPk(badgeId);
        if (!badge) {
            return res.status(404).json({ message: req.t('badge.notFound') });
        }
        await storage.deleteFile(BADGES_STORAGE_SCOPE, {
            provider: getBadgeProvider(badge),
            bucket: getBadgesBucket(),
            objectName: getBadgeObjectName(badge),
        });
        await badge.destroy();
        res.status(200).json({ message: req.t('badge.deleteSuccess') });
    } catch (err) {
        res.status(500).json({ message: req.t('badge.deleteFailed') });
    }
}

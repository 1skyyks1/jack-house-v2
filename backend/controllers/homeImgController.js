const { HomeImg } = require('../models/index')
const sequelize = require('../config/db')
const { Op } = require('sequelize');
const fs = require('fs')
const upload = require('../config/multer')
const { handleUpload } = require('../middleware/uploadErrorHandler')
const storage = require('../services/storage')
const { buildContentHashObjectName, hashFile, optimizeImageFile } = require('../utils/imageOptimizer')

const HOMEIMG_STORAGE_SCOPE = 'HOMEIMG';
const getHomeImgObjectName = (img) => img.object_key || img.minio_img_name;
const getHomeImgProvider = (img) => img.storage_provider || 'minio';
const getHomeImgBucket = () => storage.getBucketName(
    HOMEIMG_STORAGE_SCOPE,
    ['MINIO_HOMEIMG_BUCKET'],
    storage.getProviderName(HOMEIMG_STORAGE_SCOPE) === 'github' ? 'home-img' : null
);

// 获取头图列表（管理后台用）
exports.getAllHomeImg = async (req, res) => {
    const { page, pageSize } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);
    try {
        const { count, rows } = await HomeImg.findAndCountAll({
            limit,
            offset,
            distinct: true,
            order: [
                [
                    sequelize.literal(`
                        CASE 
                            WHEN sort_order = 1 THEN 1
                            WHEN sort_order = 2 THEN 2
                            WHEN sort_order = 3 THEN 3
                            ELSE 4
                        END
                    `), 'ASC'
                ],
                ['created_time', 'DESC'],
            ],
        });

        const totalPages = Math.ceil(count / limit)
        res.json({ data: rows, page: parseInt(page, 10), pageSize: limit, totalPages, total: count })
    } catch (error) {
        res.status(500).json({ message: req.t('homeImg.getListFailed') })
    }
}

// 获取头图（首页使用）
exports.getHomeImg = async (req, res) => {
    try{
        const homeImgs = await HomeImg.findAll({
            where: {
                sort_order: {
                    [Op.in]: [1, 2, 3]
                }
            },
            order: [
                ['sort_order', 'ASC'],
                ['created_time', 'DESC']
            ]
        });

        const homeImgsPreSigned = await Promise.all(
            homeImgs.map(async (img) => {
                if (img.public_url || img.download_url) {
                    return {
                        ...img.toJSON(),
                        signedUrl: img.public_url || img.download_url
                    }
                }

                const signedUrl = await storage.getDownloadUrl(HOMEIMG_STORAGE_SCOPE, {
                    provider: getHomeImgProvider(img),
                    bucket: getHomeImgBucket(),
                    objectName: getHomeImgObjectName(img),
                });
                return{
                    ...img.toJSON(),
                    signedUrl: img.public_url || img.download_url || signedUrl
                }
            })
        )

        res.json({ data: homeImgsPreSigned })
    } catch (error) {
        res.status(500).json({ message: req.t('homeImg.getFailed') });
    }
}

// 上传头图
exports.uploadHomeImg = [
    handleUpload(upload.imageUpload.single('file')),
    async (req, res) => {
        const { redirect_url, sort_order, description } = req.body;
        const user_id = req.user.user_id;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ message: req.t('homeImg.uploadNoFile') });
        }

        const filePath = file.path;
        const fileName = file.filename;

        try {
            const optimized = await optimizeImageFile(file, { convertToWebp: true });
            const checksum = await hashFile(filePath);
            const objectName = buildContentHashObjectName(checksum, optimized.mimeType, fileName);
            const uploaded = await storage.uploadFile(HOMEIMG_STORAGE_SCOPE, {
                bucket: getHomeImgBucket(),
                objectName,
                filePath,
                mimeType: optimized.mimeType,
                size: optimized.size,
            });

            // 将文件信息保存到数据库
            const homeImg = await HomeImg.create({
                user_id,
                url: uploaded.url,
                storage_provider: uploaded.provider,
                object_key: uploaded.objectKey,
                public_url: uploaded.publicUrl,
                download_url: uploaded.downloadUrl,
                mime_type: uploaded.mimeType,
                redirect_url,
                minio_img_name: objectName,
                sort_order,
                description
            });

            // 删除临时文件
            fs.unlinkSync(filePath);

            res.status(201).json({ message: req.t('homeImg.uploadSuccess'), data: homeImg });
        } catch (error) {
            // 如果上传失败，删除临时文件
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            res.status(500).json({ message: req.t('homeImg.uploadFailed') });
        }
    }
];

// 更新头图信息
exports.updateHomeImg = async (req, res) => {
    const { redirect_url, sort_order, description } = req.body;
    const { img_id } = req.params;
    try{
        const originalImg = await HomeImg.findByPk(img_id);
        if(!originalImg){
            return res.status(404).json({ message: req.t('homeImg.notFound') });
        }
        await originalImg.update({ redirect_url, sort_order, description })
        res.status(200).json({ message: req.t('homeImg.updateSuccess') });
    } catch (err) {
        res.status(500).json({ message: req.t('homeImg.updateFailed') });
    }
}

// 删除头图
exports.deleteHomeImg = async (req, res) => {
    const { img_id } = req.params;
    try {
        const img = await HomeImg.findByPk(img_id);
        if (!img) {
            return res.status(404).json({ message: req.t('homeImg.notFound') });
        }
        await storage.deleteFile(HOMEIMG_STORAGE_SCOPE, {
            provider: getHomeImgProvider(img),
            bucket: getHomeImgBucket(),
            objectName: getHomeImgObjectName(img),
        });
        await img.destroy();
        res.status(200).json({ message: req.t('homeImg.deleteSuccess') })
    } catch (error) {
        res.status(500).json({ message: req.t('homeImg.deleteFailed') });
    }
}

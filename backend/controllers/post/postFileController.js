const { User, PostFile, Post } = require('../../models')
const ROLES = require('../../config/roles')
const sequelize = require('../../config/db')
const { Op } = require("sequelize");
// const { fetchUploadUrl, getSign, getAuthCode } = require('../../utils/pan');
const { upload } = require('../../config/multer')
// const { uploadToStorage, preSign } = require('../../utils/tebiS3')
const fs = require('fs')
const mc = require('../../config/minio')

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
    const { page, pageSize } = req.query
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);
    try {
        const { count, rows } = await PostFile.findAndCountAll({
            where: { user_id },
            order: [['uploaded_time', 'DESC']],
            limit,
            offset,
        });
        const totalPages = Math.ceil(count / limit)
        res.json({ data: rows, page: parseInt(page, 10), pageSize: limit, totalPages, total: count });
    } catch (error){
        res.status(500).json({ message: req.t('postFile.getFailed') });
    }
}

// 上传文件
exports.uploadFile = [
    upload.single('file'),
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

            if (post.limit !== null) {
                const uploadCount = await PostFile.count({
                    where: { post_id, user_id }
                });

                if (uploadCount >= post.limit) {
                    removeTempFile();
                    return res.status(403).json({ message: req.t('postFile.uploadLimit') });
                }
            }

            await mc.fPutObject(process.env.MINIO_POSTFILES_BUCKET, fileName, filePath, {
                'Content-Type': file.mimetype,
            });

            const postFile = await PostFile.create({
                post_id,
                user_id,
                file_name: Buffer.from(file.originalname, 'latin1').toString('utf8'),
                file_url: fileName,
                size: file.size,
            });

            removeTempFile();
            res.status(201).json({ message: req.t('postFile.uploadSuccess'), data: postFile });
        } catch (error) {
            // 如果上传失败，删除临时文件
            removeTempFile();
            console.log(error)
            res.status(500).json({ message: req.t('postFile.uploadFailed') });
        }
    }
];

// 创建投稿
exports.createPostFile = async (req, res) => {
    const { post_id, file_url, file_name, size } = req.body;
    const user_id = req.user.user_id;
    try {
        await PostFile.create({
            post_id,
            user_id,
            file_name,
            file_url,
            size
        });
        res.status(201).json({ message: req.t('postFile.createSuccess') })
    } catch (error) {
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

const preSign = async (name) => {
    const expires = 24 * 60 * 60;
    return await mc.presignedUrl('GET', process.env.MINIO_POSTFILES_BUCKET, name, expires)
}

exports.getFileUrl = async (req, res) => {
    const { file_id } = req.params;
    try {
        const file = await PostFile.findByPk(file_id);
        if(!file) {
            return res.status(404).json({ message: req.t('postFile.notFound') });
        }
        const url = await preSign(file.file_url)
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
            await mc.removeObject(process.env.MINIO_POSTFILES_BUCKET, file.file_url);
        })
        res.json({ message: req.t('postFile.deleteSuccess') });
    } catch (error) {
        res.status(500).json({ message: req.t('postFile.deleteFailed') });
    }
}

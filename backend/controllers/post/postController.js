const { Post, PostTranslation, User } = require('../../models');
const sequelize = require('../../config/db')
const { Op } = require('sequelize');
const {
    BOUNTY_POST_TYPE, BountyValidationError, isValidPostType, serializePost, linkedPacksInclude,
    validateBountyTranslations, parseBountyEnd, validateBountyPackIds, replaceBountyPacks,
} = require('../../services/postBountyService');
const { can } = require('../../utils/permissions');

const canPublishType = (req, type) => Number(type) === 0
    || Number(type) === BOUNTY_POST_TYPE
    || (Number(type) === 1 && (can(req, 'postFiles') || can(req, 'events') || can(req, 'posts')))
    || (Number(type) === 2 && (can(req, 'events') || can(req, 'posts')))
    || (Number(type) === 3 && can(req, 'announcement'));
const canModeratePost = (req, post) => can(req, Number(post.type) === 3 ? 'announcement' : 'posts');
const { sanitizeRichTextHtml } = require('../../utils/richTextSanitizer');
const { extractImageSources, syncRichTextAssetReferences } = require('../../services/richTextAssetService');
// const { addFolder, getAuthCode } = require('../../utils/pan');

// 获取所有帖子
exports.getAllPosts = async (req, res) => {
    const { page, pageSize } = req.query
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);
    try {
        const { count, rows } = await Post.findAndCountAll({
            limit,
            offset,
            distinct: true,
            order: [['created_time', 'DESC']],
            include: [
                {
                    model: PostTranslation,
                    as: 'translations',
                    attributes: ['title', 'content', 'language'],
                },
                {
                    model: User,
                    as: 'user',
                    attributes: ['user_name'],
                }
            ]
        });

        const result = processPosts(rows)
        const totalPages = Math.ceil(count / limit)
        res.json({ data: result, page: parseInt(page, 10), pageSize: limit, totalPages, total: count });
    } catch (error) {
        res.status(500).json({ message: req.t('post.listFailed') });
    }
};

// 获取指定类型帖子列表
exports.getPostByType = async (req, res) => {
    const { type } = req.params;
    const { page, pageSize } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);
    try {
        const { count, rows } = await Post.findAndCountAll({
            where: {
                type,
            },
            limit,
            offset,
            distinct: true,
            order: [['created_time', 'DESC']],
            include: [
                {
                    model: PostTranslation,
                    as: 'translations',
                    attributes: ['title', 'content', 'language'],
                },
                {
                    model: User,
                    as: 'user',
                    attributes: ['user_name'],
                }
            ]
        });

        const result = rows.length ? processPosts(rows) : [];
        const totalPages = Math.ceil(count / limit);
        res.json({ data: result, page: parseInt(page, 10), pageSize: limit, totalPages, total: count });
    } catch (error) {
        res.status(500).json({ message: req.t('post.listFailed') });
    }
}

// 获取指定类型帖子列表（有帖子内容），用于主页公告栏
exports.getPostWithContentByType = async (req, res) => {
    const { type } = req.params;
    const { page, pageSize } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);
    try{
        const {count, rows} = await Post.findAndCountAll({
            where: {type},
            limit,
            offset,
            distinct: true,
            order: [['created_time', 'DESC']],
            include: [
                {
                    model: PostTranslation,
                    as: 'translations',
                    attributes: ['title', 'content', 'language'],
                },
                {
                    model: User,
                    as: 'user',
                    attributes: ['user_name'],
                }
            ]
        })

        const processedPosts = rows.map(post => {
            const postData = serializePost(post);

            // 提取中文翻译
            const zhTranslation = postData.translations.find(t => t.language === 'zh') || {};
            postData.title_zh = zhTranslation.title || null;
            postData.content_zh = zhTranslation.content || null;

            // 提取英文翻译
            const enTranslation = postData.translations.find(t => t.language === 'en') || {};
            postData.title_en = enTranslation.title || null;
            postData.content_en = enTranslation.content || null;

            // 提取用户信息
            if (postData.user) {
                postData.user_name = postData.user.user_name;
                delete postData.user;
            }

            delete postData.translations;
            return postData;
        });

        res.json({
            data: processedPosts,
            page: parseInt(page, 10),
            pageSize: limit,
            totalPages: Math.ceil(count / limit),
            total: count
        });

    } catch (error) {
        res.status(500).json({ message: req.t('post.listFailed') });
    }
}

// 获取某个用户的所有帖子
exports.getPostsByUserId = async (req, res) => {
    const { user_id } = req.params;
    const { page, pageSize } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);
    try {
        const { count, rows } = await Post.findAndCountAll({
            where: {
                user_id,
            },
            limit,
            offset,
            distinct: true,
            order: [['created_time', 'DESC']],
            include: [
                {
                    model: PostTranslation,
                    as: 'translations',
                    attributes: ['title', 'language'],
                },
                {
                    model: User,
                    as: 'user',
                    attributes: ['user_name'],
                }
            ]
        });

        const result = rows.length ? processPosts(rows) : [];
        const totalPages = Math.ceil(count / limit);
        res.json({ data: result, page: parseInt(page, 10), pageSize: limit, totalPages, total: count });
    } catch (error) {
        res.status(500).json({ message: req.t('post.listFailed') });
    }
};

// 获取所有征稿帖（投稿审核系统用）
exports.getRequestList = async (req, res) => {
    try {
        const rows = await Post.findAll({
            where: { type: 1 },
            order: [['created_time', 'DESC']],
            include: [
                {
                    model: PostTranslation,
                    as: 'translations',
                    attributes: ['title', 'language'],
                }
            ]
        });

        const results = rows.length ? processPosts(rows) : [];

        res.json({ data: results })
    } catch(error) {
        console.log(error);
        res.status(500).json({ message: req.t('post.listFailed') });
    }
}

// 公共的处理帖子数据的函数
const processPosts = (posts) => {
    return posts.map(post => {
        const postData = serializePost(post);
        const zhTranslation = postData.translations.find(t => t.language === 'zh');
        const enTranslation = postData.translations.find(t => t.language === 'en');

        // 提取翻译内容
        postData.title_zh = zhTranslation?.title || null;
        postData.title_en = enTranslation?.title || null;
        postData.cover_image_zh = extractImageSources(zhTranslation?.content)[0] || null;
        postData.cover_image_en = extractImageSources(enTranslation?.content)[0] || null;
        delete postData.translations;

        if(postData.user){
            // 提取用户信息
            postData.user_name = postData.user.user_name;
            // 删除冗余字段
            delete postData.user;
        }

        return postData;
    });
};

// 获取单个帖子
exports.getPostById = async (req, res) => {
    try {
        const post = await Post.findByPk(
            req.params.post_id,
            {
                include: [
                    {
                        model: PostTranslation,
                        as: 'translations',
                        attributes: ['title', 'content', 'language']
                    },
                    {
                        model: User,
                        as: 'user',
                        attributes: ['user_name', 'avatar'],
                    },
                    linkedPacksInclude(),
                ]
            });
        if (post) {
            res.json({ data: serializePost(post) });
        } else {
            res.status(404).json({ message: req.t('post.notFound') });
        }
    } catch (error) {
        res.status(500).json({ message: req.t('post.getPostFailed') });
    }
};

// 创建帖子
exports.createPost = async (req, res) => {
    const { type, translations, end, limit, pack_ids } = req.body;
    const user_id = req.user.user_id;
    if (!isValidPostType(type)) {
        return res.status(400).json({ message: req.t('post.invalidType') });
    }
    if (!canPublishType(req, type)) {
        return res.status(403).json({ message: req.t('post.noPermission') });
    }

    let endDate;
    if(Number(type) === 1 && end) {
        endDate = new Date(end);
        const now = new Date();
        if(endDate < now) { // 征稿结束时间
            return res.status(400).json({ message: req.t('post.startAfterEnd') })
        }
    }

    let t;
    try {
        if (Number(type) === BOUNTY_POST_TYPE) {
            endDate = parseBountyEnd(end);
            validateBountyTranslations(translations);
        } else if (pack_ids !== undefined && (!Array.isArray(pack_ids) || pack_ids.length)) {
            throw new BountyValidationError('post.bountyPacksOnly');
        }
        t = await sequelize.transaction();
        if (Number(type) === BOUNTY_POST_TYPE) await validateBountyPackIds(pack_ids, t);
        const newPost = await Post.create({
            user_id,
            type: Number(type),
            end: endDate || null,
            limit: Number(type) === BOUNTY_POST_TYPE ? null : limit || null,
        }, { transaction: t });

        if (Number(type) === BOUNTY_POST_TYPE) await replaceBountyPacks(newPost.post_id, pack_ids, t);

        for(const { language, title, content } of translations){
            const sanitizedContent = sanitizeRichTextHtml(content);
            const translation = await PostTranslation.create({
                post_id: newPost.post_id,
                language,
                title,
                content: sanitizedContent,
            },{ transaction: t });
            await syncRichTextAssetReferences({
                contentType: 'post_translation',
                contentId: translation.post_translation_id,
                html: sanitizedContent,
                transaction: t,
            });
        }

        await t.commit();
        res.status(201).json({ data: { post_id: newPost.post_id } });
    } catch (error) {
        if (t && !t.finished) await t.rollback();
        if (error instanceof BountyValidationError) return res.status(400).json({ message: req.t(error.key) });
        console.error(error)
        res.status(500).json({ message: req.t('post.createFailed') });
    }
};

// 更新帖子
exports.updatePost = async (req, res) => {
    const { post_id } = req.params;
    const { type, translations, end, limit, pack_ids } = req.body;
    const user_id = req.user.user_id;
    if (type !== undefined && !isValidPostType(type)) {
        return res.status(400).json({ message: req.t('post.invalidType') });
    }
    let transaction;
    try {
        const post = await Post.findByPk(post_id);
        if (!post) return res.status(404).json({ message: req.t('post.notFound') });
        if (!canModeratePost(req, post) && post.user_id !== user_id) {
            return res.status(403).json({ message: req.t('post.updateForbidden') });
        }
        if (type !== undefined && Number(type) !== Number(post.type) && !canPublishType(req, type)) {
            return res.status(403).json({ message: req.t('post.noPermission') });
        }
        if (Number(post.type) === BOUNTY_POST_TYPE && type !== undefined && Number(type) !== BOUNTY_POST_TYPE) {
            throw new BountyValidationError('post.bountyTypeFixed');
        }
        transaction = await sequelize.transaction();
        // Serialize edits with manual closure; a concurrent edit must never reopen a closed bounty.
        const existingPost = await Post.findByPk(post_id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!existingPost) {
            await transaction.rollback();
            return res.status(404).json({ message: req.t('post.notFound') });
        }
        if (!canModeratePost(req, existingPost) && existingPost.user_id !== user_id) {
            await transaction.rollback();
            return res.status(403).json({ message: req.t('post.updateForbidden') });
        }
        if (Number(existingPost.type) === BOUNTY_POST_TYPE && type !== undefined && Number(type) !== BOUNTY_POST_TYPE) {
            throw new BountyValidationError('post.bountyTypeFixed');
        }
        const nextType = Number(type ?? existingPost.type);
        if (nextType !== Number(existingPost.type) && !canPublishType(req, nextType)) {
            await transaction.rollback();
            return res.status(403).json({ message: req.t('post.noPermission') });
        }
        if (nextType === BOUNTY_POST_TYPE) {
            if (translations !== undefined || Number(existingPost.type) !== BOUNTY_POST_TYPE) validateBountyTranslations(translations);
            if (end !== undefined || Number(existingPost.type) !== BOUNTY_POST_TYPE) {
                existingPost.end = parseBountyEnd(end, {
                    existingEnd: Number(existingPost.type) === BOUNTY_POST_TYPE ? existingPost.end : null,
                });
            }
            if (pack_ids !== undefined || Number(existingPost.type) !== BOUNTY_POST_TYPE) {
                await validateBountyPackIds(pack_ids, transaction);
                await replaceBountyPacks(post_id, pack_ids, transaction);
            }
            existingPost.limit = null;
        } else {
            if (pack_ids !== undefined && (!Array.isArray(pack_ids) || pack_ids.length)) {
                throw new BountyValidationError('post.bountyPacksOnly');
            }
            if (nextType === 1 && end) {
                const endDate = new Date(end);
                if (!Number.isFinite(endDate.getTime()) || endDate <= new Date()) {
                    throw new BountyValidationError('post.startAfterEnd');
                }
                existingPost.end = endDate;
            }
            existingPost.limit = limit ?? existingPost.limit;
        }
        existingPost.type = nextType;
        await existingPost.save({ transaction });
        if (Array.isArray(translations)) {
            for (const { language, title, content } of translations) {
                if (!language || (nextType !== BOUNTY_POST_TYPE && !title && !content)) continue;
                const existingTranslation = await PostTranslation.findOne({ where: { post_id, language }, transaction });
                const hasContent = content !== undefined && content !== null;
                const sanitizedContent = hasContent || !existingTranslation
                    ? sanitizeRichTextHtml(content) : existingTranslation.content;
                let translation;
                if (existingTranslation) {
                    existingTranslation.title = nextType === BOUNTY_POST_TYPE ? title : title || existingTranslation.title;
                    existingTranslation.content = sanitizedContent;
                    await existingTranslation.save({ transaction });
                    translation = existingTranslation;
                } else {
                    translation = await PostTranslation.create({ post_id, language, title, content: sanitizedContent }, { transaction });
                }
                if (hasContent) await syncRichTextAssetReferences({
                    contentType: 'post_translation', contentId: translation.post_translation_id,
                    html: sanitizedContent, transaction,
                });
                existingPost.changed('updated_time', true);
            }
            await existingPost.save({ transaction });
        }
        await transaction.commit();
        res.json({ message: req.t('post.updateSuccess') });
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback();
        if (error instanceof BountyValidationError) return res.status(400).json({ message: req.t(error.key) });
        console.error(error);
        res.status(500).json({ message: req.t('post.updateFailed') });
    }
};

exports.closeBounty = async (req, res) => {
    let transaction;
    try {
        transaction = await sequelize.transaction();
        const post = await Post.findByPk(req.params.post_id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!post) {
            await transaction.rollback();
            return res.status(404).json({ message: req.t('post.notFound') });
        }
        if (!canModeratePost(req, post) && post.user_id !== req.user.user_id) {
            await transaction.rollback();
            return res.status(403).json({ message: req.t('post.updateForbidden') });
        }
        if (Number(post.type) !== BOUNTY_POST_TYPE) throw new BountyValidationError('post.notBounty');
        if (!post.bounty_closed_at) {
            post.bounty_closed_at = new Date();
            await post.save({ transaction });
        }
        await transaction.commit();
        res.json({ data: {
            post_id: post.post_id, bounty_closed_at: post.bounty_closed_at, bounty_status: 'closed',
        }, message: req.t('post.bountyClosed') });
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback();
        if (error instanceof BountyValidationError) return res.status(400).json({ message: req.t(error.key) });
        console.error(error);
        res.status(500).json({ message: req.t('post.updateFailed') });
    }
};

// 删除帖子
exports.deletePost = async (req, res) => {
    const { post_id } = req.params;
    const user_id = req.user.user_id;
    try {
        const post = await Post.findByPk(post_id);
        if (!post) {
            return res.status(404).json({ message: req.t('post.notFound') });
        }
        const isAdmin = canModeratePost(req, post);
        const isOwner = post.user_id === user_id;
        if (isAdmin || isOwner) {
            await post.destroy();
            res.status(200).json({ message: req.t('post.deleteSuccess') });
        } else {
            res.status(403).json({ message: req.t('post.deleteForbidden') });
        }
    } catch (error) {
        res.status(500).json({ message: req.t('post.deleteFailed') });
    }
};

// 搜索帖子
exports.searchPosts = async (req, res) => {
    const { keyword, locale, page, pageSize } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);

    try {
        const { count, rows } = await Post.findAndCountAll({
            limit,
            offset,
            distinct: true,
            order: [['created_time', 'DESC']],
            include: [
                {
                    model: PostTranslation,
                    as: 'translations',
                    attributes: ['title', 'language'],
                    where: {
                        language: locale,
                        [Op.or]: [
                            { title: { [Op.like]: `%${keyword}%` } },
                            { content: { [Op.like]: `%${keyword}%` } },
                        ],
                    },
                    required: true,
                },
                {
                    model: User,
                    as: 'user',
                    attributes: ['user_name'],
                }
            ]
        });

        const result = rows.map(post => {
            const translation = post.translations[0];
            return {
                value: translation.title,
                post_id: post.post_id,
                time: post.created_time
            };
        });
        const totalPages = Math.ceil(count / limit);
        res.status(200).json({ data: result, page: parseInt(page, 10), pageSize: limit, totalPages, total: count });
    } catch (error) {
        res.status(500).json({ message: req.t('post.searchFailed') });
    }
};

exports.getAllType3Posts = async (req, res) => {
    const types =  [0, 1, 2, 3, 4];
    const limit = 3;

    try {
        const results = await Promise.all(types.map(async (type) => {
            const { rows } = await Post.findAndCountAll({
                where: { type },
                limit,
                order: [['created_time', 'DESC']],
                include: [
                    {
                        model: PostTranslation,
                        as: 'translations',
                        attributes: ['title', 'language'],
                    },
                    {
                        model: User,
                        as: 'user',
                        attributes: ['user_name'],
                    }
                ]
            });

            return {
                type,
                posts: rows.length ? processPosts(rows) : [],
            };
        }));

        res.json({ data: results });
    } catch (error) {
        res.status(500).json({ message: req.t('post.listFailed') });
    }
};

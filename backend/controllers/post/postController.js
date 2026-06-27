const { Post, PostTranslation, User } = require('../../models');
const sequelize = require('../../config/db')
const { Op } = require('sequelize');
const ROLES = require("../../config/roles");
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
                    attributes: ['title', 'language'],
                },
                {
                    model: User,
                    as: 'user',
                    attributes: ['user_name', 'role'],
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
                    attributes: ['title', 'language'],
                },
                {
                    model: User,
                    as: 'user',
                    attributes: ['user_name', 'role'],
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
                    attributes: ['user_name', 'role'],
                }
            ]
        })

        const processedPosts = rows.map(post => {
            const postData = post.toJSON();

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
                postData.role = postData.user.role;
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
                    attributes: ['user_name', 'role'],
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
        const postData = post.toJSON();

        // 提取翻译内容
        postData.title_zh = postData.translations.find(t => t.language === 'zh')?.title || null;
        postData.title_en = postData.translations.find(t => t.language === 'en')?.title || null;
        delete postData.translations;

        if(postData.user){
            // 提取用户信息
            postData.user_name = postData.user.user_name;
            postData.role = postData.user.role;
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
                        attributes: ['user_name', 'role', 'avatar'],
                    }
                ]
            });
        if (post) {
            res.json({ data: post });
        } else {
            res.status(404).json({ message: req.t('post.notFound') });
        }
    } catch (error) {
        res.status(500).json({ message: req.t('post.getPostFailed') });
    }
};

// 创建帖子
exports.createPost = async (req, res) => {
    const { type, translations, end, limit } = req.body;
    const user_id = req.user.user_id;
    const userRole = req.user.role;

    const roleTypePermissions = {
        0: [0],         // USER 只能发常规帖
        1: [0, 1, 2],   // ORG 可以发除了公告以外的帖子
        2: 'all',       // ADMIN 可以发所有帖子
    };

    if(
        roleTypePermissions[userRole] !== 'all' &&
        !roleTypePermissions[userRole].includes(type)
    ) {
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

    const t = await sequelize.transaction();

    try {
        const newPost = await Post.create({
            user_id,
            type,
            end: endDate || null,
            limit: limit || null,
        }, { transaction: t });

        for(const { language, title, content } of translations){
            await PostTranslation.create({
                post_id: newPost.post_id,
                language,
                title,
                content,
            },{ transaction: t });
        }

        await t.commit();
        res.status(201).json({ data: { post_id: newPost.post_id } });
    } catch (error) {
        await t.rollback();
        console.error(error)
        res.status(500).json({ message: req.t('post.createFailed') });
    }
};

// 更新帖子
exports.updatePost = async (req, res) => {
    const { post_id } = req.params;
    const { type, translations, end, limit } = req.body;
    const user_id = req.user.user_id;
    const role = req.user.role;

    let endDate;
    if(Number(type) === 1 && end) {
        endDate = new Date(end);
        const now = new Date();
        if(endDate < now) { //征稿结束时间
            return res.status(400).json({ message: req.t('post.startAfterEnd') })
        }
    }

    try {
        const existingPost = await Post.findByPk(post_id);
        if (!existingPost) {
            return res.status(404).json({ message: req.t('post.notFound') });
        }
        const isAdmin = role === ROLES.ADMIN;
        const isOwner = existingPost.user_id === user_id;
        if (isAdmin || isOwner) {
            existingPost.type = type ?? existingPost.type;
            existingPost.end = endDate ?? existingPost.end;
            existingPost.limit = limit ?? existingPost.limit;
            await existingPost.save();

            let translationModified = false;

            if (translations && Array.isArray(translations)) {
                for (const { language, title, content } of translations) {

                    // 如果指定了语言，则更新相应语言的翻译
                    if (language && (title || content)) {
                        const existingTranslation = await PostTranslation.findOne({
                            where: { post_id, language }
                        });

                        if (existingTranslation) {
                            // 更新已有的翻译
                            existingTranslation.title = title || existingTranslation.title;
                            existingTranslation.content = content || existingTranslation.content;
                            await existingTranslation.save();
                            translationModified = true;
                        } else {
                            // 如果没有找到该语言的翻译，创建新的翻译记录
                            await PostTranslation.create({
                                post_id,
                                language,
                                title,
                                content
                            });
                            translationModified = true;
                        }
                    }
                }
                if (translationModified){ // 当修改帖子内容时，触发updated_time更新
                    existingPost.changed('updated_time', true);
                    await existingPost.save();
                }
            }
            res.json({ message: req.t('post.updateSuccess') });
        } else {
            res.status(403).json({ message: req.t('post.updateForbidden') });
        }
    } catch (error) {
        res.status(500).json({ message: req.t('post.updateFailed') });
    }
};

// 删除帖子
exports.deletePost = async (req, res) => {
    const { post_id } = req.params;
    const user_id = req.user.user_id;
    const role = req.user.role;
    try {
        const post = await Post.findByPk(post_id);
        if (!post) {
            return res.status(404).json({ message: req.t('post.notFound') });
        }
        const isAdmin = role === ROLES.ADMIN;
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
                    attributes: ['user_name', 'role'],
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
    const types =  [0, 1, 2, 3];
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
                        attributes: ['user_name', 'role'],
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

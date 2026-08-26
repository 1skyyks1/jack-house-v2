const { Pack, Tag, User, PackMap, PackComment, PackFeedback } = require('../../models');
const sequelize = require('../../config/db')
const { Op } = require('sequelize');
const { validatePackTagSelection } = require('../../services/packTagService');

// 创建新图包（非osu）
exports.createPack = async (req, res) => {
    const { title, creator, url, tags, type } = req.body;
    const user_id = req.user.user_id;

    if (!title || !Array.isArray(tags)) {
        return res.status(400).json({ message: req.t('pack.createMissing') });
    }

    let selection;
    try {
        selection = await validatePackTagSelection(tags, type);
        if (!selection.valid) {
            return res.status(400).json({ message: req.t('tag.invalidForPackType') });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: req.t('pack.createFailed') });
    }

    const t = await sequelize.transaction();

    try {
        const pack = await Pack.create({
            title,
            creator,
            user_id,
            other_url: url,
            type
        }, { transaction: t });

        // 关联标签
        await pack.addTags(selection.tagIds, { transaction: t });
        await t.commit();

        res.status(201).json({ data: pack });
    } catch (error) {
        await t.rollback();
        res.status(500).json({ message: req.t('pack.createFailed') });
    }
};

// 获取图包列表（带筛选和分页）
exports.getAllPacks = async (req, res) => {
    const { page, pageSize, searchKeys, tags, type, graveyard, ranked, loved, recommended, original, sort } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);
    const keyword = decodeURIComponent(searchKeys || '');
    const sortNum = Number(sort);
    try {
        const findOptions = {
            distinct: true,
            limit,
            offset,
            order: [['created_time', 'DESC']],
            attributes: { exclude: ['user_id', 'description'] },
            where: {},
            include: [
                {
                    model: Tag,
                    as: 'tags',
                    attributes: ['tag_id', 'tag_key', 'tag_name', 'category', 'name_zh', 'name_en', 'sort_order', 'enabled'],
                    through: { attributes: [] }
                },
                {
                    model: User,
                    as: 'user',
                    attributes: ['user_id', 'user_name']
                },
            ]
        };

        if (searchKeys) {
            findOptions.where = {
                [Op.or]: [
                    { title: { [Op.like]: `%${keyword}%` } },
                    { title_unicode: { [Op.like]: `%${keyword}%` } },
                    { artist: { [Op.like]: `%${keyword}%` } },
                    { artist_unicode: { [Op.like]: `%${keyword}%` } },
                    { creator: { [Op.like]: `%${keyword}%` } }
                ]
            };
        }

        if (sortNum === 1) {
            findOptions.order = [['submitted_date', 'ASC']];
        } else if (sortNum === 2) {
            findOptions.order = [['submitted_date', 'DESC']];
        }

        if (type) {
            findOptions.where.type = Number(type);
        }

        const statusArr = [];
        if (graveyard) statusArr.push(-2);
        if (ranked) statusArr.push(1);
        if (loved) statusArr.push(4);
        if (statusArr.length > 0) {
            findOptions.where.status = { [Op.in]: statusArr };
        }

        if (recommended === '1' || recommended === 'true') {
            findOptions.where.is_recommended = true;
        }

        if (original === '1' || original === 'true') {
            findOptions.where.is_original = true;
        }

        if (tags) {
            const tagIdArray = Array.isArray(tags) ? tags.map(Number) : [Number(tags)];
            findOptions.include[0].where = { tag_id: { [Op.in]: tagIdArray } };
        }

        const { count, rows } = await Pack.findAndCountAll(findOptions);
        const totalPages = Math.ceil(count / limit)

        res.status(200).json({
            total: count,
            totalPages,
            pageSize: limit,
            page: parseInt(page, 10),
            data: rows
        });
    } catch (error) {
        res.status(500).json({ message: req.t('pack.getListFailed') });
    }
};

exports.updateRecommendation = async (req, res) => {
    const recommended = req.body?.recommended;
    if (typeof recommended !== 'boolean') {
        return res.status(400).json({ message: req.t('pack.invalidRecommendation') });
    }

    try {
        const pack = await Pack.findByPk(req.params.pack_id);
        if (!pack) return res.status(404).json({ message: req.t('pack.notFound') });

        await pack.update({
            is_recommended: recommended,
            recommended_at: recommended ? new Date() : null,
            recommended_by: recommended ? req.user.user_id : null,
        });
        return res.status(200).json({
            data: {
                is_recommended: Boolean(pack.is_recommended),
                recommended_at: pack.recommended_at,
                recommended_by: pack.recommended_by,
            },
            message: req.t(recommended ? 'pack.recommendSuccess' : 'pack.unrecommendSuccess'),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: req.t('pack.updateFailed') });
    }
};

exports.updateOriginal = async (req, res) => {
    const original = req.body?.original;
    if (typeof original !== 'boolean') {
        return res.status(400).json({ message: req.t('pack.invalidOriginal') });
    }

    try {
        const pack = await Pack.findByPk(req.params.pack_id);
        if (!pack) return res.status(404).json({ message: req.t('pack.notFound') });

        await pack.update({
            is_original: original,
            original_at: original ? new Date() : null,
            original_by: original ? req.user.user_id : null,
        });
        return res.status(200).json({
            data: {
                is_original: Boolean(pack.is_original),
                original_at: pack.original_at,
                original_by: pack.original_by,
            },
            message: req.t(original ? 'pack.originalSuccess' : 'pack.unoriginalSuccess'),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: req.t('pack.updateFailed') });
    }
};

// 获取单个图包的详细信息
exports.getPackById = async (req, res) => {
    try {
        const pack = await Pack.findByPk(req.params.pack_id, {
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['user_id', 'user_name', 'avatar']
                },
                {
                    model: Tag,
                    as: 'tags',
                    attributes: ['tag_id', 'tag_key', 'tag_name', 'category', 'name_zh', 'name_en', 'sort_order', 'enabled'],
                    through: { attributes: [] }
                },
                {
                    model: PackMap,
                    as: 'maps',
                }
            ]
        });

        if (!pack) {
            return res.status(404).json({ message: req.t('pack.notFound') });
        }

        res.status(200).json({ data: pack });
    } catch (error) {
        res.status(500).json({ message: req.t('pack.getDetailFailed') });
    }
};

// 删除图包
exports.deletePack = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        const pack = await Pack.findByPk(req.params.pack_id, { transaction: t });

        if (!pack) {
            await t.rollback();
            return res.status(404).json({ message: req.t('pack.notFound') });
        }

        await pack.setTags([], { transaction: t });
        await PackMap.destroy({ where: { pack_id: pack.pack_id }, transaction: t });
        await PackComment.destroy({ where: { pack_id: pack.pack_id }, transaction: t });
        await PackFeedback.destroy({ where: { pack_id: pack.pack_id }, transaction: t });
        await pack.destroy({ transaction: t });

        await t.commit();
        res.status(200).json({ message: req.t('pack.deleteSuccess') });
    } catch (error) {
        await t.rollback();
        res.status(500).json({ message: req.t('pack.deleteFailed') });
    }
};

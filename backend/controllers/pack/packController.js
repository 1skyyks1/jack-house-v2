const { Pack, Tag, User, PackMap, PackComment, PackFeedback } = require('../../models');
const sequelize = require('../../config/db')
const { Op } = require('sequelize');
const { validatePackTagSelection } = require('../../services/packTagService');
const { getAllowedTagCategories } = require('../../utils/packTag');
const { backfillPackScoresFromEvents } = require('../../services/packRankService');
const { capturePackScores } = require('../../services/pp/repository');
const { activeBountyCountSql, activeBountyNextEndSql, serializePackBountyCount, getActivePackBounties } = require('../../services/postBountyService');

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
    const { page, pageSize, searchKeys, bid, packId, tags, type, graveyard, ranked, featured, loved, recommended, original, bounty, sort, pending, osuStatus } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);
    const keyword = decodeURIComponent(searchKeys || '').trim();
    const sortNum = Number(sort);
    try {
        const bountyNow = new Date();
        const bountyCountSql = activeBountyCountSql(bountyNow);
        const findOptions = {
            distinct: true,
            limit,
            offset,
            order: [['created_time', 'DESC']],
            attributes: { exclude: ['user_id', 'description'], include: [
                [sequelize.literal(bountyCountSql), 'bounty_count'],
                [sequelize.literal(activeBountyNextEndSql(bountyNow)), 'bounty_next_end_at'],
            ] },
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
                {
                    model: PackMap,
                    as: 'maps',
                    attributes: ['map_id', 'rating', 'version', 'key_count']
                }
            ]
        };

        // 支持站内图包 ID 精确筛选
        if (packId) {
            const packIdNum = Number.parseInt(packId, 10);
            if (Number.isInteger(packIdNum) && packIdNum > 0) {
                findOptions.where.pack_id = packIdNum;
            }
        }

        // 支持精确 bid 参数筛选
        if (bid) {
            const bidNum = Number.parseInt(bid, 10);
            if (Number.isInteger(bidNum) && bidNum > 0) {
                findOptions.where.osu_bid = bidNum;
            }
        }

        // 关键词搜索（支持标题、曲师、谱师、osu_bid 及 pack_id）
        if (keyword) {
            const orConditions = [
                { title: { [Op.like]: `%${keyword}%` } },
                { title_unicode: { [Op.like]: `%${keyword}%` } },
                { artist: { [Op.like]: `%${keyword}%` } },
                { artist_unicode: { [Op.like]: `%${keyword}%` } },
                { creator: { [Op.like]: `%${keyword}%` } }
            ];

            // 提取纯数字或 "bid: 12345" 形式中的数字，匹配 osu_bid 与 pack_id
            const bidMatch = keyword.match(/^(?:bid[:：\s]*)?(\d+)$/i);
            if (bidMatch) {
                const numericValue = Number.parseInt(bidMatch[1], 10);
                if (Number.isInteger(numericValue) && numericValue > 0) {
                    orConditions.push({ osu_bid: numericValue });
                    orConditions.push({ pack_id: numericValue });
                }
            }

            findOptions.where[Op.or] = orConditions;
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
        if (pending) statusArr.push(0, -1);
        if (osuStatus) {
            if (osuStatus === 'ranked') statusArr.push(1);
            else if (osuStatus === 'loved') statusArr.push(4);
            else if (osuStatus === 'pending_wip' || osuStatus === 'pending') statusArr.push(0, -1);
            else if (osuStatus === 'graveyard') statusArr.push(-2);
        }
        if (statusArr.length > 0) {
            findOptions.where.status = { [Op.in]: Array.from(new Set(statusArr)) };
        }

        if (recommended === '1' || recommended === 'true') {
            findOptions.where.is_recommended = true;
        }

        if (bounty === '1' || bounty === 'true') {
            findOptions.where[Op.and] = sequelize.literal(`${bountyCountSql} > 0`);
        }

        if (original === '1' || original === 'true') {
            findOptions.where.is_original = true;
        }

        if (featured === '1' || featured === 'true') {
            findOptions.where.leaderboard_enabled = true;
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
            data: rows.map(serializePackBountyCount)
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

exports.updateLeaderboard = async (req, res) => {
    const enabled = req.body?.enabled;
    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ message: req.t('pack.invalidLeaderboardState') });
    }

    try {
        let pack;
        await sequelize.transaction(async (transaction) => {
            pack = await Pack.findByPk(req.params.pack_id, {
                lock: transaction.LOCK.UPDATE,
                transaction,
            });
            if (!pack) return;

            if (enabled) {
                await backfillPackScoresFromEvents(pack.pack_id, { transaction });
            }
            await pack.update({
                leaderboard_enabled: enabled,
                leaderboard_enabled_at: enabled ? new Date() : null,
                leaderboard_enabled_by: enabled ? req.user.user_id : null,
            }, { transaction });
            if (enabled) await capturePackScores(pack.pack_id, { transaction });
        });
        if (!pack) return res.status(404).json({ message: req.t('pack.notFound') });

        return res.status(200).json({
            data: {
                leaderboard_enabled: Boolean(pack.leaderboard_enabled),
                leaderboard_enabled_at: pack.leaderboard_enabled_at,
                leaderboard_enabled_by: pack.leaderboard_enabled_by,
            },
            message: req.t(enabled ? 'pack.leaderboardEnabled' : 'pack.leaderboardDisabled'),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: req.t('pack.updateFailed') });
    }
};

// 获取单个图包的详细信息
exports.getPackById = async (req, res) => {
    try {
        const now = new Date();
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

        const bounties = await getActivePackBounties(pack.pack_id, now);
        const data = serializePackBountyCount(pack);
        data.bounties = bounties;
        data.bounty_count = bounties.length;
        data.has_bounty = bounties.length > 0;
        res.status(200).json({ data });
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
        // 重要设计说明：解绑图包反馈而不是物理删除，确保历史举报与审核审计留痕
        await PackFeedback.update({ pack_id: null }, { where: { pack_id: pack.pack_id }, transaction: t });
        await pack.destroy({ transaction: t });

        await t.commit();
        res.status(200).json({ message: req.t('pack.deleteSuccess') });
    } catch (error) {
        await t.rollback();
        res.status(500).json({ message: req.t('pack.deleteFailed') });
    }
};

/**
 * 修改图包类型并自动处理标签分类约束
 */
exports.updatePackType = async (req, res) => {
    const packId = Number(req.params.pack_id);
    const targetType = Number(req.body.type);
    const customTags = req.body.tags;

    if (!Number.isInteger(packId) || packId <= 0) {
        return res.status(400).json({ message: req.t('pack.notFound') });
    }

    if (![0, 1, 2, 3].includes(targetType)) {
        return res.status(400).json({ message: req.t('pack.createFailed') });
    }

    try {
        const pack = await Pack.findByPk(packId, {
            include: [{ model: Tag, as: 'tags', attributes: ['tag_id', 'category', 'enabled'], through: { attributes: [] } }],
        });
        if (!pack) {
            return res.status(404).json({ message: req.t('pack.notFound') });
        }

        let validTagIds = [];
        if (Array.isArray(customTags)) {
            const selection = await validatePackTagSelection(customTags, targetType);
            if (!selection.valid) {
                return res.status(400).json({ message: req.t('tag.invalidForPackType') });
            }
            validTagIds = selection.tagIds;
        } else {
            // 自动过滤出符合目标图包类型分类的已有标签
            const allowedCategories = new Set(getAllowedTagCategories(targetType));
            validTagIds = (pack.tags || [])
                .filter((tag) => tag.enabled && allowedCategories.has(tag.category))
                .map((tag) => tag.tag_id);
        }

        await sequelize.transaction(async (transaction) => {
            await pack.update({ type: targetType }, { transaction });
            await pack.setTags(validTagIds, { transaction });
        });

        const updatedPack = await Pack.findByPk(packId, {
            include: [
                {
                    model: Tag,
                    as: 'tags',
                    attributes: ['tag_id', 'tag_key', 'tag_name', 'category', 'name_zh', 'name_en', 'sort_order', 'enabled'],
                    through: { attributes: [] },
                },
            ],
        });

        res.status(200).json({
            data: updatedPack,
            message: req.t('pack.updateSuccess'),
        });
    } catch (error) {
        console.error('Failed to update pack type:', error);
        res.status(500).json({ message: req.t('pack.updateFailed') });
    }
};

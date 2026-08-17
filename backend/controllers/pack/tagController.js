const { UniqueConstraintError } = require('sequelize');
const { Tag, Pack } = require('../../models');
const { normalizeTagPayload } = require('../../utils/packTag');
const { validatePackTagSelection } = require('../../services/packTagService');

const PUBLIC_ATTRIBUTES = [
    'tag_id', 'tag_key', 'tag_name', 'category', 'name_zh', 'name_en', 'sort_order', 'enabled',
];

const TAG_ORDER = [['category', 'ASC'], ['sort_order', 'ASC'], ['tag_id', 'ASC']];

exports.getAllTags = async (req, res) => {
    try {
        const tags = await Tag.findAll({
            attributes: PUBLIC_ATTRIBUTES,
            // Keep the legacy order stable while new clients group by category.
            order: [['tag_id', 'ASC']],
            where: { enabled: true },
        });
        res.status(200).json({ data: tags });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: req.t('tag.getFailed') });
    }
};

exports.getAdminTags = async (req, res) => {
    try {
        const tags = await Tag.findAll({ attributes: PUBLIC_ATTRIBUTES, order: TAG_ORDER });
        const data = await Promise.all(tags.map(async (tag) => ({
            ...tag.toJSON(),
            usage_count: await tag.countPacks(),
        })));
        res.status(200).json({ data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: req.t('tag.getFailed') });
    }
};

exports.createTag = async (req, res) => {
    const normalized = normalizeTagPayload(req.body);
    if (normalized.error) {
        return res.status(400).json({ message: req.t(`tag.${normalized.error}`) });
    }

    try {
        const tag = await Tag.create(normalized.data);
        res.status(201).json({ data: tag });
    } catch (error) {
        if (error instanceof UniqueConstraintError) {
            return res.status(409).json({ message: req.t('tag.duplicate') });
        }
        console.error(error);
        res.status(500).json({ message: req.t('tag.createFailed') });
    }
};

exports.updateTag = async (req, res) => {
    if (Object.hasOwn(req.body, 'tag_key')) {
        return res.status(400).json({ message: req.t('tag.immutableKey') });
    }
    const normalized = normalizeTagPayload(req.body, { partial: true });
    if (normalized.error || Object.keys(normalized.data || {}).length === 0) {
        return res.status(400).json({ message: req.t(`tag.${normalized.error || 'invalidPayload'}`) });
    }

    try {
        const tag = await Tag.findByPk(req.params.tag_id);
        if (!tag) return res.status(404).json({ message: req.t('tag.notFound') });
        await tag.update(normalized.data);
        res.status(200).json({ data: tag });
    } catch (error) {
        if (error instanceof UniqueConstraintError) {
            return res.status(409).json({ message: req.t('tag.duplicate') });
        }
        console.error(error);
        res.status(500).json({ message: req.t('tag.updateFailed') });
    }
};

exports.deleteTag = async (req, res) => {
    try {
        const tag = await Tag.findByPk(req.params.tag_id);
        if (!tag) return res.status(404).json({ message: req.t('tag.notFound') });
        const usageCount = await tag.countPacks();
        if (usageCount > 0) {
            return res.status(409).json({ message: req.t('tag.inUse', { count: usageCount }) });
        }
        await tag.destroy();
        res.status(200).json({ message: req.t('tag.deleteSuccess') });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: req.t('tag.deleteFailed') });
    }
};

exports.updatePackTags = async (req, res) => {
    const { tags } = req.body;
    const packId = req.params.pack_id;

    if (!Array.isArray(tags)) {
        return res.status(400).json({ message: req.t('tag.invalidTags') });
    }

    try {
        const pack = await Pack.findByPk(packId, {
            include: [{ model: Tag, as: 'tags', attributes: ['tag_id'], through: { attributes: [] } }],
        });
        if (!pack) return res.status(404).json({ message: req.t('pack.notFound') });
        const selection = await validatePackTagSelection(tags, pack.type, {
            allowDisabledIds: pack.tags.map((tag) => tag.tag_id),
        });
        if (!selection.valid) {
            return res.status(400).json({ message: req.t('tag.invalidForPackType') });
        }
        await pack.setTags(selection.tagIds);
        res.status(200).json({ message: req.t('tag.tagsUpdated') });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: req.t('tag.updateFailed') });
    }
};

exports.removeTagsFromPack = async (req, res) => {
    const { tag_ids } = req.body;
    const packId = req.params.pack_id;

    if (!Array.isArray(tag_ids) || tag_ids.length === 0) {
        return res.status(400).json({ message: req.t('tag.invalidTags') });
    }

    try {
        const pack = await Pack.findByPk(packId);
        if (!pack) return res.status(404).json({ message: req.t('pack.notFound') });
        await pack.removeTags(tag_ids);
        res.status(200).json({ message: req.t('tag.tagsRemoved') });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: req.t('tag.updateFailed') });
    }
};

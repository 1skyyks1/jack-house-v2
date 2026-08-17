const { Tag } = require('../models');
const { areTagsAllowedForPackType, getAllowedTagCategories } = require('../utils/packTag');

function normalizeTagIds(tagIds) {
    if (!Array.isArray(tagIds)) return null;
    const normalized = [...new Set(tagIds.map(Number))];
    if (normalized.some((tagId) => !Number.isInteger(tagId) || tagId <= 0)) return null;
    return normalized;
}

async function validatePackTagSelection(tagIds, packType, { allowDisabledIds = [], transaction } = {}) {
    const normalizedIds = normalizeTagIds(tagIds);
    if (![0, 1, 2, 3].includes(Number(packType))) return { valid: false };
    const allowedCategories = getAllowedTagCategories(packType);
    if (!normalizedIds || (allowedCategories.length === 0 && normalizedIds.length > 0)) {
        return { valid: false };
    }
    if (normalizedIds.length === 0) return { tagIds: [], valid: true };

    const tags = await Tag.findAll({
        attributes: ['tag_id', 'category', 'enabled'],
        transaction,
        where: { tag_id: normalizedIds },
    });
    if (tags.length !== normalizedIds.length) return { valid: false };

    const disabledAllowlist = new Set(allowDisabledIds.map(Number));
    const normalizedTags = tags.map((tag) => ({
        category: tag.category,
        enabled: Boolean(tag.enabled) || disabledAllowlist.has(Number(tag.tag_id)),
    }));
    return {
        tagIds: normalizedIds,
        valid: areTagsAllowedForPackType(normalizedTags, packType),
    };
}

module.exports = { normalizeTagIds, validatePackTagSelection };

const TAG_CATEGORIES = ['pattern', 'bpm', 'difficulty'];

const PACK_TYPE_CATEGORIES = {
    0: TAG_CATEGORIES,
    1: [],
    2: ['difficulty'],
    3: ['pattern'],
};

function normalizeTagPayload(payload, { partial = false } = {}) {
    const normalized = {};

    if (!partial || Object.hasOwn(payload, 'tag_key')) {
        const tagKey = String(payload.tag_key || '').trim().toLowerCase();
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tagKey) || tagKey.length > 64) {
            return { error: 'invalidKey' };
        }
        normalized.tag_key = tagKey;
    }

    for (const field of ['name_zh', 'name_en']) {
        if (!partial || Object.hasOwn(payload, field)) {
            const value = String(payload[field] || '').trim();
            if (!value || value.length > 255) return { error: 'invalidName' };
            normalized[field] = value;
        }
    }

    if (!partial || Object.hasOwn(payload, 'category')) {
        const category = String(payload.category || '').trim();
        if (!TAG_CATEGORIES.includes(category)) return { error: 'invalidCategory' };
        normalized.category = category;
    }

    if (!partial || Object.hasOwn(payload, 'sort_order')) {
        const sortOrder = Number(payload.sort_order);
        if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1_000_000) {
            return { error: 'invalidSortOrder' };
        }
        normalized.sort_order = sortOrder;
    }

    if (!partial || Object.hasOwn(payload, 'enabled')) {
        if (typeof payload.enabled !== 'boolean') return { error: 'invalidEnabled' };
        normalized.enabled = payload.enabled;
    }

    if (normalized.name_en) normalized.tag_name = normalized.name_en;
    return { data: normalized };
}

function getAllowedTagCategories(packType) {
    return PACK_TYPE_CATEGORIES[Number(packType)] || [];
}

function areTagsAllowedForPackType(tags, packType) {
    const allowed = new Set(getAllowedTagCategories(packType));
    return tags.every((tag) => tag.enabled && allowed.has(tag.category));
}

module.exports = {
    TAG_CATEGORIES,
    areTagsAllowedForPackType,
    getAllowedTagCategories,
    normalizeTagPayload,
};

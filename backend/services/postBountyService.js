const { Op } = require('sequelize');
const sequelize = require('../config/db');
const { Post, PostPack, PostTranslation, Pack, User } = require('../models');
const { sanitizeRichTextHtml } = require('../utils/richTextSanitizer');

const BOUNTY_POST_TYPE = 4;
const MAX_BOUNTY_PACKS = 5;

class BountyValidationError extends Error {
    constructor(key) { super(key); this.key = key; }
}

function isValidPostType(value) {
    return (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 4)
        || (typeof value === 'string' && /^[0-4]$/.test(value));
}

function getBountyStatus(post, now = new Date()) {
    if (Number(post.type) !== BOUNTY_POST_TYPE) return null;
    if (post.bounty_closed_at) return 'closed';
    if (post.end && new Date(post.end).getTime() <= now.getTime()) return 'expired';
    return 'active';
}

function serializePost(post, now = new Date()) {
    const data = typeof post.toJSON === 'function' ? post.toJSON() : { ...post };
    data.bounty_status = getBountyStatus(data, now);
    if (data.linked_packs) data.pack_ids = data.linked_packs.map(pack => pack.pack_id);
    return data;
}

function linkedPacksInclude() {
    return {
        model: Pack, as: 'linked_packs', through: { attributes: [] },
        attributes: ['pack_id', 'title', 'title_unicode', 'artist', 'artist_unicode', 'creator', 'osu_bid', 'cover_id', 'type'],
    };
}

function validateBountyTranslations(translations) {
    if (!Array.isArray(translations) || translations.length < 1 || translations.length > 2
        || translations.some(item => !item || !['zh', 'en'].includes(item.language)
            || typeof item.title !== 'string' || item.title.length > 255 || typeof item.content !== 'string')
        || new Set(translations.map(item => item.language)).size !== translations.length
        || !translations.some(item => item.title.trim()
            && sanitizeRichTextHtml(item.content).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim())) {
        throw new BountyValidationError('post.invalidBountyContent');
    }
}

// An unchanged past deadline must remain editable without reopening the bounty.
function parseBountyEnd(value, { existingEnd = null, now = new Date() } = {}) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
        throw new BountyValidationError('post.invalidBountyEnd');
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new BountyValidationError('post.invalidBountyEnd');
    const [hours, minutes, seconds = '0'] = value.slice(11).split(/[:Z+-]/);
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    const calendarDate = new Date(Date.UTC(year, month - 1, day));
    if (year < 1000 || date.getUTCFullYear() < 1000 || date.getUTCFullYear() > 9999
        || Number(hours) > 23 || Number(minutes) > 59 || Number(seconds) >= 60
        || calendarDate.getUTCFullYear() !== year
        || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) {
        throw new BountyValidationError('post.invalidBountyEnd');
    }
    if (date <= now && date.getTime() !== (existingEnd ? new Date(existingEnd).getTime() : NaN)) {
        throw new BountyValidationError('post.startAfterEnd');
    }
    return date;
}

async function validateBountyPackIds(ids, transaction) {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_BOUNTY_PACKS
        || ids.some(id => !Number.isSafeInteger(id) || id < 1 || id > 2147483647)
        || new Set(ids).size !== ids.length) {
        throw new BountyValidationError('post.invalidBountyPacks');
    }
    const packs = await Pack.findAll({ where: { pack_id: { [Op.in]: ids } }, attributes: ['pack_id'], transaction });
    if (packs.length !== ids.length) throw new BountyValidationError('post.bountyPackNotFound');
    return ids;
}

async function replaceBountyPacks(postId, ids, transaction) {
    await PostPack.destroy({ where: { post_id: postId }, transaction });
    await PostPack.bulkCreate(ids.map(packId => ({ post_id: postId, pack_id: packId })), { transaction });
}

function activeBountyWhere(now = new Date()) {
    return { type: BOUNTY_POST_TYPE, bounty_closed_at: null, [Op.or]: [{ end: null }, { end: { [Op.gt]: now } }] };
}

// A correlated count keeps filtering and pagination correct even for multiple bounties.
// The only interpolated value is an escaped server timestamp, never request input.
function activeBountyCountSql(now = new Date()) {
    return `(SELECT COUNT(*) FROM post_pack AS bp INNER JOIN post AS b ON b.post_id = bp.post_id
        WHERE bp.pack_id = \`Pack\`.\`pack_id\` AND b.type = 4 AND b.bounty_closed_at IS NULL
        AND (b.\`end\` IS NULL OR b.\`end\` > ${sequelize.escape(now)}))`;
}

// MIN keeps the DATETIME type, allowing Sequelize's timezone-aware parser to handle the result.
function activeBountyNextEndSql(now = new Date()) {
    return `(SELECT MIN(b.\`end\`) FROM post_pack AS bp INNER JOIN post AS b ON b.post_id = bp.post_id
        WHERE bp.pack_id = \`Pack\`.\`pack_id\` AND b.type = 4 AND b.bounty_closed_at IS NULL
        AND b.\`end\` > ${sequelize.escape(now)})`;
}

function serializePackBountyCount(pack) {
    const data = typeof pack.toJSON === 'function' ? pack.toJSON() : { ...pack };
    data.bounty_count = Number(data.bounty_count || 0);
    data.has_bounty = data.bounty_count > 0;
    const nextEnd = data.bounty_next_end_at == null ? null : new Date(data.bounty_next_end_at);
    data.bounty_next_end_at = nextEnd && Number.isFinite(nextEnd.getTime()) ? nextEnd.toISOString() : null;
    return data;
}

async function getActivePackBounties(packId, now = new Date()) {
    const posts = await Post.findAll({
        where: activeBountyWhere(now),
        attributes: ['post_id', 'user_id', 'type', 'end', 'bounty_closed_at', 'created_time', 'updated_time'],
        include: [
            { model: Pack, as: 'linked_packs', attributes: [], through: { attributes: [] }, where: { pack_id: packId }, required: true },
            { model: PostTranslation, as: 'translations', attributes: ['title', 'language'] },
            { model: User, as: 'user', attributes: ['user_id', 'user_name', 'avatar'] },
        ],
        order: [['created_time', 'DESC'], ['post_id', 'DESC']],
    });
    return posts.map(post => {
        const data = serializePost(post, now);
        delete data.linked_packs;
        delete data.pack_ids;
        return data;
    });
}

module.exports = {
    BOUNTY_POST_TYPE, MAX_BOUNTY_PACKS, BountyValidationError, isValidPostType, getBountyStatus,
    serializePost, linkedPacksInclude, validateBountyTranslations, parseBountyEnd, validateBountyPackIds, replaceBountyPacks,
    activeBountyWhere, activeBountyCountSql, activeBountyNextEndSql, serializePackBountyCount, getActivePackBounties,
};

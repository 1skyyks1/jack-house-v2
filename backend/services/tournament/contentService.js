const { TSection, Tournament } = require('../../models/tournament');
const auditService = require('./auditService');
const MarkdownIt = require('markdown-it');
const sanitizeHtml = require('sanitize-html');

const ALLOWED_FORMATS = new Set(['markdown', 'html']);
const ALLOWED_TYPES = new Set(['rules', 'description', 'prize', 'faq']);

const slugifyHeading = (text = '') => String(text)
    .toLowerCase()
    .trim()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]+/gu, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);

const markdown = new MarkdownIt({
    breaks: true,
    html: false,
    linkify: true,
    typographer: false
});

const defaultHeadingOpen = markdown.renderer.rules.heading_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
markdown.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const next = tokens[idx + 1];
    if (next?.type === 'inline') {
        const slug = slugifyHeading(next.content);
        if (slug) tokens[idx].attrSet('id', slug);
    }
    return defaultHeadingOpen(tokens, idx, options, env, self);
};

const sanitizeContentHtml = (html = '') => sanitizeHtml(String(html), {
    allowedTags: [
        'a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'hr', 'img', 'li', 'ol', 'p', 'pre', 's', 'span', 'strong', 'table', 'tbody',
        'td', 'th', 'thead', 'tr', 'ul'
    ],
    allowedAttributes: {
        a: ['href', 'name', 'target', 'rel'],
        code: ['class'],
        h1: ['id'],
        h2: ['id'],
        h3: ['id'],
        h4: ['id'],
        h5: ['id'],
        h6: ['id'],
        img: ['alt', 'height', 'src', 'title', 'width'],
        span: ['class'],
        td: ['align', 'colspan', 'rowspan'],
        th: ['align', 'colspan', 'rowspan']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
        img: ['http', 'https']
    },
    transformTags: {
        a: sanitizeHtml.simpleTransform('a', {
            rel: 'noopener noreferrer',
            target: '_blank'
        })
    }
});

const markdownToHtml = (source = '') => sanitizeContentHtml(markdown.render(String(source)));

const renderContentHtml = ({ format, source_markdown, content_html }) => {
    if (format === 'markdown') {
        return markdownToHtml(source_markdown || '');
    }
    return sanitizeContentHtml(content_html || '');
};

const normalizeSectionPayload = (body) => {
    const type = body.type || 'rules';
    const format = body.format || 'markdown';

    if (!ALLOWED_TYPES.has(type)) {
        const error = new Error('不支持的内容类型');
        error.status = 400;
        throw error;
    }
    if (!ALLOWED_FORMATS.has(format)) {
        const error = new Error('不支持的内容格式');
        error.status = 400;
        throw error;
    }

    const payload = {
        type,
        title: body.title || '',
        format,
        source_markdown: format === 'markdown' ? (body.source_markdown || body.content || '') : null,
        content_html: body.content_html || '',
        sort_order: Number.isInteger(body.sort_order) ? body.sort_order : Number(body.sort_order || 0)
    };

    if (!payload.title.trim()) {
        const error = new Error('内容标题不能为空');
        error.status = 400;
        throw error;
    }

    payload.content_html = renderContentHtml(payload);
    return payload;
};

const ensureTournamentExists = async (tid) => {
    const tournament = await Tournament.findByPk(tid);
    if (!tournament) {
        const error = new Error('赛事不存在');
        error.status = 404;
        throw error;
    }
    return tournament;
};

const listSections = async (tid, type) => {
    await ensureTournamentExists(tid);
    const where = { t_id: tid };
    if (type) where.type = type;
    return TSection.findAll({
        where,
        order: [['sort_order', 'ASC'], ['created_time', 'ASC']]
    });
};

const listPublicSections = async (tid, type) => {
    const sections = await listSections(tid, type);
    return sections.map((section) => {
        const raw = auditService.pickModelValues(section);
        delete raw.source_markdown;
        return raw;
    });
};

const createSection = async (tid, body, userId) => {
    await ensureTournamentExists(tid);
    const payload = normalizeSectionPayload(body);
    const section = await TSection.create({
        ...payload,
        t_id: tid,
        updated_by: userId
    });
    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'section',
        entity_id: section.id,
        action: 'create',
        new_value: section,
        operator_id: userId
    });
    return section;
};

const updateSection = async (tid, sectionId, body, userId) => {
    await ensureTournamentExists(tid);
    const section = await TSection.findOne({ where: { id: sectionId, t_id: tid } });
    if (!section) {
        const error = new Error('内容不存在');
        error.status = 404;
        throw error;
    }

    const payload = normalizeSectionPayload({
        type: body.type ?? section.type,
        title: body.title ?? section.title,
        format: body.format ?? section.format,
        source_markdown: body.source_markdown ?? section.source_markdown,
        content_html: body.content_html ?? section.content_html,
        sort_order: body.sort_order ?? section.sort_order
    });

    const oldValue = auditService.pickModelValues(section);
    await section.update({
        ...payload,
        updated_by: userId
    });
    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'section',
        entity_id: section.id,
        action: 'update',
        old_value: oldValue,
        new_value: section,
        operator_id: userId
    });
    return section;
};

const deleteSection = async (tid, sectionId, userId) => {
    await ensureTournamentExists(tid);
    const section = await TSection.findOne({ where: { id: sectionId, t_id: tid } });
    if (!section) {
        const error = new Error('内容不存在');
        error.status = 404;
        throw error;
    }
    const oldValue = auditService.pickModelValues(section);
    await section.destroy();
    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'section',
        entity_id: section.id,
        action: 'delete',
        old_value: oldValue,
        operator_id: userId
    });
};

module.exports = {
    listSections,
    listPublicSections,
    createSection,
    updateSection,
    deleteSection,
    markdownToHtml,
    sanitizeContentHtml
};

const { TSection, Tournament } = require('../../models/tournament');
const auditService = require('./auditService');
const MarkdownIt = require('markdown-it');
const { sanitizeRichTextHtml } = require('../../utils/richTextSanitizer');
const { syncRichTextAssetReferences } = require('../richTextAssetService');

const ALLOWED_FORMATS = new Set(['markdown', 'html']);
const SECTION_TYPE_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

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

const sanitizeContentHtml = sanitizeRichTextHtml;

const markdownToHtml = (source = '') => sanitizeContentHtml(markdown.render(String(source)));

const renderContentHtml = ({ format, source_markdown, content_html }) => {
    if (format === 'markdown') {
        return markdownToHtml(source_markdown || '');
    }
    return sanitizeContentHtml(content_html || '');
};

const firstText = (...values) => {
    for (const value of values) {
        const text = String(value || '').trim();
        if (text) return text;
    }
    return '';
};

const normalizeSectionType = (value = 'rules') => String(value || 'rules').trim().toLowerCase();

const normalizeSectionPayload = (body) => {
    const type = normalizeSectionType(body.type);
    const format = body.format || 'markdown';

    if (!SECTION_TYPE_PATTERN.test(type)) {
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
        title_zh: String(body.title_zh ?? body.title ?? '').trim(),
        title_en: String(body.title_en ?? '').trim(),
        format,
        source_markdown: format === 'markdown' ? (body.source_markdown ?? body.source_markdown_zh ?? body.content ?? '') : null,
        source_markdown_zh: format === 'markdown' ? (body.source_markdown_zh ?? body.source_markdown ?? body.content ?? '') : null,
        source_markdown_en: format === 'markdown' ? (body.source_markdown_en ?? '') : null,
        content_html: body.content_html || '',
        content_html_zh: body.content_html_zh || '',
        content_html_en: body.content_html_en || '',
        sort_order: Number.isInteger(body.sort_order) ? body.sort_order : Number(body.sort_order || 0)
    };
    payload.title = firstText(body.title, payload.title_zh, payload.title_en);

    if (!payload.title.trim()) {
        const error = new Error('内容标题不能为空');
        error.status = 400;
        throw error;
    }

    payload.content_html = renderContentHtml(payload);
    payload.content_html_zh = renderContentHtml({
        format,
        source_markdown: payload.source_markdown_zh ?? payload.source_markdown,
        content_html: payload.content_html_zh || payload.content_html
    });
    payload.content_html_en = renderContentHtml({
        format,
        source_markdown: payload.source_markdown_en,
        content_html: payload.content_html_en
    });
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
        delete raw.source_markdown_zh;
        delete raw.source_markdown_en;
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
    await syncRichTextAssetReferences({
        contentType: 't_section',
        contentId: section.id,
        html: [section.content_html, section.content_html_zh, section.content_html_en].filter(Boolean).join('\n'),
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
        title_zh: body.title_zh ?? section.title_zh,
        title_en: body.title_en ?? section.title_en,
        format: body.format ?? section.format,
        source_markdown: body.source_markdown ?? section.source_markdown,
        source_markdown_zh: body.source_markdown_zh ?? section.source_markdown_zh,
        source_markdown_en: body.source_markdown_en ?? section.source_markdown_en,
        content_html: body.content_html ?? section.content_html,
        content_html_zh: body.content_html_zh ?? section.content_html_zh,
        content_html_en: body.content_html_en ?? section.content_html_en,
        sort_order: body.sort_order ?? section.sort_order
    });

    const oldValue = auditService.pickModelValues(section);
    await section.update({
        ...payload,
        updated_by: userId
    });
    await syncRichTextAssetReferences({
        contentType: 't_section',
        contentId: section.id,
        html: [section.content_html, section.content_html_zh, section.content_html_en].filter(Boolean).join('\n'),
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
    await syncRichTextAssetReferences({
        contentType: 't_section',
        contentId: section.id,
        html: '',
    });
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

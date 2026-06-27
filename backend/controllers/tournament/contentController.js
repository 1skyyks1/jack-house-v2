const contentService = require('../../services/tournament/contentService');
const { sendError } = require('../../utils/tournamentI18n');

const handleError = (res, req, error) => sendError(res, req, error);

exports.getSections = async (req, res) => {
    try {
        const { tid } = req.params;
        const { type } = req.query;
        const sections = await contentService.listPublicSections(tid, type);
        res.json(sections);
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.getManageSections = async (req, res) => {
    try {
        const { tid } = req.params;
        const { type } = req.query;
        const sections = await contentService.listSections(tid, type);
        res.json(sections);
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.createSection = async (req, res) => {
    try {
        const { tid } = req.params;
        const section = await contentService.createSection(tid, req.body, req.user.user_id);
        res.status(201).json(section);
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.previewMarkdown = async (req, res) => {
    try {
        const html = contentService.markdownToHtml(req.body?.source_markdown || '');
        res.json({ content_html: html });
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.updateSection = async (req, res) => {
    try {
        const { tid, sectionId } = req.params;
        const section = await contentService.updateSection(tid, sectionId, req.body, req.user.user_id);
        res.json(section);
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.deleteSection = async (req, res) => {
    try {
        const { tid, sectionId } = req.params;
        await contentService.deleteSection(tid, sectionId, req.user.user_id);
        res.json({ message: req.t('tournament.messages.deleteSuccess') });
    } catch (error) {
        handleError(res, req, error);
    }
};

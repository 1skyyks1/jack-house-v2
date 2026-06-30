const historicalImportService = require('../../services/tournament/historicalImportService');
const { sendError } = require('../../utils/tournamentI18n');

const handleError = (res, req, error) => sendError(res, req, error);

exports.importTeams = async (req, res) => {
    try {
        const { tid } = req.params;
        const result = await historicalImportService.importTeams(tid, req.body, req.user.user_id);
        res.status(req.body?.dry_run ? 200 : 201).json(result);
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.importGoogleFormTeams = async (req, res) => {
    try {
        const { tid } = req.params;
        const result = await historicalImportService.importGoogleFormTeams(tid, req.body, req.user.user_id);
        res.status(req.body?.dry_run ? 200 : 201).json(result);
    } catch (error) {
        handleError(res, req, error);
    }
};

const auditService = require('../../services/tournament/auditService');
const { sendError } = require('../../utils/tournamentI18n');

const handleError = (res, req, error) => sendError(res, req, error);

exports.getAuditLogs = async (req, res) => {
    try {
        const { tid } = req.params;
        const logs = await auditService.listAuditLogs(tid, req.query);
        res.json(logs);
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.getAuditLog = async (req, res) => {
    try {
        const { tid, auditId } = req.params;
        const log = await auditService.getAuditLog(tid, auditId);
        res.json(log);
    } catch (error) {
        handleError(res, req, error);
    }
};

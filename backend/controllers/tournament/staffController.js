const staffService = require('../../services/tournament/staffService');
const { sendError } = require('../../utils/tournamentI18n');

const handleError = (res, req, error) => sendError(res, req, error);

exports.getStaff = async (req, res) => {
    try {
        const { tid } = req.params;
        const staff = await staffService.listStaff(tid);
        res.json(staff);
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.addStaff = async (req, res) => {
    try {
        const { tid } = req.params;
        const staff = await staffService.addStaff(tid, req.body, req.user, req.tournament);
        res.status(201).json(staff);
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.removeStaff = async (req, res) => {
    try {
        const { tid, staffId } = req.params;
        await staffService.removeStaff(tid, staffId, req.user, req.tournament);
        res.json({ message: req.t('tournament.messages.removed') });
    } catch (error) {
        handleError(res, req, error);
    }
};

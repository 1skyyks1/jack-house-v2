const fs = require('fs');
const tournamentService = require('../../services/tournament/tournamentService');
const { sendError } = require('../../utils/tournamentI18n');
const { tournamentTeamAvatarUpload } = require('../../config/multer');
const { handleUpload } = require('../../middleware/uploadErrorHandler');

const handleError = (res, req, error) => sendError(res, req, error);

exports.getTournaments = async (req, res) => {
    try {
        const tournaments = await tournamentService.listTournaments();
        res.json(tournaments);
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.getTournament = async (req, res) => {
    try {
        const { tid } = req.params;
        const tournament = await tournamentService.getTournament(tid);
        res.json(tournament);
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.createTournament = async (req, res) => {
    try {
        const tournament = await tournamentService.createTournament(req.body, req.user.user_id);
        res.status(201).json(tournament);
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.updateTournament = async (req, res) => {
    try {
        const { tid } = req.params;
        const tournament = await tournamentService.updateTournament(tid, req.body, req.user.user_id);
        res.json(tournament);
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.uploadDefaultTeamAvatar = [
    handleUpload(tournamentTeamAvatarUpload.single('file')),
    async (req, res) => {
        try {
            const { tid } = req.params;
            if (!req.file) {
                return res.status(400).json({ message: req.t('upload.noFile') });
            }
            const tournament = await tournamentService.uploadDefaultTeamAvatar(tid, req.file, req.user.user_id);
            res.status(201).json(tournament);
        } catch (error) {
            if (req.file?.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            handleError(res, req, error);
        }
    }
];

exports.deleteTournament = async (req, res) => {
    try {
        const { tid } = req.params;
        await tournamentService.deleteTournament(tid, req.user.user_id);
        res.json({ message: req.t('tournament.messages.deleteSuccess') });
    } catch (error) {
        handleError(res, req, error);
    }
};

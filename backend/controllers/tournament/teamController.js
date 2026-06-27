const teamService = require('../../services/tournament/teamService');
const { sendError } = require('../../utils/tournamentI18n');

const handleError = (res, req, error) => sendError(res, req, error);

exports.getTeams = async (req, res) => {
    try {
        const { tid } = req.params;
        const teams = await teamService.listTeams(tid);
        res.json(teams);
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.createTeam = async (req, res) => {
    try {
        const { tid } = req.params;
        const team = await teamService.createTeam(tid, req.user.user_id, req.body);
        res.status(201).json(team);
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.joinTeam = async (req, res) => {
    try {
        const { tid } = req.params;
        await teamService.joinTeam(tid, req.user.user_id, req.body);
        res.json({ message: req.t('tournament.messages.joinSuccess') });
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.submitTeam = async (req, res) => {
    try {
        const { tid, teamId } = req.params;
        const team = await teamService.submitTeam(tid, req.user.user_id, teamId);
        res.json(team);
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.leaveTeam = async (req, res) => {
    try {
        const { tid } = req.params;
        await teamService.leaveTeam(tid, req.user.user_id);
        res.json({ message: req.t('tournament.messages.leftTeam') });
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.kickPlayer = async (req, res) => {
    try {
        const { tid, teamId, playerId } = req.params;
        await teamService.kickPlayer(tid, req.user.user_id, teamId, playerId);
        res.json({ message: req.t('tournament.messages.playerRemoved') });
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.resetInviteCode = async (req, res) => {
    try {
        const { tid, teamId } = req.params;
        const team = await teamService.resetInviteCode(tid, req.user.user_id, teamId);
        res.json({ invite_code: team.invite_code });
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.updateTeamInfo = async (req, res) => {
    try {
        const { tid, teamId } = req.params;
        const team = await teamService.updateTeamInfo(tid, req.user.user_id, teamId, req.body);
        res.json(team);
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.transferCaptain = async (req, res) => {
    try {
        const { tid, teamId } = req.params;
        const team = await teamService.transferCaptain(tid, req.user.user_id, teamId, req.body.player_id);
        res.json(team);
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.updatePlayer = async (req, res) => {
    try {
        const { tid, playerId } = req.params;
        const player = await teamService.updatePlayerByHost(tid, playerId, req.body, req.user.user_id);
        res.json(player);
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.updateTeamStatus = async (req, res) => {
    try {
        const { tid, teamId } = req.params;
        const team = await teamService.updateTeamStatus(tid, teamId, req.body.status, req.user.user_id);
        res.json(team);
    } catch (error) {
        handleError(res, req, error);
    }
};

exports.approveAllTeams = async (req, res) => {
    try {
        const { tid } = req.params;
        await teamService.approveAllTeams(tid, req.user.user_id);
        res.json({ message: req.t('tournament.messages.teamsApproved') });
    } catch (error) {
        handleError(res, req, error);
    }
};

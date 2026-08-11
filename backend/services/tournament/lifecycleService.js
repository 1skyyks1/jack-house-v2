const sequelize = require('../../config/db');
const { Tournament } = require('../../models/tournament');
const auditService = require('./auditService');

const TOURNAMENT_STATUS = Object.freeze({
    UPCOMING: 0,
    REGISTRATION: 1,
    QUALIFIER: 2,
    MAIN_STAGE: 3,
    COMPLETED: 4
});

const setTournamentStatus = async (tid, status, operatorId, options = {}) => {
    const run = async (transaction) => {
        const tournament = await Tournament.findByPk(tid, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!tournament || Number(tournament.status) === Number(status)) return tournament;

        const oldStatus = Number(tournament.status);
        tournament.status = status;
        await tournament.save({ transaction });
        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'tournament',
            entity_id: tournament.id,
            action: 'status_transition',
            old_value: { status: oldStatus },
            new_value: { status },
            operator_id: operatorId
        }, { transaction });
        return tournament;
    };

    return options.transaction ? run(options.transaction) : sequelize.transaction(run);
};

const markMainStage = (tid, operatorId, options = {}) => (
    setTournamentStatus(tid, TOURNAMENT_STATUS.MAIN_STAGE, operatorId, options)
);

const getCompletionReason = match => {
    if (Number(match?.status) !== 2 || !match?.winner_id) return null;
    if (match.bracket_group === 'reset_final') return 'reset_final_completed';
    if (match.bracket_group === 'grand_final'
        && Number(match.winner_id) === Number(match.team1_id)) {
        return 'grand_final_winner_bracket_win';
    }
    return null;
};

const completeFromMatch = async (match, operatorId, options = {}) => {
    if (!getCompletionReason(match)) return false;

    const tid = match.round?.t_id;
    if (!tid) return false;
    await setTournamentStatus(tid, TOURNAMENT_STATUS.COMPLETED, operatorId, options);
    return true;
};

module.exports = {
    TOURNAMENT_STATUS,
    completeFromMatch,
    getCompletionReason,
    markMainStage,
    setTournamentStatus
};

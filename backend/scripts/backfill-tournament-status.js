const { Op } = require('sequelize');
const sequelize = require('../config/db');
const { Tournament, TMatch, TRound } = require('../models/tournament');
const lifecycleService = require('../services/tournament/lifecycleService');

const APPLY = process.argv.includes('--apply');
const tournamentIdArgument = process.argv.find(argument => argument.startsWith('--tournament-id='));
const TOURNAMENT_ID = tournamentIdArgument ? Number(tournamentIdArgument.slice('--tournament-id='.length)) : null;

if (TOURNAMENT_ID !== null && (!Number.isInteger(TOURNAMENT_ID) || TOURNAMENT_ID <= 0)) {
    throw new Error('--tournament-id must be a positive integer');
}

const chooseCompletionEvidence = matches => {
    const completed = matches
        .map(match => ({ match, reason: lifecycleService.getCompletionReason(match) }))
        .filter(item => item.reason);
    return completed.find(item => item.reason === 'reset_final_completed') || completed[0] || null;
};

const main = async () => {
    const summary = {
        apply: APPLY,
        candidates: 0,
        changed: 0,
        unchanged: 0,
        rows: []
    };

    try {
        await sequelize.authenticate();
        const tournamentWhere = {
            status: { [Op.ne]: lifecycleService.TOURNAMENT_STATUS.COMPLETED }
        };
        if (TOURNAMENT_ID) tournamentWhere.id = TOURNAMENT_ID;

        const tournaments = await Tournament.findAll({
            where: tournamentWhere,
            attributes: ['id', 'name', 'acronym', 'status'],
            order: [['id', 'ASC']]
        });
        const tournamentIds = tournaments.map(tournament => tournament.id);
        const matches = tournamentIds.length === 0 ? [] : await TMatch.findAll({
            where: {
                bracket_group: { [Op.in]: ['grand_final', 'reset_final'] }
            },
            attributes: ['id', 'bracket_group', 'status', 'team1_id', 'team2_id', 'winner_id'],
            include: [{
                model: TRound,
                as: 'round',
                attributes: ['id', 't_id'],
                required: true,
                where: { t_id: { [Op.in]: tournamentIds } }
            }],
            order: [['id', 'ASC']]
        });
        const matchesByTournament = new Map();
        for (const match of matches) {
            const tid = Number(match.round.t_id);
            if (!matchesByTournament.has(tid)) matchesByTournament.set(tid, []);
            matchesByTournament.get(tid).push(match);
        }

        summary.candidates = tournaments.length;
        for (const tournament of tournaments) {
            const evidence = chooseCompletionEvidence(matchesByTournament.get(Number(tournament.id)) || []);
            const row = {
                acronym: tournament.acronym,
                currentStatus: Number(tournament.status),
                matchId: evidence?.match.id || null,
                name: tournament.name,
                reason: evidence?.reason || 'no_decisive_completed_final',
                targetStatus: evidence ? lifecycleService.TOURNAMENT_STATUS.COMPLETED : Number(tournament.status),
                tournamentId: tournament.id
            };

            if (!evidence) {
                summary.unchanged++;
                summary.rows.push(row);
                continue;
            }

            if (APPLY) {
                const changed = await sequelize.transaction(async transaction => {
                    const lockedMatch = await TMatch.findByPk(evidence.match.id, {
                        include: [{ model: TRound, as: 'round', attributes: ['id', 't_id'], required: true }],
                        transaction,
                        lock: transaction.LOCK.UPDATE
                    });
                    return lifecycleService.completeFromMatch(lockedMatch, null, { transaction });
                });
                if (!changed) {
                    row.reason = 'evidence_changed_during_apply';
                    row.targetStatus = Number(tournament.status);
                    summary.unchanged++;
                    summary.rows.push(row);
                    continue;
                }
            }

            summary.changed++;
            summary.rows.push(row);
        }

        console.table(summary.rows);
        console.log(JSON.stringify({
            apply: summary.apply,
            candidates: summary.candidates,
            changed: summary.changed,
            unchanged: summary.unchanged
        }, null, 2));
        if (!APPLY) console.log('Dry run only. Re-run with --apply to persist the listed changes.');
    } finally {
        await sequelize.close();
    }
};

main().catch(error => {
    console.error('Tournament status backfill failed:', error);
    process.exitCode = 1;
});

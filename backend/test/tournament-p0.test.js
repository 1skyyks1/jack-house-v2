const assert = require('node:assert/strict');
const test = require('node:test');
const { Op } = require('sequelize');

const sequelize = require('../config/db');
const { TAuditLog, Tournament, TGame, TMatch, TMatchAction, TMappoolStats, TPlayer, TQualImport, TQualMappool, TQualScore, TRound, TStaff, TTeam } = require('../models/tournament');
const User = require('../models/user/user');
const auditService = require('../services/tournament/auditService');
const bracketService = require('../services/tournament/bracketService');
const mappoolStatsService = require('../services/tournament/mappoolStatsService');
const osuMatchService = require('../services/tournament/osuMatchService');
const qualifierService = require('../services/tournament/qualifierService');
const refereeActionService = require('../services/tournament/refereeActionService');
const roundStageService = require('../services/tournament/roundStageService');
const staffService = require('../services/tournament/staffService');
const teamService = require('../services/tournament/teamService');
const tournamentService = require('../services/tournament/tournamentService');
const matchController = require('../controllers/tournament/matchController');

const patchMethod = (t, object, name, implementation) => {
    const original = object[name];
    object[name] = implementation;
    t.after(() => {
        object[name] = original;
    });
};

const openTournament = (overrides = {}) => ({
    id: 1,
    reg_start: new Date(Date.now() - 60_000),
    reg_end: new Date(Date.now() + 60_000),
    team_size_max: 2,
    ...overrides
});

test('joinTeam locks the user and team, then counts and writes in one transaction', async (t) => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const calls = {};
    const team = {
        id: 10,
        invite_code: null,
        is_open: 1,
        locked_at: null,
        status: 0
    };
    const player = { id: 20, team_id: team.id, t_id: 1, user_id: 7 };

    patchMethod(t, sequelize, 'transaction', async (callback) => callback(transaction));
    patchMethod(t, Tournament, 'findByPk', async () => openTournament());
    patchMethod(t, User, 'findByPk', async (_id, options) => {
        calls.userOptions = options;
        return { user_id: 7, user_name: 'player', osu_uid: 700 };
    });
    patchMethod(t, TPlayer, 'findOne', async (_options) => null);
    patchMethod(t, TStaff, 'findOne', async (options) => {
        calls.staffOptions = options;
        return null;
    });
    patchMethod(t, TTeam, 'findOne', async (options) => {
        calls.teamOptions = options;
        return team;
    });
    patchMethod(t, TPlayer, 'count', async (options) => {
        calls.countOptions = options;
        return 1;
    });
    patchMethod(t, TPlayer, 'create', async (_values, options) => {
        calls.createOptions = options;
        return player;
    });
    patchMethod(t, auditService, 'writeAuditLog', async (_entry, options) => {
        calls.auditOptions = options;
    });

    const result = await teamService.joinTeam(1, 7, { team_id: team.id });

    assert.equal(result, player);
    assert.equal(calls.userOptions.transaction, transaction);
    assert.equal(calls.userOptions.lock, transaction.LOCK.UPDATE);
    assert.deepEqual(calls.staffOptions.where.role[Op.notIn], ['tester', 'streamer', 'commentator']);
    assert.equal(calls.teamOptions.transaction, transaction);
    assert.equal(calls.teamOptions.lock, transaction.LOCK.UPDATE);
    assert.equal(calls.countOptions.transaction, transaction);
    assert.equal(calls.createOptions.transaction, transaction);
    assert.equal(calls.auditOptions.transaction, transaction);
});

test('player compatibility is limited to tester, streamer, and commentator staff roles', async (t) => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const createdRoles = [];
    let hasPlayer = true;

    patchMethod(t, sequelize, 'transaction', async (callback) => callback(transaction));
    patchMethod(t, User, 'findByPk', async () => ({ user_id: 7, user_name: 'player', osu_uid: 700 }));
    patchMethod(t, TPlayer, 'findOne', async () => hasPlayer ? { id: 70, user_id: 7 } : null);
    patchMethod(t, TStaff, 'findOne', async () => null);
    patchMethod(t, TStaff, 'create', async (values) => {
        createdRoles.push(values.role);
        return { id: createdRoles.length, ...values };
    });
    patchMethod(t, TStaff, 'findByPk', async (id) => ({ id }));
    patchMethod(t, auditService, 'writeAuditLog', async () => null);

    for (const role of ['tester', 'streamer', 'commentator']) {
        await staffService.addStaff(1, { role, user_id: 7 }, { user_id: 1 }, { created_by: 1 });
    }

    for (const role of ['custom_mapper', 'referee']) {
        await assert.rejects(
            staffService.addStaff(1, { role, user_id: 7 }, { user_id: 1 }, { created_by: 1 }),
            /该用户已参赛/
        );
    }

    hasPlayer = false;
    await staffService.addStaff(1, { role: 'custom_mapper', user_id: 7 }, { user_id: 1 }, { created_by: 1 });

    assert.deepEqual(createdRoles, ['tester', 'streamer', 'commentator', 'custom_mapper']);
});

test('captain leave deletes the player before the team and audits in the same transaction', async (t) => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const events = [];
    const player = {
        id: 30,
        is_captain: 1,
        team_id: 40,
        user_id: 7,
        destroy: async (options) => {
            assert.equal(options.transaction, transaction);
            events.push('player');
        }
    };
    const team = {
        id: 40,
        captain_player_id: player.id,
        locked_at: null,
        status: 0,
        destroy: async (options) => {
            assert.equal(options.transaction, transaction);
            events.push('team');
        }
    };

    patchMethod(t, sequelize, 'transaction', async (callback) => callback(transaction));
    patchMethod(t, Tournament, 'findByPk', async () => openTournament());
    patchMethod(t, TPlayer, 'findOne', async (options) => {
        assert.equal(options.transaction, transaction);
        assert.equal(options.lock, transaction.LOCK.UPDATE);
        return player;
    });
    patchMethod(t, TTeam, 'findOne', async (options) => {
        assert.equal(options.transaction, transaction);
        assert.equal(options.lock, transaction.LOCK.UPDATE);
        return team;
    });
    patchMethod(t, TPlayer, 'count', async (options) => {
        assert.equal(options.transaction, transaction);
        return 1;
    });
    patchMethod(t, auditService, 'writeAuditLog', async (entry, options) => {
        assert.equal(options.transaction, transaction);
        assert.equal(entry.action, 'captain_leave_delete_team');
        events.push('audit');
    });

    await teamService.leaveTeam(1, 7);

    assert.deepEqual(events, ['player', 'team', 'audit']);
});

test('leaveTeam self-heals an orphan player record even after registration closes', async (t) => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const events = [];
    const player = {
        id: 31,
        is_captain: 1,
        team_id: 999,
        user_id: 7,
        destroy: async (options) => {
            assert.equal(options.transaction, transaction);
            events.push('player');
        }
    };

    patchMethod(t, sequelize, 'transaction', async (callback) => callback(transaction));
    patchMethod(t, Tournament, 'findByPk', async () => openTournament({
        reg_start: new Date(Date.now() - 120_000),
        reg_end: new Date(Date.now() - 60_000)
    }));
    patchMethod(t, TPlayer, 'findOne', async () => player);
    patchMethod(t, TTeam, 'findOne', async () => null);
    patchMethod(t, auditService, 'writeAuditLog', async (entry, options) => {
        assert.equal(options.transaction, transaction);
        assert.equal(entry.action, 'cleanup_orphan_player');
        events.push('audit');
    });

    await teamService.leaveTeam(1, 7);

    assert.deepEqual(events, ['player', 'audit']);
});

test('score import uses the shared stage mappool and one transaction for all writes', async (t) => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const writes = [];
    const poolMap = { id: 11, map_id: 101, type: 'FU' };
    const round = {
        dataValues: { mappool: [] },
        first_to: 1,
        id: 3,
        // Sequelize leaves this eagerly-loaded association stale after
        // setDataValue(), which reproduces a loser round sharing another pool.
        mappool: [],
        t_id: 1,
        setDataValue(key, value) {
            this.dataValues[key] = value;
        }
    };
    const initialMatch = {
        id: 5,
        mp_id: 99,
        round,
        team1: { players: [{ id: 101, user_id: 201 }] },
        team1_id: 21,
        team2: { players: [{ id: 102, user_id: 202 }] },
        team2_id: 22
    };
    const lockedMatch = {
        id: initialMatch.id,
        mp_id: initialMatch.mp_id,
        status: 0,
        team1_id: initialMatch.team1_id,
        team1_score: 0,
        team2_id: initialMatch.team2_id,
        team2_score: 0,
        winner_id: null,
        save: async (options) => {
            assert.equal(options.transaction, transaction);
            writes.push('match');
        }
    };

    patchMethod(t, TMatch, 'findByPk', async (_id, options = {}) => options.transaction ? lockedMatch : initialMatch);
    patchMethod(t, User, 'findAll', async () => [
        { user_id: 201, osu_uid: 1001 },
        { user_id: 202, osu_uid: 1002 }
    ]);
    patchMethod(t, roundStageService, 'listStageMappool', async () => ({ maps: [poolMap], round }));
    patchMethod(t, roundStageService, 'getRoundFirstTo', () => 1);
    patchMethod(t, osuMatchService, 'getCompleteMatch', async () => ({ events: [{}] }));
    patchMethod(t, osuMatchService, 'getGameEvents', () => [{ game: { beatmapId: poolMap.map_id } }]);
    patchMethod(t, osuMatchService, 'getGameBeatmapId', (game) => game.beatmapId);
    patchMethod(t, osuMatchService, 'getGameScores', () => [
        { score: 900, userId: 1001 },
        { score: 800, userId: 1002 }
    ]);
    patchMethod(t, osuMatchService, 'getScoreValue', (score) => score.score);
    patchMethod(t, osuMatchService, 'getScoreUserId', (score) => score.userId);
    patchMethod(t, sequelize, 'transaction', async (callback) => callback(transaction));
    patchMethod(t, TMatchAction, 'findAll', async (options) => {
        assert.equal(options.transaction, transaction);
        assert.equal(options.lock, transaction.LOCK.UPDATE);
        return [{ id: 9, map_id: poolMap.id, sort_order: 1, team_id: initialMatch.team1_id }];
    });
    patchMethod(t, TGame, 'findAll', async (options) => {
        assert.equal(options.transaction, transaction);
        return [];
    });
    patchMethod(t, TGame, 'destroy', async (options) => {
        assert.equal(options.transaction, transaction);
        writes.push('destroy-games');
    });
    patchMethod(t, TGame, 'bulkCreate', async (rows, options) => {
        assert.equal(options.transaction, transaction);
        writes.push('create-games');
        return rows.map((row, index) => ({ id: index + 1, ...row }));
    });
    patchMethod(t, bracketService, 'propagateMatchResult', async (_id, _userId, options) => {
        assert.equal(options.transaction, transaction);
        writes.push('propagate');
        return { targets: [], updated: 0 };
    });
    patchMethod(t, auditService, 'writeAuditLog', async (entry, options) => {
        assert.equal(options.transaction, transaction);
        assert.equal(entry.action, 'fetch_match_scores');
        writes.push('audit');
    });

    let responseBody;
    const req = {
        params: { matchId: String(initialMatch.id), tid: '1' },
        t: (key) => key,
        user: { user_id: 7 }
    };
    const res = {
        json(body) {
            responseBody = body;
            return this;
        },
        status() {
            return this;
        }
    };

    await matchController.fetchMatchScores(req, res);

    assert.deepEqual(writes, ['destroy-games', 'create-games', 'match', 'propagate', 'audit']);
    assert.equal(responseBody.team1_score, 1);
    assert.equal(responseBody.team2_score, 0);
    assert.equal(responseBody.winner, 'team1');
});

test('mappool stats are manually snapshotted after effective stage matches finish', async (t) => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const gfRound = { id: 3, name: 'Grand Finals', bracket_type: 2, order: 14 };
    const resetRound = { id: 4, name: 'Grand Finals Reset', bracket_type: 3, order: 15 };
    const mapA = { id: 11, artist: 'artist a', map_id: 101, mapper: 'mapper a', title: 'title a', type: 'FU' };
    const mapB = { id: 12, artist: 'artist b', map_id: 102, mapper: 'mapper b', title: 'title b', type: 'DS' };
    const normalMatch = {
        id: 21,
        bracket_group: 'grand_final',
        is_possible: 0,
        result_type: 'normal',
        round: gfRound,
        status: 2
    };
    const inactiveReset = {
        id: 22,
        bracket_group: 'reset_final',
        is_possible: 1,
        result_type: 'normal',
        round: resetRound,
        status: 0
    };
    const actions = [
        { action_type: 'protect', map: mapA },
        { action_type: 'ban', map: mapB },
        { action_type: 'pick', map: mapA }
    ];
    let createdSnapshot;
    let auditAction;

    patchMethod(t, sequelize, 'transaction', async (callback) => callback(transaction));
    patchMethod(t, Tournament, 'findByPk', async () => ({ id: 1 }));
    patchMethod(t, TRound, 'findAll', async () => [gfRound, resetRound]);
    patchMethod(t, TMatch, 'findAll', async () => [normalMatch, inactiveReset]);
    patchMethod(t, roundStageService, 'listStageMappool', async () => ({ maps: [mapA, mapB] }));
    patchMethod(t, TMatchAction, 'findAll', async () => actions);
    patchMethod(t, TMappoolStats, 'findOne', async () => null);
    patchMethod(t, TMappoolStats, 'create', async (values) => {
        createdSnapshot = { id: 31, ...values };
        return createdSnapshot;
    });
    patchMethod(t, auditService, 'writeAuditLog', async (payload) => {
        auditAction = payload.action;
    });

    const result = await mappoolStatsService.calculate(1, 'gf', 7);

    assert.equal(result.stage.key, 'gf');
    assert.equal(result.stage.match_count, 1);
    assert.equal(result.stage.completed_match_count, 1);
    assert.equal(result.stage.valid_match_count, 1);
    assert.equal(auditAction, 'calculate');
    const snapshotMaps = JSON.parse(createdSnapshot.stats_json).maps;
    assert.equal(snapshotMaps[0].protect_count, 1);
    assert.equal(snapshotMaps[0].pick_count, 1);
    assert.equal(snapshotMaps[0].protect_rate, 1);
    assert.equal(snapshotMaps[1].ban_count, 1);
    assert.equal(snapshotMaps[1].ban_rate, 1);
});

test('mappool stats reject calculation while an activated reset final is incomplete', async (t) => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const gfRound = { id: 3, name: 'Grand Finals', bracket_type: 2, order: 14 };
    const resetRound = { id: 4, name: 'Grand Finals Reset', bracket_type: 3, order: 15 };

    patchMethod(t, sequelize, 'transaction', async (callback) => callback(transaction));
    patchMethod(t, Tournament, 'findByPk', async () => ({ id: 1 }));
    patchMethod(t, TRound, 'findAll', async () => [gfRound, resetRound]);
    patchMethod(t, TMatch, 'findAll', async () => [
        { id: 21, bracket_group: 'grand_final', is_possible: 0, result_type: 'normal', round: gfRound, status: 2 },
        { id: 22, bracket_group: 'reset_final', is_possible: 0, result_type: 'normal', round: resetRound, status: 0 }
    ]);
    patchMethod(t, roundStageService, 'listStageMappool', async () => ({
        maps: [{ id: 11, map_id: 101, type: 'FU' }]
    }));

    await assert.rejects(
        mappoolStatsService.calculate(1, 'gf', 7),
        (error) => error.status === 400 && error.message === '该阶段仍有未完成比赛'
    );
});

test('referee action validation and audit share the locked match transaction', async (t) => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const match = { id: 5, round: { id: 3, t_id: 1 }, team1_id: 21, team2_id: 22 };
    const map = { id: 11 };
    const action = { id: 9, action_type: 'pick', map_id: map.id, match_id: match.id, sort_order: 1, team_id: match.team1_id };

    patchMethod(t, sequelize, 'transaction', async (callback) => callback(transaction));
    patchMethod(t, TMatch, 'findByPk', async (_id, options) => {
        assert.equal(options.transaction, transaction);
        assert.equal(options.lock, transaction.LOCK.UPDATE);
        return match;
    });
    patchMethod(t, roundStageService, 'listStageMappool', async (_tid, _roundId, options) => {
        assert.equal(options.transaction, transaction);
        return { maps: [map] };
    });
    patchMethod(t, TMatchAction, 'findAll', async (options) => {
        assert.equal(options.transaction, transaction);
        assert.equal(options.lock, transaction.LOCK.UPDATE);
        return [];
    });
    patchMethod(t, TMatchAction, 'create', async (_values, options) => {
        assert.equal(options.transaction, transaction);
        return action;
    });
    patchMethod(t, auditService, 'writeAuditLog', async (entry, options) => {
        assert.equal(entry.action, 'create');
        assert.equal(options.transaction, transaction);
    });

    const result = await refereeActionService.createAction(match.id, {
        action_type: 'pick',
        map_id: map.id,
        team_id: match.team1_id
    }, 7, 1);

    assert.equal(result, action);
});

test('qualifier import bulk-writes scores, team MP, logs, and audit in one transaction', async (t) => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const team = { id: 21, players: [{ id: 31, team_id: 21, user_id: 41 }] };
    const qualMap = { id: 11, index: 1, map_id: 101 };
    const importLog = {
        id: 51,
        save: async (options) => assert.equal(options.transaction, transaction)
    };
    const writes = [];

    patchMethod(t, Tournament, 'findByPk', async () => openTournament());
    patchMethod(t, TTeam, 'findAll', async () => [team]);
    patchMethod(t, TQualMappool, 'findAll', async () => [qualMap]);
    patchMethod(t, User, 'findAll', async () => [{ user_id: 41, osu_uid: 1001 }]);
    patchMethod(t, osuMatchService, 'getCompleteMatch', async () => ({ events: [{}] }));
    patchMethod(t, osuMatchService, 'getGameEvents', () => [{ game: { beatmapId: qualMap.map_id, id: 61 } }]);
    patchMethod(t, osuMatchService, 'getGameBeatmapId', (game) => game.beatmapId);
    patchMethod(t, osuMatchService, 'getGameId', (game) => game.id);
    patchMethod(t, osuMatchService, 'getGameScores', () => [{ score: 900, userId: 1001 }]);
    patchMethod(t, osuMatchService, 'getScoreValue', (score) => score.score);
    patchMethod(t, osuMatchService, 'getScoreUserId', (score) => score.userId);
    patchMethod(t, sequelize, 'transaction', async (callback) => callback(transaction));
    patchMethod(t, TQualImport, 'create', async (_values, options) => {
        assert.equal(options.transaction, transaction);
        writes.push('log');
        return importLog;
    });
    patchMethod(t, TQualScore, 'bulkCreate', async (_rows, options) => {
        assert.equal(options.transaction, transaction);
        assert.equal(options.ignoreDuplicates, true);
        writes.push('scores');
    });
    patchMethod(t, TQualScore, 'findAll', async (options) => {
        assert.equal(options.transaction, transaction);
        if (options.attributes) return [];
        return [{ id: 71, import_id: importLog.id, map_id: qualMap.id, team_id: team.id, player_id: 31, attempt_no: 1, score: 900 }];
    });
    patchMethod(t, TTeam, 'update', async (_values, options) => {
        assert.equal(options.transaction, transaction);
        writes.push('team');
    });
    patchMethod(t, auditService, 'writeAuditLog', async (entry, options) => {
        assert.equal(entry.action, 'import_scores');
        assert.equal(options.transaction, transaction);
        writes.push('audit');
    });

    const result = await qualifierService.fetchQualScoresFromMp(1, { mp_id: 12345 }, 7);

    assert.deepEqual(writes, ['log', 'scores', 'team', 'audit']);
    assert.equal(result.scores.length, 1);
    assert.equal(result.skippedDuplicates, 0);
});

test('qualifier re-import updates a changed upstream score instead of duplicating it', async (t) => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const team = { id: 21, players: [{ id: 31, team_id: 21, user_id: 41 }] };
    const qualMap = { id: 11, index: 1, map_id: 101 };
    const importLog = {
        id: 52,
        save: async (options) => assert.equal(options.transaction, transaction)
    };
    const existingScore = {
        id: 71,
        map_id: qualMap.id,
        team_id: team.id,
        player_id: 31,
        score: 800,
        attempt_no: 1,
        source_mp_id: 12345,
        source_game_id: 61,
        is_manual: 1,
        save: async (options) => assert.equal(options.transaction, transaction)
    };

    patchMethod(t, Tournament, 'findByPk', async () => openTournament());
    patchMethod(t, TTeam, 'findAll', async () => [team]);
    patchMethod(t, TQualMappool, 'findAll', async () => [qualMap]);
    patchMethod(t, User, 'findAll', async () => [{ user_id: 41, osu_uid: 1001 }]);
    patchMethod(t, osuMatchService, 'getCompleteMatch', async () => ({ events: [{}] }));
    patchMethod(t, osuMatchService, 'getGameEvents', () => [{ game: { beatmapId: qualMap.map_id, id: 61 } }]);
    patchMethod(t, osuMatchService, 'getGameBeatmapId', (game) => game.beatmapId);
    patchMethod(t, osuMatchService, 'getGameId', (game) => game.id);
    patchMethod(t, osuMatchService, 'getGameScores', () => [{ score: 900, userId: 1001 }]);
    patchMethod(t, osuMatchService, 'getScoreValue', (score) => score.score);
    patchMethod(t, osuMatchService, 'getScoreUserId', (score) => score.userId);
    patchMethod(t, sequelize, 'transaction', async (callback) => callback(transaction));
    patchMethod(t, TQualImport, 'create', async () => importLog);
    patchMethod(t, TQualScore, 'findAll', async (options) => {
        assert.equal(options.transaction, transaction);
        if (options.attributes) {
            assert.equal(options.lock, transaction.LOCK.UPDATE);
            return [existingScore];
        }
        return [];
    });
    patchMethod(t, TTeam, 'update', async (_values, options) => {
        assert.equal(options.transaction, transaction);
    });
    patchMethod(t, auditService, 'writeAuditLog', async (entry, options) => {
        assert.equal(options.transaction, transaction);
        assert.equal(entry.new_value.created_count, 0);
        assert.equal(entry.new_value.updated_count, 1);
        assert.deepEqual(entry.new_value.updated_scores[0], {
            score_id: existingScore.id,
            from: 800,
            to: 900,
            was_manual: true
        });
    });

    const result = await qualifierService.fetchQualScoresFromMp(1, { mp_id: 12345 }, 7);

    assert.equal(existingScore.score, 900);
    assert.equal(existingScore.is_manual, 0);
    assert.equal(result.createdCount, 0);
    assert.equal(result.updatedCount, 1);
    assert.equal(result.skippedDuplicates, 0);
    assert.equal(result.scores[0].score, 900);
});

test('qualifier mappool creation locks the tournament and audits in the same transaction', async (t) => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const map = { id: 11, t_id: 1, index: 1, map_id: 101 };
    const calls = {};

    patchMethod(t, sequelize, 'transaction', async (callback) => callback(transaction));
    patchMethod(t, Tournament, 'findByPk', async (_id, options) => {
        calls.tournamentOptions = options;
        return openTournament();
    });
    patchMethod(t, TQualMappool, 'findOne', async (options) => {
        assert.equal(options.transaction, transaction);
        return null;
    });
    patchMethod(t, TQualMappool, 'create', async (_values, options) => {
        calls.createOptions = options;
        return map;
    });
    patchMethod(t, auditService, 'writeAuditLog', async (entry, options) => {
        assert.equal(entry.action, 'create');
        calls.auditOptions = options;
    });

    const result = await qualifierService.createQualMap(1, {
        artist: 'artist',
        index: 1,
        map_id: 101,
        mapper: 'mapper',
        title: 'title'
    }, 7);

    assert.equal(result, map);
    assert.equal(calls.tournamentOptions.transaction, transaction);
    assert.equal(calls.tournamentOptions.lock, transaction.LOCK.UPDATE);
    assert.equal(calls.createOptions.transaction, transaction);
    assert.equal(calls.auditOptions.transaction, transaction);
});

test('tournament updates and their audit log commit atomically', async (t) => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const tournament = {
        id: 1,
        name: 'old',
        update: async (patch, options) => {
            assert.equal(options.transaction, transaction);
            Object.assign(tournament, patch);
        }
    };

    patchMethod(t, sequelize, 'transaction', async (callback) => callback(transaction));
    patchMethod(t, Tournament, 'findByPk', async (_id, options) => {
        assert.equal(options.transaction, transaction);
        assert.equal(options.lock, transaction.LOCK.UPDATE);
        return tournament;
    });
    patchMethod(t, auditService, 'writeAuditLog', async (entry, options) => {
        assert.equal(entry.action, 'update');
        assert.equal(options.transaction, transaction);
    });

    const result = await tournamentService.updateTournament(1, { name: 'new' }, 7);

    assert.equal(result.name, 'new');
});

test('audit storage keeps only changed, non-sensitive, compact values', async (t) => {
    let stored;
    patchMethod(t, TAuditLog, 'create', async (values) => {
        stored = values;
        return values;
    });

    await auditService.writeAuditLog({
        t_id: 1,
        entity_type: 'section',
        entity_id: 2,
        action: 'update',
        operator_id: 7,
        old_value: {
            id: 2,
            title: 'Old',
            status: 1,
            invite_code: 'SECRET',
            source_markdown: 'abc',
            updated_time: 'old-time'
        },
        new_value: {
            id: 2,
            title: 'New',
            status: 1,
            invite_code: 'NEW-SECRET',
            source_markdown: 'abcdef',
            updated_time: 'new-time'
        }
    });

    assert.deepEqual(JSON.parse(stored.old_value_json), {
        title: 'Old',
        source_markdown: { length: 3 }
    });
    assert.deepEqual(JSON.parse(stored.new_value_json), {
        title: 'New',
        source_markdown: { length: 6 }
    });
});

test('audit list excludes payload columns and detail fetches one scoped row', async (t) => {
    let listOptions;
    const detail = { id: 9, t_id: 1, old_value_json: '{}', new_value_json: '{}' };
    patchMethod(t, Tournament, 'findByPk', async () => openTournament());
    patchMethod(t, TAuditLog, 'findAndCountAll', async (options) => {
        listOptions = options;
        return { count: 1, rows: [{ id: 9 }] };
    });
    patchMethod(t, TAuditLog, 'findOne', async (options) => {
        assert.deepEqual(options.where, { id: 9, t_id: 1 });
        return detail;
    });

    const result = await auditService.listAuditLogs(1);
    const loaded = await auditService.getAuditLog(1, 9);

    assert.equal(result.total, 1);
    assert.equal(loaded, detail);
    assert.equal(listOptions.attributes.includes('old_value_json'), false);
    assert.equal(listOptions.attributes.includes('new_value_json'), false);
});

const assert = require('node:assert/strict');
const test = require('node:test');
const ratingService = require('../services/tournament/ratingService');

const game = ({
    beatmapId,
    id,
    matchId,
    order,
    player1Id = 1,
    player1Score,
    player2Id = 2,
    player2Score,
    roundOrder = 1,
    roundStage,
    scheduledAt
}) => ({
    beatmapId: beatmapId ?? 100 + id,
    gameOrder: order,
    id,
    mapId: 10 + id,
    matchId: matchId ?? 20 + id,
    player1: { playerId: player1Id, score: player1Score, teamId: player1Id, userId: 1000 + player1Id },
    player2: { playerId: player2Id, score: player2Score, teamId: player2Id, userId: 1000 + player2Id },
    roundOrder,
    roundStage,
    scheduledAt
});

test('each valid game produces two GPR rows and updates tournament ratings', () => {
    const result = ratingService.calculateTournamentRatings([
        game({ id: 1, order: 1, player1Score: 950000, player2Score: 900000, scheduledAt: '2026-01-01T10:00:00Z' }),
        game({ id: 2, order: 2, player1Score: 920000, player2Score: 940000, scheduledAt: '2026-01-01T11:00:00Z' })
    ]);

    assert.equal(result.plays.length, 4);
    assert.equal(result.ratings.length, 2);
    assert.deepEqual(result.plays.map(play => play.sequence_no), [1, 1, 2, 2]);
    for (const play of result.plays) {
        assert.equal(play.rating_after, Math.round((play.rating_before + play.rating_delta) * 1000) / 1000);
        assert.ok(Number.isFinite(play.jpp));
    }
    const player1 = result.ratings.find(rating => rating.player_id === 1);
    const player1LastPlay = result.plays.filter(play => play.player_id === 1).at(-1);
    assert.equal(player1.tournament_rating, player1LastPlay.rating_after);
    assert.equal(player1.game_count, 2);
});

test('calculation follows scheduled game order instead of database input order', () => {
    const early = game({ id: 1, order: 1, player1Score: 960000, player2Score: 900000, scheduledAt: '2026-01-01T10:00:00Z' });
    const late = game({ id: 2, order: 2, player1Score: 910000, player2Score: 940000, scheduledAt: '2026-01-01T11:00:00Z' });
    const ordered = ratingService.calculateTournamentRatings([early, late]);
    const shuffled = ratingService.calculateTournamentRatings([late, early]);

    assert.deepEqual(shuffled.plays, ordered.plays);
    assert.deepEqual(shuffled.ratings, ordered.ratings);
});

test('round order wins over scheduled time and IDs are stable fallbacks', () => {
    const laterRound = game({
        id: 1,
        matchId: 10,
        order: 1,
        player1Score: 960000,
        player2Score: 900000,
        roundOrder: 2,
        scheduledAt: '2026-01-01T10:00:00Z'
    });
    const earlierRound = game({
        id: 2,
        matchId: 20,
        order: 1,
        player1Score: 910000,
        player2Score: 940000,
        roundOrder: 1,
        scheduledAt: '2026-01-01T11:00:00Z'
    });
    const result = ratingService.calculateTournamentRatings([laterRound, earlierRound]);

    assert.deepEqual(result.plays.filter(play => play.side === 1).map(play => play.game_id), [2, 1]);
});

test('same-map performance compares only scores from that exact map', () => {
    const result = ratingService.calculateTournamentRatings([
        game({ beatmapId: 100, id: 1, matchId: 1, order: 1, player1Score: 950000, player2Score: 900000 }),
        game({ beatmapId: 200, id: 2, matchId: 2, order: 1, player1Score: 550000, player2Score: 500000 })
    ]);
    const player1Plays = result.plays.filter(play => play.player_id === 1);

    assert.equal(player1Plays[0].absolute_component, player1Plays[1].absolute_component);
    assert.equal(player1Plays[0].playQuality, player1Plays[1].playQuality);
});

test('GPR contains rank points plus the linear 999000 high-score bonus', () => {
    const result = ratingService.calculateTournamentRatings([
        game({ beatmapId: 100, id: 1, matchId: 1, order: 1, player1Score: 999500, player2Score: 998000 })
    ]);
    const winner = result.plays.find(play => play.side === 1);
    const loser = result.plays.find(play => play.side === 2);

    assert.equal(winner.absolute_component, 1500);
    assert.equal(winner.match_component, 100);
    assert.equal(winner.jpp, 1600);
    assert.equal(loser.absolute_component, 1250);
    assert.equal(loser.match_component, 0);
    assert.equal(loser.jpp, 1250);
});

test('same-map percentile uses (scores below + 1) / map sample count', () => {
    const result = ratingService.calculateTournamentRatings([
        game({ beatmapId: 100, id: 1, matchId: 1, order: 1, player1Score: 950000, player2Score: 900000 }),
        game({ beatmapId: 100, id: 2, matchId: 2, order: 1, player1Score: 850000, player2Score: 800000 })
    ]);
    const points = result.plays.map(play => play.absolute_component);

    assert.deepEqual(points, [1500, 1375, 1250, 1125]);
});

test('round coefficient adds five percent per normalized tournament stage', () => {
    const result = ratingService.calculateTournamentRatings([
        game({ beatmapId: 100, id: 1, matchId: 1, order: 1, player1Score: 950000, player2Score: 900000, roundOrder: 7, roundStage: 'qf' })
    ]);
    const winner = result.plays.find(play => play.side === 1);

    assert.equal(winner.absolute_weight, 1.1);
    assert.equal(winner.absolute_component, 1550);
});

test('winner and loser bracket rounds in the same stage use the same coefficient', () => {
    const result = ratingService.calculateTournamentRatings([
        game({ beatmapId: 100, id: 1, matchId: 1, order: 1, player1Score: 950000, player2Score: 900000, roundOrder: 4, roundStage: 'sf' }),
        game({ beatmapId: 101, id: 2, matchId: 2, order: 1, player1Score: 950000, player2Score: 900000, roundOrder: 10, roundStage: 'sf' })
    ]);

    assert.deepEqual(result.plays.filter(play => play.side === 1).map(play => play.absolute_weight), [1.15, 1.15]);
});

test('TPR is average GPR multiplied by the logarithmic participation coefficient', () => {
    const sourceGames = [];
    for (let index = 1; index <= 30; index += 1) {
        sourceGames.push(game({
            beatmapId: 100 + index,
            id: index,
            matchId: index,
            order: 1,
            player1Score: 950000,
            player2Score: 900000
        }));
    }
    const result = ratingService.calculateTournamentRatings(sourceGames);
    const winner = result.ratings.find(rating => rating.player_id === 1);
    const loser = result.ratings.find(rating => rating.player_id === 2);

    assert.equal(winner.average_jpp, 1500);
    assert.equal(winner.tournament_rating, 1500);
    assert.equal(loser.average_jpp, 1250);
    assert.equal(loser.tournament_rating, 1250);
});

test('participation coefficient rewards more valid games without forcing a loser to zero', () => {
    const oneGame = ratingService.calculateTournamentRatings([
        game({ beatmapId: 100, id: 1, matchId: 1, order: 1, player1Score: 950000, player2Score: 900000 })
    ]);
    const twoGames = ratingService.calculateTournamentRatings([
        game({ beatmapId: 100, id: 1, matchId: 1, order: 1, player1Score: 950000, player2Score: 900000 }),
        game({ beatmapId: 101, id: 2, matchId: 2, order: 1, player1Score: 950000, player2Score: 900000 })
    ]);

    const oneGameWinner = oneGame.ratings.find(rating => rating.player_id === 1);
    const twoGameWinner = twoGames.ratings.find(rating => rating.player_id === 1);
    const loser = oneGame.ratings.find(rating => rating.player_id === 2);
    assert.ok(twoGameWinner.tournament_rating > oneGameWinner.tournament_rating);
    assert.ok(loser.tournament_rating > 1000);
});

test('tournament calculations are independent and always start players at the display baseline', () => {
    const firstTournament = ratingService.calculateTournamentRatings([
        game({ id: 1, order: 1, player1Score: 980000, player2Score: 850000, scheduledAt: '2026-01-01T10:00:00Z' })
    ]);
    const secondTournament = ratingService.calculateTournamentRatings([
        game({ id: 2, order: 1, player1Score: 980000, player2Score: 850000, scheduledAt: '2026-06-01T10:00:00Z' })
    ]);

    assert.equal(firstTournament.plays[0].rating_before, 1000);
    assert.equal(secondTournament.plays[0].rating_before, 1000);
});

test('source hash changes when an imported score is manually corrected', () => {
    const original = [game({ id: 1, order: 1, player1Score: 950000, player2Score: 900000, scheduledAt: '2026-01-01T10:00:00Z' })];
    const corrected = [game({ id: 1, order: 1, player1Score: 970000, player2Score: 900000, scheduledAt: '2026-01-01T10:00:00Z' })];
    assert.notEqual(ratingService.buildSourceHash(original), ratingService.buildSourceHash(corrected));
});

test('reserved miss data does not affect ratings or their source hash', () => {
    const original = game({ id: 1, order: 1, player1Score: 950000, player2Score: 900000 });
    const withMiss = structuredClone(original);
    withMiss.player1.missCount = 3;
    withMiss.player2.missCount = 1;

    assert.equal(ratingService.buildSourceHash([original]), ratingService.buildSourceHash([withMiss]));
    assert.deepEqual(
        ratingService.calculateTournamentRatings([original]),
        ratingService.calculateTournamentRatings([withMiss])
    );
});

test('flattening excludes unpicked, tied, missing-score, and non-normal games', () => {
    const makeModelGame = overrides => ({
        action_type: 2,
        id: 1,
        map: { map_id: 100 },
        map_id: 10,
        order: 1,
        player1: { id: 1, team_id: 1, user_id: 101 },
        player1_id: 1,
        player1_score: 950000,
        player2: { id: 2, team_id: 2, user_id: 102 },
        player2_id: 2,
        player2_score: 900000,
        ...overrides
    });
    const matches = [{
        games: [
            makeModelGame({ id: 1 }),
            makeModelGame({ action_type: 0, id: 2 }),
            makeModelGame({ id: 3, player2_score: 0 }),
            makeModelGame({ id: 4, player2_score: 950000 })
        ],
        id: 1,
        result_type: 'normal',
        round: { order: 1 },
        scheduled_time: new Date('2026-01-01T10:00:00Z'),
        slot_no: 1
    }, {
        games: [makeModelGame({ id: 5 })],
        id: 2,
        result_type: 'ff',
        round: { order: 1 },
        scheduled_time: new Date('2026-01-01T11:00:00Z'),
        slot_no: 2
    }];

    assert.deepEqual(ratingService.flattenEligibleGames(matches).map(item => item.id), [1]);
});

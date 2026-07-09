require('dotenv').config();

const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');

const APPLY = process.argv.includes('--apply');

const ROUND_NAMES = new Map([
  [6, 'Losers RO16'],
  [7, 'Losers Quarterfinals A'],
  [8, 'Losers Quarterfinals B'],
  [9, 'Losers Semifinals A'],
  [10, 'Losers Semifinals B'],
  [11, 'Losers Finals A'],
  [12, 'Losers Finals B'],
  [13, 'Losers Grand Finals'],
]);

const ROUND_FIRST_TO = new Map([
  [1, 5],
  [2, 5],
  [3, 6],
  [4, 6],
  [5, 7],
  [6, 5],
  [7, 6],
  [8, 6],
  [9, 6],
  [10, 6],
  [11, 7],
  [12, 7],
  [13, 7],
  [14, 7],
  [15, 7],
]);

const RO32_SEED_PAIRS = [
  [1, 32],
  [16, 17],
  [8, 25],
  [9, 24],
  [4, 29],
  [13, 20],
  [5, 28],
  [12, 21],
  [2, 31],
  [15, 18],
  [7, 26],
  [10, 23],
  [3, 30],
  [14, 19],
  [6, 27],
  [11, 22],
];

const FLOW = [
  [17, 1, 'loser', 2, 'loser'],
  [18, 3, 'loser', 4, 'loser'],
  [19, 5, 'loser', 6, 'loser'],
  [20, 7, 'loser', 8, 'loser'],
  [21, 9, 'loser', 10, 'loser'],
  [22, 11, 'loser', 12, 'loser'],
  [23, 13, 'loser', 14, 'loser'],
  [24, 15, 'loser', 16, 'loser'],
  [25, 1, 'winner', 2, 'winner'],
  [26, 3, 'winner', 4, 'winner'],
  [27, 5, 'winner', 6, 'winner'],
  [28, 7, 'winner', 8, 'winner'],
  [29, 9, 'winner', 10, 'winner'],
  [30, 11, 'winner', 12, 'winner'],
  [31, 13, 'winner', 14, 'winner'],
  [32, 15, 'winner', 16, 'winner'],
  [33, 25, 'loser', 24, 'winner'],
  [34, 26, 'loser', 23, 'winner'],
  [35, 27, 'loser', 22, 'winner'],
  [36, 28, 'loser', 21, 'winner'],
  [37, 29, 'loser', 20, 'winner'],
  [38, 30, 'loser', 19, 'winner'],
  [39, 31, 'loser', 18, 'winner'],
  [40, 32, 'loser', 17, 'winner'],
  [41, 34, 'winner', 33, 'winner'],
  [42, 36, 'winner', 35, 'winner'],
  [43, 38, 'winner', 37, 'winner'],
  [44, 40, 'winner', 39, 'winner'],
  [45, 25, 'winner', 26, 'winner'],
  [46, 27, 'winner', 28, 'winner'],
  [47, 29, 'winner', 30, 'winner'],
  [48, 31, 'winner', 32, 'winner'],
  [49, 45, 'loser', 43, 'winner'],
  [50, 46, 'loser', 44, 'winner'],
  [51, 47, 'loser', 41, 'winner'],
  [52, 48, 'loser', 42, 'winner'],
  [53, 50, 'winner', 49, 'winner'],
  [54, 52, 'winner', 51, 'winner'],
  [55, 45, 'winner', 46, 'winner'],
  [56, 47, 'winner', 48, 'winner'],
  [57, 55, 'loser', 54, 'winner'],
  [58, 56, 'loser', 53, 'winner'],
  [59, 58, 'winner', 57, 'winner'],
  [60, 55, 'winner', 56, 'winner'],
  [61, 60, 'loser', 59, 'winner'],
  [62, 60, 'winner', 61, 'winner'],
  [63, 62, 'winner', 62, 'loser'],
];

function requireEnv(name) {
  if (!process.env[name]) {
    throw new Error(`Missing ${name}`);
  }
}

function getMatchNo(match) {
  if (match.bracket_group === 'winner' && match.round_no === 1) return match.slot_no;
  if (match.bracket_group === 'loser' && match.round_no === 1) return 16 + match.slot_no;
  if (match.bracket_group === 'winner' && match.round_no === 2) return 24 + match.slot_no;
  if (match.bracket_group === 'loser' && match.round_no === 2) return 32 + match.slot_no;
  if (match.bracket_group === 'loser' && match.round_no === 3) return 40 + match.slot_no;
  if (match.bracket_group === 'winner' && match.round_no === 3) return 44 + match.slot_no;
  if (match.bracket_group === 'loser' && match.round_no === 4) return 48 + match.slot_no;
  if (match.bracket_group === 'loser' && match.round_no === 5) return 52 + match.slot_no;
  if (match.bracket_group === 'winner' && match.round_no === 4) return 54 + match.slot_no;
  if (match.bracket_group === 'loser' && match.round_no === 6) return 56 + match.slot_no;
  if (match.bracket_group === 'loser' && match.round_no === 7) return 58 + match.slot_no;
  if (match.bracket_group === 'winner' && match.round_no === 5) return 59 + match.slot_no;
  if (match.bracket_group === 'loser' && match.round_no === 8) return 60 + match.slot_no;
  if (match.bracket_group === 'grand_final') return 62;
  if (match.bracket_group === 'reset_final') return 63;
  return null;
}

function sameSource(match, desired, refByNo) {
  const [, source1No, source1Result, source2No, source2Result] = desired;
  return Number(match.source_match_1_id) === Number(refByNo.get(source1No).id) &&
    match.source_match_1_result === source1Result &&
    Number(match.source_match_2_id) === Number(refByNo.get(source2No).id) &&
    match.source_match_2_result === source2Result;
}

async function main() {
  ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'].forEach(requireEnv);

  try {
    const [tournament] = await sequelize.query(
      'SELECT id, acronym FROM tournament WHERE acronym = ? LIMIT 1',
      { replacements: ['JHC2026'], type: QueryTypes.SELECT },
    );
    if (!tournament) throw new Error('JHC2026 tournament not found');

    const matches = await sequelize.query(
      `SELECT m.*
       FROM t_match m
       JOIN t_round r ON r.id = m.round_id
       WHERE r.t_id = ?
       ORDER BY r.order ASC, m.slot_no ASC`,
      { replacements: [tournament.id], type: QueryTypes.SELECT },
    );

    const refByNo = new Map();
    for (const match of matches) {
      const matchNo = getMatchNo(match);
      if (!matchNo) continue;
      if (refByNo.has(matchNo)) throw new Error(`Duplicate match #${matchNo}`);
      refByNo.set(matchNo, match);
    }
    if (refByNo.size !== 63) {
      throw new Error(`Expected 63 bracket matches, found ${refByNo.size}`);
    }

    const mismatches = [];
    for (const desired of FLOW) {
      const [targetNo, source1No, , source2No] = desired;
      const target = refByNo.get(targetNo);
      if (!target) throw new Error(`Missing target match #${targetNo}`);
      if (!refByNo.has(source1No)) throw new Error(`Missing source match #${source1No}`);
      if (!refByNo.has(source2No)) throw new Error(`Missing source match #${source2No}`);
      if (!sameSource(target, desired, refByNo)) {
        mismatches.push(desired);
      }
    }

    const rounds = await sequelize.query(
      'SELECT `order`, name FROM t_round WHERE t_id = ? AND `order` BETWEEN 6 AND 13 ORDER BY `order` ASC',
      { replacements: [tournament.id], type: QueryTypes.SELECT },
    );
    const roundNameMismatches = rounds.filter((round) => ROUND_NAMES.get(round.order) !== round.name);
    const roundFtRows = await sequelize.query(
      'SELECT `order`, first_to FROM t_round WHERE t_id = ? ORDER BY `order` ASC',
      { replacements: [tournament.id], type: QueryTypes.SELECT },
    );
    const roundFtMismatches = roundFtRows.filter((round) => ROUND_FIRST_TO.has(round.order) && ROUND_FIRST_TO.get(round.order) !== round.first_to);

    const teams = await sequelize.query(
      `SELECT id, qual_rank, qual_score
       FROM t_team
       WHERE t_id = ? AND status = 1 AND qual_rank IS NOT NULL
       ORDER BY qual_rank ASC, qual_score DESC, id ASC
       LIMIT 32`,
      { replacements: [tournament.id], type: QueryTypes.SELECT },
    );
    const ro32TeamMismatches = [];
    if (teams.length === 32) {
      for (let i = 0; i < RO32_SEED_PAIRS.length; i += 1) {
        const matchNo = i + 1;
        const match = refByNo.get(matchNo);
        const [seed1, seed2] = RO32_SEED_PAIRS[i];
        const desiredTeam1 = teams[seed1 - 1]?.id;
        const desiredTeam2 = teams[seed2 - 1]?.id;
        if (Number(match.team1_id) !== Number(desiredTeam1) || Number(match.team2_id) !== Number(desiredTeam2)) {
          ro32TeamMismatches.push([matchNo, desiredTeam1, desiredTeam2]);
        }
      }
    }

    console.log(`JHC2026 tournament id: ${tournament.id}`);
    console.log(`Bracket matches found: ${refByNo.size}`);
    console.log(`Source graph mismatches: ${mismatches.length}`);
    console.log(`Round name mismatches: ${roundNameMismatches.length}`);
    console.log(`Round FT mismatches: ${roundFtMismatches.length}`);
    console.log(`RO32 team mismatches: ${teams.length === 32 ? ro32TeamMismatches.length : 'skipped; expected 32 ranked teams'}`);

    if (!APPLY) {
      console.log('Dry run only. Re-run with --apply to update.');
      return;
    }

    const transaction = await sequelize.transaction();
    try {
      for (const [order, name] of ROUND_NAMES.entries()) {
        await sequelize.query(
          'UPDATE t_round SET name = ? WHERE t_id = ? AND `order` = ?',
          { replacements: [name, tournament.id, order], transaction },
        );
      }
      for (const [order, firstTo] of ROUND_FIRST_TO.entries()) {
        await sequelize.query(
          'UPDATE t_round SET first_to = ? WHERE t_id = ? AND `order` = ?',
          { replacements: [firstTo, tournament.id, order], transaction },
        );
      }

      if (teams.length === 32 && ro32TeamMismatches.length > 0) {
        const unsafe = Array.from({ length: 16 }, (_, index) => refByNo.get(index + 1)).filter((match) => (
          Number(match.status) !== 0 ||
          Number(match.team1_score) !== 0 ||
          Number(match.team2_score) !== 0 ||
          match.winner_id
        ));
        if (unsafe.length > 0) {
          throw new Error(`Refusing to rewrite RO32 teams because ${unsafe.length} RO32 matches have started or have results`);
        }

        for (const [matchNo, desiredTeam1, desiredTeam2] of ro32TeamMismatches) {
          await sequelize.query(
            'UPDATE t_match SET team1_id = ?, team2_id = ? WHERE id = ?',
            { replacements: [desiredTeam1, desiredTeam2, refByNo.get(matchNo).id], transaction },
          );
        }
      }

      for (const desired of FLOW) {
        const [targetNo, source1No, source1Result, source2No, source2Result] = desired;
        const target = refByNo.get(targetNo);
        const source1 = refByNo.get(source1No);
        const source2 = refByNo.get(source2No);
        await sequelize.query(
          `UPDATE t_match
           SET source_match_1_id = ?,
               source_match_1_result = ?,
               source_match_2_id = ?,
               source_match_2_result = ?,
               hidden_until_match_id = CASE WHEN ? = 63 THEN ? ELSE hidden_until_match_id END,
               is_possible = CASE WHEN ? = 63 THEN 1 ELSE is_possible END
           WHERE id = ?`,
          {
            replacements: [source1.id, source1Result, source2.id, source2Result, targetNo, source1.id, targetNo, target.id],
            transaction,
          },
        );
      }

      for (let matchNo = 1; matchNo <= 16; matchNo += 1) {
        await sequelize.query(
          `UPDATE t_match
           SET source_match_1_id = NULL,
               source_match_1_result = NULL,
               source_match_2_id = NULL,
               source_match_2_result = NULL
           WHERE id = ?`,
          { replacements: [refByNo.get(matchNo).id], transaction },
        );
      }

      await transaction.commit();
      console.log(`Applied repair: ${FLOW.length} source graph rows, ${ROUND_NAMES.size} round names, ${ROUND_FIRST_TO.size} FT values, ${ro32TeamMismatches.length} RO32 team rows.`);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } finally {
    await sequelize.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

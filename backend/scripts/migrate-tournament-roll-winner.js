const sequelize = require('../config/db');
const { QueryTypes } = require('sequelize');

async function columnExists(tableName, columnName) {
    const rows = await sequelize.query(
        `SELECT COUNT(*) AS count
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?`,
        { replacements: [tableName, columnName], type: QueryTypes.SELECT }
    );
    return Number(rows?.[0]?.count || 0) > 0;
}

async function main() {
    const hasRollWinner = await columnExists('t_match', 'roll_winner_id');
    const hasTeam1Roll = await columnExists('t_match', 'team1_roll');
    const hasTeam2Roll = await columnExists('t_match', 'team2_roll');

    const clauses = [];
    if (!hasRollWinner) {
        clauses.push("ADD COLUMN `roll_winner_id` INT NULL COMMENT 'Roll胜方队伍id' AFTER `team2_id`");
    }
    if (hasTeam1Roll) {
        clauses.push("DROP COLUMN `team1_roll`");
    }
    if (hasTeam2Roll) {
        clauses.push("DROP COLUMN `team2_roll`");
    }

    if (clauses.length === 0) {
        console.log('t_match roll winner schema is already up to date.');
        return;
    }

    await sequelize.query(`ALTER TABLE \`t_match\`\n  ${clauses.join(',\n  ')}`);
    console.log(`Updated t_match roll winner schema: ${clauses.join('; ')}`);
}

main()
    .then(async () => {
        await sequelize.close();
    })
    .catch(async (error) => {
        console.error(error);
        await sequelize.close();
        process.exit(1);
    });

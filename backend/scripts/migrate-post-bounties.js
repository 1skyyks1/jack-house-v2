const fs = require('node:fs');
const path = require('node:path');

async function migratePostBounties(sequelize) {
    const sql = fs.readFileSync(path.join(__dirname, '../sql/2026-10-05-post-bounties.sql'), 'utf8');
    for (const statement of sql.replace(/^--.*$/gm, '').split(';').map(value => value.trim()).filter(Boolean)) {
        await sequelize.query(statement);
    }
    const queryInterface = sequelize.getQueryInterface();
    const post = await queryInterface.describeTable('post');
    const links = await queryInterface.describeTable('post_pack');
    if (!post.bounty_closed_at || !links.post_id || !links.pack_id) throw new Error('Bounty schema verification failed');
}

if (require.main === module) {
    const sequelize = require('../config/db');
    migratePostBounties(sequelize)
        .then(() => console.log('Migration verified: post bounties are ready.'))
        .catch(error => { console.error('Migration failed:', error.message); process.exitCode = 1; })
        .finally(() => sequelize.close());
}

module.exports = { migratePostBounties };

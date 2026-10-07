// Optional live migration test. Only an explicitly supplied local disposable MariaDB is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createReader } = require('../services/botPackEvents');

test('MariaDB triggers: historical baseline, old-pack transitions, rollback and commit ordering', {
    skip: !process.env.JHBOT_EVENT_TEST_URL,
    timeout: 30000,
}, async () => {
    const url = new URL(process.env.JHBOT_EVENT_TEST_URL);
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Only a disposable local database is accepted');
    const mariadb = require('mariadb');
    const { Sequelize } = require('sequelize');
    const name = `jhbot_event_test_${crypto.randomBytes(6).toString('hex')}`;
    const config = { host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port) || 3306,
        user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), bigIntAsNumber: false };
    const admin = await mariadb.createConnection(config);
    let pool, sequelize;
    try {
        await admin.query(`CREATE DATABASE \`${name}\``);
        pool = mariadb.createPool({ ...config, database: name, connectionLimit: 4 });
        await pool.query(`CREATE TABLE pack(pack_id INT PRIMARY KEY,title VARCHAR(255),title_unicode VARCHAR(255),
            artist VARCHAR(255),artist_unicode VARCHAR(255),creator VARCHAR(255),osu_bid INT,type TINYINT,
            leaderboard_enabled TINYINT NOT NULL DEFAULT 0,is_recommended TINYINT NOT NULL DEFAULT 0) ENGINE=InnoDB`);
        await pool.query("INSERT INTO pack(pack_id,title,creator,leaderboard_enabled) VALUES (42,'old pack','mapper',0),(43,'other old pack','mapper',0),(99,'historical pick','mapper',1)");
        const migrationPath = fs.existsSync(path.join(__dirname, '2026-09-30-bot-pack-events.sql'))
            ? path.join(__dirname, '2026-09-30-bot-pack-events.sql')
            : path.join(__dirname, '../sql/2026-09-30-bot-pack-events.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8').replace(/^--.*$/gm, '');
        const [tables, triggers] = sql.split('DELIMITER //');
        for (const statement of tables.split(';').map(s => s.trim()).filter(Boolean)) await pool.query(statement);
        for (const statement of triggers.split('DELIMITER ;')[0].split('//').map(s => s.trim()).filter(Boolean)) await pool.query(statement);
        const count = async () => Number((await pool.query('SELECT COUNT(*) AS count FROM bot_pack_events'))[0].count);
        assert.equal(await count(), 0, 'No history backfill');
        await pool.query('UPDATE pack SET leaderboard_enabled=1 WHERE pack_id=42');
        await pool.query('UPDATE pack SET leaderboard_enabled=1 WHERE pack_id=42');
        assert.equal(await count(), 1, 'No event for unchanged flags');
        await pool.query('UPDATE pack SET is_recommended=1 WHERE pack_id=42');
        const rollback = await pool.getConnection();
        try {
            await rollback.beginTransaction();
            await rollback.query('UPDATE pack SET leaderboard_enabled=0,is_recommended=0 WHERE pack_id=42');
            assert.equal(await count(), 2, 'Uncommitted event invisible');
            await rollback.rollback();
        } finally { rollback.release(); }
        assert.equal(await count(), 2, 'Rolled-back flag and event disappear together');
        await pool.query('UPDATE pack SET leaderboard_enabled=0,is_recommended=0 WHERE pack_id=42');
        const a = await pool.getConnection(), b = await pool.getConnection();
        try {
            await a.beginTransaction(); await b.beginTransaction();
            await a.query('UPDATE pack SET leaderboard_enabled=1 WHERE pack_id=42');
            let bFinished = false;
            const bUpdate = b.query('UPDATE pack SET is_recommended=1 WHERE pack_id=43').then(() => { bFinished = true; });
            await new Promise(resolve => setTimeout(resolve, 100));
            assert.equal(bFinished, false, 'Sequence lock serializes writers until commit');
            assert.equal(await count(), 3);
            await a.commit(); await bUpdate; await b.commit();
        } finally { await a.rollback(); await b.rollback(); a.release(); b.release(); }
        const rows = await pool.query('SELECT id,pack_id FROM bot_pack_events ORDER BY id');
        assert.deepEqual(rows.map(r => String(r.id)), ['1','2','3','4','5']);
        assert.deepEqual(rows.slice(-2).map(r => r.pack_id), [42,43]);
        sequelize = new Sequelize(name, config.user, config.password, { dialect: 'mariadb', host: config.host, port: config.port, logging: false });
        const res = { status(n) { this.code = n; return this; }, json(body) { this.body = body; return this; } };
        await createReader(sequelize)({ query: { after: '0', limit: '2' } }, res);
        assert.equal(res.code, 200); assert.equal(res.body.cursor, '2'); assert.equal(res.body.has_more, true);
        assert.equal(res.body.data[1].recommended, true);
    } finally {
        if (sequelize) await sequelize.close();
        if (pool) await pool.end();
        await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
        await admin.end();
    }
});

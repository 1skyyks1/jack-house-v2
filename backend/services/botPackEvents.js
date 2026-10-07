const crypto = require('node:crypto');

function authorize(req, res, next) {
    const expected = process.env.JACKHOUSE_BOT_EVENT_TOKEN;
    if (!expected || expected.length < 32) return res.status(503).json({ message: 'Bot events disabled' });
    const actual = String(req.headers.authorization || '');
    const digest = value => crypto.createHash('sha256').update(value).digest();
    if (!crypto.timingSafeEqual(digest(actual), digest(`Bearer ${expected}`))) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    return next();
}

function createReader(sequelize) {
    return async (req, res) => {
        const latest = req.query.latest === '1';
        const after = String(req.query.after ?? '0');
        const limit = Number(req.query.limit ?? 100);
        if (!/^\d{1,20}$/.test(after) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
            return res.status(400).json({ message: 'Invalid cursor or limit' });
        }
        try {
            const output = await sequelize.transaction({ isolationLevel: 'REPEATABLE READ', readOnly: true }, async transaction => {
                const options = { type: 'SELECT', transaction, logging: false };
                const [head] = await sequelize.query('SELECT CAST(value AS CHAR) AS cursor FROM bot_pack_event_sequence WHERE singleton=1', options);
                if (!head) throw new Error('Migration missing');
                if (latest) return { data: [], cursor: String(head.cursor), has_more: false };
                if (BigInt(after) > BigInt(head.cursor)) return { reset_required: true };
                const rows = await sequelize.query(
                    `SELECT CAST(id AS CHAR) AS id,pack_id,old_featured,featured,old_recommended,recommended,snapshot
                     FROM bot_pack_events WHERE id>:after AND id<=:head ORDER BY id ASC LIMIT :limit`,
                    { ...options, replacements: { after, head: head.cursor, limit: limit + 1 } });
                const selected = rows.slice(0, limit);
                return {
                    data: selected.map(row => ({ id: String(row.id), pack_id: row.pack_id,
                        old_featured: Boolean(Number(row.old_featured)), featured: Boolean(Number(row.featured)),
                        old_recommended: Boolean(Number(row.old_recommended)), recommended: Boolean(Number(row.recommended)),
                        pack: typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot })),
                    cursor: selected.length ? String(selected[selected.length - 1].id) : String(head.cursor),
                    has_more: rows.length > limit,
                };
            });
            if (output.reset_required) return res.status(409).json({ message: 'Event cursor exceeds server watermark' });
            return res.status(200).json(output);
        } catch {
            return res.status(503).json({ message: 'Bot events temporarily unavailable' });
        }
    };
}

module.exports = { authorize, createReader };

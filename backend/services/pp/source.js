const { createHash } = require('node:crypto');
const fetch = require('node-fetch');
const { inspectSource } = require('./calculator');
const { IneligibleScore } = require('./score');
const { select, write } = require('./repository');

let lastDownloadAt = 0;
async function getSource(attempt) {
    const requested = attempt.source_checksum || attempt.reported_checksum;
    const existing = await select(requested
        ? 'SELECT * FROM pp_beatmap_source WHERE checksum = :checksum AND beatmap_id = :beatmapId LIMIT 1'
        : `SELECT * FROM pp_beatmap_source WHERE beatmap_id = :beatmapId
           AND fetched_at >= DATE_SUB(NOW(), INTERVAL 1 DAY) ORDER BY fetched_at DESC LIMIT 1`,
    { checksum: requested || '', beatmapId: Number(attempt.beatmap_id) });
    if (existing.length) return existing[0];
    const delay = Math.max(0, 1100 - (Date.now() - lastDownloadAt));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    lastDownloadAt = Date.now();
    const response = await fetch(`https://osu.ppy.sh/osu/${Number(attempt.beatmap_id)}`, {
        timeout: 20000, size: 8 * 1024 * 1024,
    });
    if (!response.ok) throw new Error('beatmap_download_failed');
    const buffer = await response.buffer();
    const checksum = createHash('md5').update(buffer).digest('hex');
    if (requested && checksum !== requested) throw new IneligibleScore('beatmap_version_unavailable');
    const content = buffer.toString('utf8');
    const fileId = content.match(/^BeatmapID\s*:\s*(\d+)\s*$/m);
    if (fileId && Number(fileId[1]) !== Number(attempt.beatmap_id)) throw new IneligibleScore('beatmap_id_mismatch');
    const info = inspectSource(content);
    await write(`INSERT INTO pp_beatmap_source (checksum, beatmap_id, content, object_count, hold_count)
        VALUES (:checksum, :beatmapId, :content, :object_count, :hold_count)
        ON DUPLICATE KEY UPDATE fetched_at = CURRENT_TIMESTAMP`,
    { checksum, beatmapId: Number(attempt.beatmap_id), content, ...info });
    return { checksum, content, ...info };
}

module.exports = { getSource };

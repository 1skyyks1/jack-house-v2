const express = require('express');
const { gzipSync } = require('node:zlib');
const shared = require('../services/omaSharedStore');
const service = require('../services/omaScoreSyncService');
const router = express.Router();
const wrap = fn => async (req, res, next) => {
    try { await fn(req, res); }
    catch (err) {
        if (err.status === 429 || err.status === 503) res.set('Retry-After', '15');
        if (!err.status) console.error('OMA request failed:', err.message);
        res.status(err.status || 503).json({ code: err.status ? err.code || 'BUSY' : 'SERVICE_UNAVAILABLE' });
    }
};
router.use(async (req, res, next) => {
    try {
        await shared.budget('ip:' + req.ip, 120, 60000);
        // No browser session is accepted or used by this narrowly scoped public API.
        if (req.headers.cookie || req.headers.authorization) throw shared.error('CREDENTIALS_NOT_ACCEPTED', 400);
        next();
    } catch (err) { res.set('Retry-After', '15').status(err.status || 503).json({ code: err.code || 'BUSY' }); }
});
router.use(express.json({ limit: '8kb', strict: true }));
router.get('/account/:osuId', wrap(async (req, res) => {
    if (!/^[1-9]\d{0,9}$/.test(req.params.osuId)) throw shared.error('INVALID_OSU_ID', 400);
    res.set('Cache-Control', 'no-store').json({ exists: !!(await service.account(Number(req.params.osuId))) });
}));
router.get('/index', wrap(async (req, res) => {
    const data = await service.index(), etag = '"' + data.version + '"';
    res.set({ ETag: etag, 'Cache-Control': 'public, max-age=0, must-revalidate', Vary: 'Accept-Encoding' });
    if (req.get('If-None-Match')?.split(',').map(x => x.trim().replace(/^W\//, '')).includes(etag)) return res.status(304).end();
    const body = Buffer.from(JSON.stringify(data));
    res.type('json');
    if (/\bgzip\b(?!\s*;\s*q=0(?:\D|$))/.test(req.get('Accept-Encoding') || '')) {
        res.set('Content-Encoding', 'gzip').send(gzipSync(body));
    } else res.send(body);
}));
router.post('/sync', wrap(async (req, res) => res.set('Cache-Control', 'no-store').json(await service.request(req.body))));
router.use((err, req, res, next) => {
    if (err.type === 'entity.too.large' || err.type === 'entity.parse.failed') return res.status(err.status || 400).json({ code: 'INVALID_REQUEST' });
    next(err);
});
module.exports = router;

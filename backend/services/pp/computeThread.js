const { parentPort } = require('node:worker_threads');
const { calculatePP, DifficultyCache } = require('./calculator');
const cache = new DifficultyCache();

parentPort.on('message', ({ id, content, attempt }) => {
    try { parentPort.postMessage({ id, result: calculatePP(content, attempt, cache) }); }
    catch (error) { parentPort.postMessage({ id, error: error.reason || 'calculation_failed', excluded: Boolean(error.reason) }); }
});

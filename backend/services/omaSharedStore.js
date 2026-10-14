const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');

const hash = value => createHash('sha256').update(String(value)).digest('hex');
const folder = process.env.OMA_SHARED_CACHE_DIR || path.join(os.tmpdir(), 'jackhouse-oma-' + hash(path.resolve(__dirname, '..')).slice(0, 20));
const now = () => Date.now();
const error = (code, status = 503) => Object.assign(new Error(code), { code, status });

// Windows can briefly deny a replacement while another process is reading the
// old file. Retry that filesystem operation, preserving atomic replacement.
function fileOperation(fn) {
    for (let attempt = 0; ; attempt++) {
        try { return fn(); }
        catch (err) {
            if (!['EPERM', 'EACCES', 'EBUSY'].includes(err.code) || attempt >= 40) throw err;
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
        }
    }
}
async function withMetadata(fn) {
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    const identity = `lock-${process.pid}-${randomBytes(12).toString('hex')}.json`;
    const lock = path.join(folder, identity), temp = path.join(folder, process.pid + '-' + randomBytes(12).toString('hex') + '.tmp');
    const participants = () => fs.readdirSync(folder).flatMap(name => {
        const match = /^lock-([1-9]\d*)-([a-f0-9]{24})\.json$/.exec(name);
        if (!match) return [];
        const file = path.join(folder, name);
        try { process.kill(Number(match[1]), 0); }
        catch (err) {
            if (err.code === 'ESRCH') { try { fileOperation(() => fs.unlinkSync(file)); } catch (e) { if (e.code !== 'ENOENT') throw e; } return []; }
            if (err.code !== 'EPERM') throw err;
        }
        try { return [{ name, ...JSON.parse(fs.readFileSync(file, 'utf8')) }]; }
        catch (err) { return err.code === 'ENOENT' ? [] : [{ name, choosing: true }]; }
    });
    fs.writeFileSync(lock, JSON.stringify({ choosing: true }), { flag: 'wx', mode: 0o600 });
    try {
        const number = 1 + Math.max(0, ...participants().map(p => Number(p.number) || 0));
        fs.writeFileSync(temp, JSON.stringify({ choosing: false, number }), { flag: 'wx', mode: 0o600 });
        fileOperation(() => fs.renameSync(temp, lock));
        const deadline = now() + 2000;
        while (participants().some(p => p.name !== identity && (p.choosing || p.number < number || (p.number === number && p.name < identity)))) {
            if (now() >= deadline) throw error('BUSY');
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        const entries = read('pending') || [];
        if (!Array.isArray(entries) || entries.length > 512 || Buffer.byteLength(JSON.stringify(entries)) > 1024 * 1024) throw error('INVALID_METADATA');
        const result = fn(entries);
        if (result?.then) throw error('ASYNC_CRITICAL_SECTION');
        if (entries.length > 512 || Buffer.byteLength(JSON.stringify(entries)) > 1024 * 1024) throw error('METADATA_TOO_LARGE');
        write('pending', entries);
        return result;
    } finally {
        try { fileOperation(() => fs.unlinkSync(temp)); } catch (err) { if (err.code !== 'ENOENT') throw err; }
        finally { fileOperation(() => fs.unlinkSync(lock)); }
    }
}

// Reuse the same-host bakery lock. Critical sections only mutate small metadata;
// never hold the file lock during an API call or database transaction.
async function mutate(fn) {
    return withMetadata(entries => {
        const time = now();
        for (let i = entries.length - 1; i >= 0; i--) {
            const entry = entries[i];
            if (entry.kind === 'claim') {
                try { process.kill(entry.pid, 0); }
                catch (err) { if (err.code === 'ESRCH') { entries.splice(i, 1); continue; } }
                // A live but stalled worker is never overlapped. Its request must
                // unwind, or PM2 must terminate it; expiry isn't mutual exclusion.
            } else if (entry.expiresAt <= time) entries.splice(i, 1);
        }
        return fn(entries, time);
    });
}
async function budget(key, maximum, windowMs) {
    return mutate((entries, time) => {
        const id = 'rate:' + hash(key);
        let entry = entries.find(e => e.id === id);
        if (!entry) {
            if (entries.length >= 500) throw error('BUSY', 429);
            entries.push(entry = { id, kind: 'rate', count: 0, expiresAt: time + windowMs });
        }
        if (++entry.count > maximum) throw error('RATE_LIMITED', 429);
    });
}
async function claim(key) {
    const owner = randomBytes(16).toString('hex');
    await mutate(entries => {
        const id = 'claim:' + hash(key);
        if (entries.some(e => e.id === id) || (key !== 'index' && entries.filter(e => e.kind === 'claim' && e.id !== 'claim:' + hash('index')).length >= 4)) throw error('BUSY', 429);
        if (entries.length >= 500) throw error('BUSY', 429);
        entries.push({ id, kind: 'claim', owner, pid: process.pid, expiresAt: now() + 120000 });
    });
    return () => mutate(entries => {
        const i = entries.findIndex(e => e.owner === owner);
        if (i >= 0) entries.splice(i, 1);
    });
}
async function receipts(keys, results) {
    return mutate((entries, time) => {
        const found = keys.map(key => entries.find(e => e.id === 'event:' + hash(key))?.result);
        if (results) for (let i = 0; i < keys.length; i++) {
            if (!results[i] || results[i].status === 'retry' || found[i]) continue;
            // Evict oldest receipts, never rates/claims, to keep the shared cache bounded.
            if (entries.length >= 490) {
                const oldest = entries.findIndex(e => e.kind === 'event');
                if (oldest >= 0) entries.splice(oldest, 1); else continue;
            }
            entries.push({ id: 'event:' + hash(keys[i]), kind: 'event', result: results[i], expiresAt: time + 1800000 });
        }
        return found;
    });
}
function read(name) {
    try {
        const file = path.join(folder, name + '.json');
        if (fs.statSync(file).size > 16 * 1024 * 1024) throw error('CACHE_TOO_LARGE');
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) { if (err.code === 'ENOENT' || (name !== 'pending' && err instanceof SyntaxError)) return null; throw err; }
}
function write(name, data) {
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    const file = path.join(folder, name + '.json');
    const temp = file + '.' + process.pid + '.' + randomBytes(8).toString('hex') + '.tmp';
    try { fs.writeFileSync(temp, JSON.stringify(data), { flag: 'wx', mode: 0o600 }); fileOperation(() => fs.renameSync(temp, file)); }
    finally { try { fs.unlinkSync(temp); } catch (err) { if (err.code !== 'ENOENT') throw err; } }
}
module.exports = { budget, claim, receipts, read, write, hash, error };

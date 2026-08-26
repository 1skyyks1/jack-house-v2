const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const osu = require('osu-api-v2-js');

const EXPECTED_API_VERSION = '20260105';

const listen = (server) => new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});

test('osu api wrapper keeps the protocol version and methods used by the backend', () => {
    const api = new osu.API({ set_token_on_creation: false });

    assert.equal(api.headers['x-api-version'], EXPECTED_API_VERSION);
    assert.equal(typeof osu.API.createAsync, 'function');
    assert.equal(typeof osu.generateAuthorizationURL, 'function');
    assert.equal(typeof api.getResourceOwner, 'function');
    assert.equal(typeof api.getUser, 'function');
    assert.equal(typeof api.getUserScores, 'function');
    assert.equal(typeof api.getBeatmap, 'function');
    assert.equal(typeof api.getBeatmapset, 'function');
    assert.equal(typeof api.getMatch, 'function');
    assert.equal(osu.Ruleset.mania, 3);
});

test('osu api wrapper sends the expected paths, score filters, auth and protocol header', async (t) => {
    const requests = [];
    const server = http.createServer((req, res) => {
        requests.push({
            authorization: req.headers.authorization,
            apiVersion: req.headers['x-api-version'],
            url: new URL(req.url, 'http://localhost'),
        });
        res.setHeader('Content-Type', 'application/json');

        if (req.url.startsWith('/users/123/scores/recent')) {
            return res.end(JSON.stringify([{ id: 1, beatmap_id: 789, legacy_total_score: 950000 }]));
        }
        if (req.url.startsWith('/matches/321')) {
            return res.end(JSON.stringify({ match: { id: 321 }, events: [] }));
        }
        return res.end(JSON.stringify({ id: 1 }));
    });
    t.after(() => new Promise((resolve) => server.close(resolve)));

    const port = await listen(server);
    const api = new osu.API({
        access_token: 'fixture-token',
        route_api: [],
        server: `http://127.0.0.1:${port}`,
        set_token_on_creation: false,
    });

    await api.getResourceOwner();
    await api.getUser(123);
    const scores = await api.getUserScores(
        123,
        'recent',
        osu.Ruleset.mania,
        { lazer: true, fails: false },
        { limit: 50 }
    );
    await api.getBeatmap(789);
    await api.getBeatmapset(456);
    await api.getMatch(321, { after: 10, limit: 101 });

    assert.equal(scores[0].legacy_total_score, 950000);
    assert.deepEqual(requests.map(({ url }) => url.pathname), [
        '/me',
        '/users/123/',
        '/users/123/scores/recent',
        '/beatmaps/789',
        '/beatmapsets/456',
        '/matches/321',
    ]);
    assert.ok(requests.every(({ authorization }) => authorization === 'Bearer fixture-token'));
    assert.ok(requests.every(({ apiVersion }) => apiVersion === EXPECTED_API_VERSION));

    const scoreQuery = requests[2].url.searchParams;
    assert.equal(scoreQuery.get('mode'), 'mania');
    assert.equal(scoreQuery.get('limit'), '50');
    assert.equal(scoreQuery.get('legacy_only'), '0');
    assert.equal(scoreQuery.get('include_fails'), '0');

    const matchQuery = requests[5].url.searchParams;
    assert.equal(matchQuery.get('after'), '10');
    assert.equal(matchQuery.get('limit'), '101');
});

test('osu authorization URL keeps the public and identify scopes used by login', () => {
    const url = new URL(osu.generateAuthorizationURL(
        123,
        'https://jackhouse.test/oauth/callback',
        ['public', 'identify']
    ));

    assert.equal(url.origin, 'https://osu.ppy.sh');
    assert.equal(url.pathname, '/oauth/authorize');
    assert.equal(url.searchParams.get('client_id'), '123');
    assert.equal(url.searchParams.get('redirect_uri'), 'https://jackhouse.test/oauth/callback');
    assert.equal(url.searchParams.get('scope'), 'public identify');
    assert.equal(url.searchParams.get('response_type'), 'code');
});

test('osu authorization-code login keeps the createAsync argument and token contract', async (t) => {
    const requests = [];
    const tokenPayload = Buffer.from(JSON.stringify({
        scopes: ['public', 'identify'],
        sub: '123',
    })).toString('base64url');
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            requests.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : null });
            res.setHeader('Content-Type', 'application/json');
            if (req.url.startsWith('/oauth/token')) {
                return res.end(JSON.stringify({
                    access_token: `header.${tokenPayload}.signature`,
                    expires_in: 3600,
                    token_type: 'Bearer',
                }));
            }
            return res.end(JSON.stringify({ id: 123, username: 'fixture-user' }));
        });
    });
    t.after(() => new Promise((resolve) => server.close(resolve)));

    const port = await listen(server);
    const api = await osu.API.createAsync(
        456,
        'fixture-secret',
        { code: 'fixture-code', redirect_uri: 'https://jackhouse.test/oauth/callback' },
        {
            route_api: [],
            route_token: ['oauth', 'token'],
            server: `http://127.0.0.1:${port}`,
            set_token_on_expires: false,
        }
    );
    const me = await api.getResourceOwner();

    assert.equal(api.user, 123);
    assert.deepEqual(api.scopes, ['public', 'identify']);
    assert.equal(me.username, 'fixture-user');
    assert.deepEqual(requests, [
        {
            method: 'POST',
            url: '/oauth/token/',
            body: {
                grant_type: 'authorization_code',
                client_id: 456,
                client_secret: 'fixture-secret',
                redirect_uri: 'https://jackhouse.test/oauth/callback',
                code: 'fixture-code',
            },
        },
        { method: 'GET', url: '/me', body: null },
    ]);
});

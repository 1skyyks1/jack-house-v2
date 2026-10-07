const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const sharp = require('sharp');

// Avoid retaining file handles when replacing temporary images on Windows.
sharp.cache(false);

const sequelize = require('../config/db');
const { Tournament, TTeam } = require('../models/tournament');
const permissionService = require('../services/permissionService');
const storage = require('../services/storage');
const auditService = require('../services/tournament/auditService');
const tournamentService = require('../services/tournament/tournamentService');
const teamService = require('../services/tournament/teamService');

const configureUpload = (t, overrides = {}) => {
    const values = {
        RICHTEXT_STORAGE_PROVIDER: 'github',
        RICHTEXT_UPLOAD_PROVIDER: 'pngurl',
        TOURNAMENT_TEAM_AVATAR_STORAGE_SCOPE: undefined,
        TOURNAMENT_TEAM_AVATAR_STORAGE_PROVIDER: undefined,
        TOURNAMENT_TEAM_AVATAR_UPLOAD_PROVIDER: undefined,
        TOURNAMENT_TEAM_AVATAR_STORAGE_BUCKET: undefined,
        IMAGE_OPTIMIZE_ENABLED: 'true',
        IMAGE_OPTIMIZE_CONVERT_WEBP: 'true',
        ...overrides,
    };
    for (const [key, value] of Object.entries(values)) {
        const original = process.env[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
        t.after(() => {
            if (original === undefined) delete process.env[key];
            else process.env[key] = original;
        });
    }
};

const createFile = async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tournament-avatar-test-'));
    const filePath = path.join(directory, 'flag.png');
    t.after(() => {
        fs.rmSync(filePath, { force: true });
        fs.rmdirSync(directory);
    });
    await sharp({ create: { width: 8, height: 8, channels: 4, background: '#2478ff' } })
        .png().toFile(filePath);
    return { path: filePath, filename: 'flag.png', mimetype: 'image/png', size: fs.statSync(filePath).size };
};

const mockPersistence = (t) => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const tournament = { id: 2, update: async (values) => Object.assign(tournament, values) };
    const team = { id: 3, t_id: 2, captain_id: 1, players: [], update: async (values) => Object.assign(team, values) };
    t.mock.method(Tournament, 'findByPk', async () => tournament);
    t.mock.method(TTeam, 'findOne', async () => team);
    t.mock.method(permissionService, 'getUserPermissions', async () => ({ permissionSet: new Set(['tournaments']) }));
    t.mock.method(permissionService, 'hasPermission', () => true);
    t.mock.method(sequelize, 'transaction', async (callback) => callback(transaction));
    const audit = t.mock.method(auditService, 'writeAuditLog', async () => null);
    return { tournament, team, audit, transaction };
};

for (const kind of ['default', 'team']) {
    test(`${kind} flag uses the new upload provider and preserves PNG for content review`, async (t) => {
        configureUpload(t);
        const file = await createFile(t);
        const { tournament, team, audit, transaction } = mockPersistence(t);
        const url = 'https://images.example.test/flag.png';
        let captured;
        t.mock.method(storage, 'uploadFile', async (scope, options) => {
            captured = { scope, options };
            assert.equal(options.provider, 'pngurl', 'must not upload using legacy GitHub storage');
            assert.equal(options.mimeType, 'image/png');
            assert.equal((await sharp(options.filePath).metadata()).format, 'png');
            return { provider: options.provider, publicUrl: url, objectKey: 'flag-key', mimeType: options.mimeType };
        });

        const result = kind === 'default'
            ? await tournamentService.uploadDefaultTeamAvatar(2, file, 1)
            : await teamService.uploadTeamAvatar(2, 1, 3, file);

        assert.equal(result, kind === 'default' ? tournament : team);
        assert.equal(kind === 'default' ? tournament.default_team_avatar : team.avatar, url);
        assert.equal(captured.scope, 'RICHTEXT');
        assert.equal(captured.options.bucket, 'tournament-team-avatars');
        assert.match(captured.options.objectName, kind === 'default'
            ? /^tournaments\/2\/default-team-avatar\/[a-f0-9]+\.png$/
            : /^tournaments\/2\/teams\/3\/[a-f0-9]+\.png$/);
        assert.equal(audit.mock.calls[0].arguments[0].new_value.storage_provider, 'pngurl');
        assert.equal(audit.mock.calls[0].arguments[1].transaction, transaction);
        assert.equal(fs.existsSync(file.path), false);
    });
}

test('failed default flag uploads leave the saved URL unchanged and clean up the temporary file', async (t) => {
    configureUpload(t);
    const file = await createFile(t);
    const { tournament, audit } = mockPersistence(t);
    tournament.default_team_avatar = 'https://images.example.test/previous.png';
    t.mock.method(storage, 'uploadFile', async () => { throw new Error('PNGURL rejected image'); });

    await assert.rejects(tournamentService.uploadDefaultTeamAvatar(2, file, 1), /PNGURL rejected image/);
    assert.equal(tournament.default_team_avatar, 'https://images.example.test/previous.png');
    assert.equal(audit.mock.callCount(), 0);
    assert.equal(fs.existsSync(file.path), false);
});

for (const provider of ['pngurl', 'github']) {
    test(`dedicated ${provider} configuration controls flag uploads and image conversion`, async (t) => {
        configureUpload(t, {
            RICHTEXT_UPLOAD_PROVIDER: 'github',
            TOURNAMENT_TEAM_AVATAR_STORAGE_PROVIDER: 'github',
            // Also verify compatibility with the existing dedicated storage setting.
            TOURNAMENT_TEAM_AVATAR_UPLOAD_PROVIDER: provider === 'pngurl' ? provider : undefined,
            TOURNAMENT_TEAM_AVATAR_STORAGE_SCOPE: 'TOURNAMENT_TEAM_AVATAR',
            TOURNAMENT_TEAM_AVATAR_STORAGE_BUCKET: 'custom-team-flags',
        });
        const file = await createFile(t);
        const { tournament } = mockPersistence(t);
        const format = provider === 'pngurl' ? 'png' : 'webp';
        t.mock.method(storage, 'uploadFile', async (scope, options) => {
            assert.equal(scope, 'TOURNAMENT_TEAM_AVATAR');
            assert.equal(options.bucket, 'custom-team-flags');
            assert.equal(options.provider, provider);
            assert.equal(options.mimeType, `image/${format}`);
            assert.equal((await sharp(options.filePath).metadata()).format, format);
            return { provider, publicUrl: `https://images.example.test/flag.${format}`, objectKey: 'flag', mimeType: options.mimeType };
        });

        await tournamentService.uploadDefaultTeamAvatar(2, file, 1);
        assert.equal(tournament.default_team_avatar, `https://images.example.test/flag.${format}`);
        assert.equal(fs.existsSync(file.path), false);
    });
}

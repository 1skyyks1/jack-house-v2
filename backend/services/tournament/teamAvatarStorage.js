const storage = require('../storage');

// New uploads follow the upload configuration; RICHTEXT_STORAGE_PROVIDER may
// still point to GitHub for historical images.
const getTeamAvatarUploadProvider = () => String(
    process.env.TOURNAMENT_TEAM_AVATAR_UPLOAD_PROVIDER
    || process.env.TOURNAMENT_TEAM_AVATAR_STORAGE_PROVIDER
    || process.env.RICHTEXT_UPLOAD_PROVIDER
    || 'pngurl'
).trim().toLowerCase();

const getTeamAvatarStorageScope = () => process.env.TOURNAMENT_TEAM_AVATAR_STORAGE_SCOPE
    || (process.env.TOURNAMENT_TEAM_AVATAR_UPLOAD_PROVIDER || process.env.TOURNAMENT_TEAM_AVATAR_STORAGE_PROVIDER
        ? 'TOURNAMENT_TEAM_AVATAR' : 'RICHTEXT');

const uploadTeamAvatarFile = (options) => storage.uploadFile(getTeamAvatarStorageScope(), {
    ...options,
    provider: getTeamAvatarUploadProvider(),
    bucket: process.env.TOURNAMENT_TEAM_AVATAR_STORAGE_BUCKET || 'tournament-team-avatars',
});

module.exports = { getTeamAvatarUploadProvider, uploadTeamAvatarFile };

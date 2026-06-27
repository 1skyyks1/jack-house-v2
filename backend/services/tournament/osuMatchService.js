const osu = require('osu-api-v2-js');

const CLIENT_ID = Number(process.env.OSU_CLIENT_ID);
const CLIENT_SECRET = process.env.OSU_CLIENT_SECRET;
const MATCH_EVENT_PAGE_SIZE = 101;
const MAX_MATCH_EVENT_PAGES = 100;

const createApi = async () => {
    return osu.API.createAsync(CLIENT_ID, CLIENT_SECRET);
};

const getCompleteMatch = async (mpId) => {
    const api = await createApi();
    let match = null;
    let after = undefined;
    const eventsById = new Map();

    for (let page = 0; page < MAX_MATCH_EVENT_PAGES; page++) {
        const response = await api.getMatch(mpId, { after, limit: MATCH_EVENT_PAGE_SIZE });
        if (!response || !Array.isArray(response.events)) {
            throw new Error('无法获取比赛数据');
        }

        match = match || response;
        const previousSize = eventsById.size;
        for (const event of response.events) {
            if (event?.id !== undefined && event?.id !== null) {
                eventsById.set(Number(event.id), event);
            }
        }

        if (response.events.length < MATCH_EVENT_PAGE_SIZE || eventsById.size === previousSize) {
            break;
        }

        const latestEvent = response.events[response.events.length - 1];
        after = latestEvent?.id;
        if (!after) break;
    }

    if (!match) {
        throw new Error('无法获取比赛数据');
    }

    return {
        ...match,
        events: Array.from(eventsById.values()).sort((a, b) => Number(a.id) - Number(b.id))
    };
};

const getScoreValue = (score) => {
    return Number(score?.legacy_total_score || score?.total_score || score?.score || 0);
};

const getGameId = (game, event) => {
    return game?.id || game?.game_id || event?.id || null;
};

const getGameBeatmapId = (game) => {
    return Number(game?.beatmap_id || game?.beatmap?.id || 0);
};

const getGameScores = (game) => {
    if (Array.isArray(game?.scores)) return game.scores;
    if (Array.isArray(game?.score)) return game.score;
    return [];
};

const getGameEvents = (match) => {
    return Array.isArray(match?.events) ? match.events.filter(event => event?.game) : [];
};

module.exports = {
    createApi,
    getCompleteMatch,
    getGameBeatmapId,
    getGameEvents,
    getGameId,
    getGameScores,
    getScoreValue
};

function buildImportedStages(beatmaps) {
    if (!Array.isArray(beatmaps)) return [];

    return beatmaps
        .filter((beatmap) => Number.isSafeInteger(Number(beatmap?.id)) && Number(beatmap.id) > 0 && String(beatmap?.version || '').trim())
        .map((beatmap) => ({
            map_id: Number(beatmap.id),
            title: String(beatmap.version).trim(),
            artist: '',
            mapper: '',
        }));
}

module.exports = { buildImportedStages };

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildImportedStages } = require('../utils/eventStageImport');

test('beatmapset import creates one blank-credit stage draft per valid difficulty', () => {
    assert.deepEqual(buildImportedStages([
        { id: 101, version: 'Normal' },
        { id: 102, version: " Mapper's Insane " },
        { id: null, version: 'Invalid id' },
        { id: 103, version: '   ' },
    ]), [
        { map_id: 101, title: 'Normal', artist: '', mapper: '' },
        { map_id: 102, title: "Mapper's Insane", artist: '', mapper: '' },
    ]);
});

test('beatmapset import tolerates a missing beatmap list', () => {
    assert.deepEqual(buildImportedStages(undefined), []);
});

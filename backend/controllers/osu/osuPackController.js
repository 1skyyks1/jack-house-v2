const { User, Pack, PackMap } = require('../../models/index');
const sequelize = require('../../config/db')
const osu = require("osu-api-v2-js");

const CLIENT_ID = Number(process.env.OSU_CLIENT_ID);
const CLIENT_SECRET = process.env.OSU_CLIENT_SECRET;

exports.beatmapsetDetail = async (req, res) => {
    const beatmapsetId = Number(req.params.bid);
    if (!beatmapsetId) {
        return res.status(400).json({ message: req.t('pack.createFailed') });
    }
    try {
        const existing = await Pack.findOne({
            where: { osu_bid: beatmapsetId }
        })
        if(existing) {
            return res.status(409).json({ message: req.t('pack.alreadyExists') });
        }
        const api = await osu.API.createAsync(CLIENT_ID, CLIENT_SECRET);
        const beatmapset = await api.getBeatmapset(beatmapsetId);
        res.status(200).json({
            artist: beatmapset.artist,
            creator: beatmapset.creator,
            title: beatmapset.title,
            cover: beatmapset.covers["cover@2x"],
        })
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
}

exports.packFromOsu = async (req, res) => {
    const beatmapsetId = Number(req.params.bid);
    const { tags, type } = req.body;
    const user_id = req.user.user_id;
    if (!beatmapsetId || !Array.isArray(tags)) {
        return res.status(400).json({ message: req.t('pack.createFailed') });
    }
    try {
        const existing = await Pack.findOne({
            where: { osu_bid: beatmapsetId }
        })
        if(existing) {
            return res.status(409).json({ message: req.t('pack.alreadyExists') });
        }
        const api = await osu.API.createAsync(CLIENT_ID, CLIENT_SECRET);
        const beatmapset = await api.getBeatmapset(beatmapsetId);
        const t = await sequelize.transaction();
        try {
            const pack = await Pack.create({
                artist: beatmapset.artist,
                artist_unicode: beatmapset.artist_unicode,
                title: beatmapset.title,
                title_unicode: beatmapset.title_unicode,
                creator: beatmapset.creator,
                user_id: user_id,
                osu_bid: beatmapset.id,
                type: type,
                status: beatmapset.ranked,
                last_updated: beatmapset.last_updated,
                submitted_date: beatmapset.submitted_date,
                description: beatmapset.description.description,
                cover_id: parseInt(beatmapset.covers.cover.split('?')[1], 10)
            }, { transaction: t });
            await pack.addTags(tags, { transaction: t });
            const packMapData = beatmapset.beatmaps.map(beatmap => {
                return {
                    pack_id: pack.pack_id,
                    rating: beatmap.difficulty_rating,
                    length: beatmap.total_length,
                    real_length: beatmap.hit_length,
                    version: beatmap.version,
                    od: beatmap.accuracy,
                    hp: beatmap.drain,
                    bpm: beatmap.bpm,
                    key_count: beatmap.count_circles,
                    ln_count: beatmap.count_sliders,
                }
            })
            await PackMap.bulkCreate(packMapData, { transaction: t });
            await t.commit();
            res.status(201).json({ message: req.t('pack.createSuccess') });
        } catch (innerErr) {
            await t.rollback();
            throw innerErr;
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
}

exports.updatePackFromOsu = async (req, res) => {
    const beatmapsetId = Number(req.params.bid);
    if (!beatmapsetId) {
        return res.status(400).json({ message: req.t('pack.updateFailed') });
    }

    try {
        const existingPack = await Pack.findOne({
            where: { osu_bid: beatmapsetId }
        });

        if (!existingPack) {
            return res.status(404).json({ message: req.t('pack.notFound') });
        }

        if (
            existingPack.updated_time &&
            new Date(existingPack.updated_time).toDateString() === new Date().toDateString()
        ) {
            return res.status(429).json({ message: req.t('pack.updateTooFrequent') });
        }

        const api = await osu.API.createAsync(CLIENT_ID, CLIENT_SECRET);
        const beatmapset = await api.getBeatmapset(beatmapsetId);

        const t = await sequelize.transaction();
        try {
            await existingPack.update({
                artist: beatmapset.artist,
                artist_unicode: beatmapset.artist_unicode,
                title: beatmapset.title,
                title_unicode: beatmapset.title_unicode,
                creator: beatmapset.creator,
                status: beatmapset.ranked,
                last_updated: beatmapset.last_updated,
                submitted_date: beatmapset.submitted_date,
                description: beatmapset.description.description,
                cover_id: parseInt(beatmapset.covers.cover.split('?')[1], 10)
            }, { transaction: t });

            await PackMap.destroy({
                where: { pack_id: existingPack.pack_id },
                transaction: t
            });

            const packMapData = beatmapset.beatmaps.map(beatmap => ({
                pack_id: existingPack.pack_id,
                rating: beatmap.difficulty_rating,
                length: beatmap.total_length,
                real_length: beatmap.hit_length,
                version: beatmap.version,
                od: beatmap.accuracy,
                hp: beatmap.drain,
                bpm: beatmap.bpm,
                key_count: beatmap.count_circles,
                ln_count: beatmap.count_sliders,
            }));
            await PackMap.bulkCreate(packMapData, { transaction: t });

            await t.commit();

            res.status(200).json({
                message: req.t('pack.updateSuccess'),
                pack_id: existingPack.pack_id
            });
        } catch (innerErr) {
            await t.rollback();
            throw innerErr;
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
};

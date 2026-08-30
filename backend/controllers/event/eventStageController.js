const { User, Event, EventStage, EventScore, PackMap } = require('../../models/index');
const sequelize = require('../../config/db')
const { Op } = require('sequelize');
const fs = require('fs')
const { eventStageBgUpload } = require('../../config/multer')
const { handleUpload } = require('../../middleware/uploadErrorHandler')
const storage = require('../../services/storage')
const { buildContentHashObjectName, hashFile, optimizeImageFile } = require('../../utils/imageOptimizer')
const osu = require('osu-api-v2-js');
const { buildImportedStages } = require('../../utils/eventStageImport');

const EVENT_STAGE_BG_STORAGE_SCOPE = 'EVENT_STAGE_BG';
const getEventStageBgUploadProvider = () => process.env.EVENT_STAGE_BG_UPLOAD_PROVIDER || 'pngurl';
const getEventStageBgObjectName = (stage) => stage.object_key || stage.minio_bg;
const getEventStageBgProvider = (stage) => stage.storage_provider || 'minio';
const getEventStageBgBucket = () => storage.getBucketName(
    EVENT_STAGE_BG_STORAGE_SCOPE,
    ['MINIO_BG_BUCKET'],
    storage.getProviderName(EVENT_STAGE_BG_STORAGE_SCOPE) === 'github' ? 'event-stage-bg' : null
);

const handleEventStageBgUpload = handleUpload(eventStageBgUpload.array('file', 10));

const removeTempFiles = (files = []) => {
    files.forEach((file) => {
        if (file?.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
    });
};

// 读取 beatmapset 的全部原生难度，供前端生成尚未提交的 Stage 草稿。
exports.importBeatmapset = async (req, res) => {
    const beatmapsetId = Number(req.params.beatmapset_id);
    if (!Number.isSafeInteger(beatmapsetId) || beatmapsetId <= 0) {
        return res.status(400).json({ message: req.t('stage.invalidBeatmapsetId') });
    }

    const clientId = Number(process.env.OSU_CLIENT_ID);
    const clientSecret = process.env.OSU_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        return res.status(503).json({ message: req.t('stage.osuUnavailable') });
    }

    try {
        const api = await osu.API.createAsync(clientId, clientSecret);
        const beatmapset = await api.getBeatmapset(beatmapsetId);
        const stages = buildImportedStages(beatmapset?.beatmaps);

        if (stages.length === 0) {
            return res.status(422).json({ message: req.t('stage.beatmapsetNoBeatmaps') });
        }

        return res.status(200).json({ data: stages });
    } catch (error) {
        const status = Number(error?.status ?? error?.response?.status);
        if (status === 404) {
            return res.status(404).json({ message: req.t('stage.beatmapsetNotFound') });
        }
        console.error('Failed to import event stages from osu! beatmapset:', error);
        return res.status(502).json({ message: req.t('stage.beatmapsetImportFailed') });
    }
};

// 获取指定活动的项目
exports.getStages = async (req, res) => {
    const { event_id } = req.params;
    try {
        const rows = await EventStage.findAll({
            where: { event_id },
            order: [['id', 'ASC']],
            attributes: { exclude: ['created_time', 'updated_time'] },
        })

        let results = rows;

        if(rows.length > 0){
            const packMaps = await PackMap.findAll({
                where: { beatmap_id: { [Op.in]: rows.map((row) => row.map_id) } },
                attributes: ['beatmap_id', 'pack_id'],
            });
            const packIdByBeatmapId = new Map(packMaps.map((map) => [Number(map.beatmap_id), map.pack_id]));
            results = await Promise.all(
                rows.map(async (row) => {
                    const url = row.public_url || row.download_url || await storage.getDownloadUrl(EVENT_STAGE_BG_STORAGE_SCOPE, {
                        provider: getEventStageBgProvider(row),
                        bucket: getEventStageBgBucket(),
                        objectName: getEventStageBgObjectName(row),
                    });
                    return {
                        ...row.toJSON(),
                        pack_id: packIdByBeatmapId.get(Number(row.map_id)) ?? null,
                        url
                    }
                })
            )
        }

        const event = await Event.findByPk(event_id, {
            attributes: { exclude: ['created_time', 'updated_time'] },
        });

        res.status(200).json({ event, data: results, total: rows.length });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: req.t('stage.serverError') });
    }
}

// 创建项目
exports.createStage = [
    handleEventStageBgUpload,
    async (req, res) => {
        const { event_id } = req.body;
        const files = req.files;
        let stages;

        try {
            stages = JSON.parse(req.body.stages);
        } catch (error) {
            removeTempFiles(files);
            return res.status(400).json({ message: req.t('stage.missingRequiredFields') });
        }

        if (!event_id || !Array.isArray(stages) || stages.length === 0) {
            // 缺少必传数据
            removeTempFiles(files);
            return res.status(400).json({ message: req.t('stage.missingRequiredFields') });
        }

        if (!files || files.length !== stages.length) {
            // 文件错误
            removeTempFiles(files);
            return res.status(400).json({ message: req.t('stage.fileError') });
        }

        try {
            const uploadProvider = getEventStageBgUploadProvider();
            const stageData = await Promise.all(stages.map(async (stage, index) => {
                const file = files[index];
                const filePath = file.path;
                const fileName = file.filename;
                const optimized = await optimizeImageFile(file, { convertToWebp: uploadProvider !== 'pngurl' });
                const checksum = await hashFile(filePath);
                const objectName = buildContentHashObjectName(checksum, optimized.mimeType, fileName);
                const uploaded = await storage.uploadFile(EVENT_STAGE_BG_STORAGE_SCOPE, {
                    provider: uploadProvider,
                    bucket: getEventStageBgBucket(),
                    objectName,
                    filePath,
                    mimeType: optimized.mimeType,
                    size: optimized.size,
                });

                fs.unlinkSync(filePath);

                return {
                    ...stage,
                    event_id,
                    minio_bg: uploaded.objectName,
                    storage_provider: uploaded.provider,
                    object_key: uploaded.objectKey,
                    public_url: uploaded.publicUrl,
                    download_url: uploaded.downloadUrl,
                    mime_type: uploaded.mimeType,
                    checksum,
                };
            }));
            const createdStages = await EventStage.bulkCreate(stageData);
            res.status(201).json({ message: req.t('stage.createSuccess') });
        } catch (error) {
            removeTempFiles(files);
            console.log(error);
            res.status(500).json({ message: req.t('stage.serverError') });
        }
    }
]

// 修改项目
exports.updateStage = async (req, res) => {
    const allowedFields = ['map_id', 'artist', 'title', 'mapper'];
    const updateData = allowedFields.reduce((result, field) => {
        if (Object.prototype.hasOwnProperty.call(req.body, field) && req.body[field] !== undefined) {
            result[field] = req.body[field];
        }
        return result;
    }, {});
    const { stage_id } = req.params;
    try {
        const originalStage = await EventStage.findByPk(stage_id);
        if (!originalStage) {
            return res.status(404).json({ message: req.t('stage.notFound') });
        }
        await originalStage.update(updateData)
        res.status(200).json({ message: req.t('stage.updateSuccess') });
    } catch (error) {
        res.status(500).json({ message: req.t('stage.serverError') });
    }
}

// 删除项目
exports.deleteStage = async (req, res) => {
    const { stage_id } = req.params;
    try {
        const stage = await EventStage.findByPk(stage_id);
        if (!stage) {
            return res.status(404).json({ message: req.t('stage.notFound') });
        }
        await storage.deleteFile(EVENT_STAGE_BG_STORAGE_SCOPE, {
            provider: getEventStageBgProvider(stage),
            bucket: getEventStageBgBucket(),
            objectName: getEventStageBgObjectName(stage),
        });
        await stage.destroy();
        res.status(200).json({ message: req.t('stage.deleteSuccess') });
    } catch (error) {
        res.status(500).json({ message: req.t('stage.serverError') });
    }
}

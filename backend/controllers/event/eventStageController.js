const { User, Event, EventStage, EventScore } = require('../../models/index');
const sequelize = require('../../config/db')
const { Op } = require('sequelize');
const mc = require('../../config/minio')
const fs = require('fs')
const upload = require('../../config/multer')

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
            results = await Promise.all(
                rows.map(async (row) => {
                    const url = await preSign(row.minio_bg);
                    return {
                        ...row.toJSON(),
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
    upload.imageUpload.array('file', 10),
    async (req, res) => {
        const { event_id } = req.body;
        const stages = JSON.parse(req.body.stages);

        const files = req.files;

        if (!event_id || !Array.isArray(stages) || stages.length === 0) {
            // 缺少必传数据
            return res.status(400).json({ message: req.t('stage.missingRequiredFields') });
        }

        if (!files || files.length !== stages.length) {
            // 文件错误
            return res.status(400).json({ message: req.t('stage.fileError') });
        }

        try {
            const stageData = await Promise.all(stages.map(async (stage, index) => {
                const file = files[index];
                const filePath = file.path;
                const fileName = file.filename;

                await mc.fPutObject(process.env.MINIO_BG_BUCKET, fileName, filePath, {
                    'Content-Type': file.mimetype,
                });

                fs.unlinkSync(filePath);

                return {
                    ...stage,
                    event_id,
                    minio_bg: fileName,
                };
            }));
            const createdStages = await EventStage.bulkCreate(stageData);
            res.status(201).json({ message: req.t('stage.createSuccess') });
        } catch (error) {
            console.log(error);
            res.status(500).json({ message: req.t('stage.serverError') });
        }
    }
]

// 修改项目
exports.updateStage = async (req, res) => {
    const { map_id, artist, title, mapper } = req.body;
    const { stage_id } = req.params;
    try {
        const originalStage = await EventStage.findByPk(stage_id);
        if (!originalStage) {
            return res.status(404).json({ message: req.t('event.notFound') });
        }
        await originalStage.update({ map_id, artist, title, mapper })
        res.status(200).json({ message: req.t('event.updateSuccess') });
    } catch (error) {
        res.status(500).json({ message: req.t('event.serverError') });
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
        await mc.removeObject(process.env.MINIO_BG_BUCKET, stage.minio_bg);
        await stage.destroy();
        res.status(200).json({ message: req.t('stage.deleteSuccess') });
    } catch (error) {
        res.status(500).json({ message: req.t('stage.serverError') });
    }
}

const preSign = async (name) => {
    const expires = 24 * 60 * 60;
    return await mc.presignedUrl('GET', process.env.MINIO_BG_BUCKET, name, expires)
}
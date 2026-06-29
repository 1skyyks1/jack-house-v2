const { User, Event, EventStage, EventScore } = require('../../models/index');
const sequelize = require('../../config/db')
const { Op } = require('sequelize');
const { sanitizeRichTextHtml } = require('../../utils/richTextSanitizer');
const { syncRichTextAssetReferences } = require('../../services/richTextAssetService');

// 获取活动列表，isActive=true筛选出正在进行的
exports.getEvents = async (req, res) => {
    const { page, pageSize, isActive, isClosest } = req.query;
    const active = isActive === 'true';
    const closest = isClosest === 'true';
    try {
        const options = {
            distinct: true,
            order: [['start', 'DESC']],
            include: [
                {
                    model: EventStage,
                    as: 'stage',
                    attributes: ['id', 'map_id', 'artist', 'title', 'mapper'],
                }
            ]
        }
        let limit, offset;
        if (page && pageSize) {
            limit = parseInt(pageSize, 10);
            offset = (parseInt(page, 10) - 1) * limit;
            options.limit = limit;
            options.offset = offset;
        }
        if (active) {
            const now = new Date();
            options.where = {
                start: { [Op.lte]: now },
                end: { [Op.gte]: now }
            }
        }
        if (closest) {
            const now = new Date();
            options.where = {
                start: { [Op.gte]: now },
            }
        }
        const { count, rows } = await Event.findAndCountAll(options)

        const response = {
            data: rows,
            total: count
        };

        if (page && pageSize) {
            response.page = parseInt(page, 10);
            response.pageSize = limit;
            response.totalPages = Math.ceil(count / limit);
        }

        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ message: req.t('event.serverError') });
    }
}

// 获取某活动详情
exports.getEventInfo = async (req, res) => {
    try {
        const event = await Event.findByPk(req.params.event_id, {
            include: [
                {
                    model: EventStage,
                    as: 'stage',
                    attributes: { exclude: ['created_time', 'updated_time'] },
                }
            ]
        })

        if (!event) {
            // 不存在
            return res.status(404).json({ message: req.t('event.notFound') })
        }

        res.status(200).json({ data: event });
    } catch (error) {
        res.status(500).json({ message: req.t('event.serverError') });
    }
}

// 创建活动
exports.createEvent = async (req, res) => {
    const { name, desc, start, end } = req.body;

    if(!name || !start || !end) {
        // 没传必填信息
        return res.status(400).json({ message: req.t('event.missingRequiredFields') });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    const now = new Date();

    if(startDate >= endDate) {
        // 结束时间必须要晚于开始时间
        return res.status(400).json({ message: req.t('event.startAfterEnd') });
    }
    if(startDate < now || endDate < now) {
        // 已经开始了和已经结束了
        return res.status(400).json({ message: req.t('event.alreadyStartedOrEnded') });
    }

    try {
        const sanitizedDesc = sanitizeRichTextHtml(desc);
        const event = await Event.create({
            name,
            desc: sanitizedDesc,
            start: startDate,
            end: endDate
        });
        await syncRichTextAssetReferences({
            contentType: 'event',
            contentId: event.id,
            html: sanitizedDesc,
        });

        res.status(201).json({ data: event });
    } catch (error) {
        res.status(500).json({ message: req.t('event.serverError') });
    }
}

// 删除
exports.deleteEvent = async (req, res) => {
    try {
        const event = await Event.findByPk(req.params.event_id)
        if (!event) {
            // 不存在
            return res.status(404).json({ message: req.t('event.notFound') });
        }
        const startDate = new Date(event.start);
        const endDate = new Date(event.end);
        const now = new Date();

        if(startDate < now && now < endDate) {
            // 进行中不能删
            return res.status(400).json({ message: req.t('event.cannotDeleteActive') });
        }

        await syncRichTextAssetReferences({
            contentType: 'event',
            contentId: event.id,
            html: '',
        });
        await event.destroy()
        res.status(200).json({ message: req.t('event.deleteSuccess') });
    } catch (error) {
        res.status(500).json({ message: req.t('event.serverError') });
    }
}

// 更新
exports.updateEvent = async (req, res) => {
    const { name, desc, start, end } = req.body;

    if(!name || !start || !end) {
        // 没传必填信息
        return res.status(400).json({ message: req.t('event.missingRequiredFields') });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    if(startDate >= endDate) {
        // 结束时间必须要晚于开始时间
        return res.status(400).json({ message: req.t('event.startAfterEnd') });
    }

    try {
        const event = await Event.findByPk(req.params.event_id)
        if (!event) {
            // 不存在
            return res.status(404).json({ message: req.t('event.notFound') });
        }

        const hasDesc = desc !== undefined && desc !== null;
        const sanitizedDesc = hasDesc ? sanitizeRichTextHtml(desc) : event.desc;

        event.name = name;
        event.desc = sanitizedDesc;
        event.start = new Date(start);
        event.end = new Date(end);

        await event.save();
        if (hasDesc) {
            await syncRichTextAssetReferences({
                contentType: 'event',
                contentId: event.id,
                html: sanitizedDesc,
            });
        }
        res.status(200).json({ message: req.t('event.updateSuccess') });
    } catch (error) {
        res.status(500).json({ message: req.t('event.serverError') });
    }
}

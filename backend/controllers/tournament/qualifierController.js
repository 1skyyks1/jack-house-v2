const { TQualMappool } = require('../../models/tournament');
const osu = require('osu-api-v2-js');
const qualifierService = require('../../services/tournament/qualifierService');
const { translateMessage, translatePayload } = require('../../utils/tournamentI18n');

const CLIENT_ID = Number(process.env.OSU_CLIENT_ID);
const CLIENT_SECRET = process.env.OSU_CLIENT_SECRET;

// 获取资格赛图池
exports.getQualMappool = async (req, res) => {
    try {
        const { tid } = req.params;
        const maps = await TQualMappool.findAll({
            where: { t_id: tid },
            order: [['index', 'ASC']]
        });
        res.json(maps);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: req.t('common.serverError') });
    }
};

// 添加资格赛图（需 pooler 权限）
// 输入链接格式：https://osu.ppy.sh/beatmapsets/2099900#mania/4405224
exports.addQualMap = async (req, res) => {
    try {
        const { tid } = req.params;
        const { index, url, weight } = req.body;

        if (!url) {
            return res.status(400).json({ message: req.t('tournament.errors.beatmapUrlRequired') });
        }

        // 解析链接获取 set_id 和 map_id
        // 格式：https://osu.ppy.sh/beatmapsets/{set_id}#mania/{map_id}
        const urlMatch = url.match(/beatmapsets\/(\d+)(?:#\w+\/(\d+))?/);
        if (!urlMatch) {
            return res.status(400).json({ message: req.t('tournament.errors.beatmapUrlInvalid') });
        }

        const set_id = parseInt(urlMatch[1]);
        const map_id = urlMatch[2] ? parseInt(urlMatch[2]) : null;

        if (!map_id) {
            return res.status(400).json({ message: req.t('tournament.errors.beatmapIdMissing') });
        }

        // 通过 osu! API 获取谱面信息
        const api = await osu.API.createAsync(CLIENT_ID, CLIENT_SECRET);
        const beatmap = await api.getBeatmap(map_id);

        if (!beatmap) {
            return res.status(404).json({ message: req.t('tournament.errors.beatmapNotFound') });
        }

        const map = await qualifierService.createQualMap(tid, {
            index: index || 1,
            map_id: beatmap.id,
            set_id: beatmap.beatmapset_id || set_id,
            artist: beatmap.beatmapset?.artist || '',
            title: beatmap.beatmapset?.title || '',
            mapper: beatmap.beatmapset?.creator || '',
            version: beatmap.version || '',
            star: beatmap.difficulty_rating || 0,
            hp: beatmap.drain || 0,
            od: beatmap.accuracy || 0,
            length: beatmap.total_length || 0,
            weight: weight || 1.0
        }, req.user?.user_id);
        res.status(201).json(map);
    } catch (error) {
        console.error(error);
        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }
        if (error.message?.includes('404')) {
            return res.status(404).json({ message: req.t('tournament.errors.beatmapNotFound') });
        }
        res.status(500).json({ message: req.t('common.serverError') });
    }
};

// 更新资格赛图
exports.updateQualMap = async (req, res) => {
    try {
        const { tid, mapId } = req.params;
        const map = await qualifierService.updateQualMap(tid, mapId, req.body, req.user?.user_id);
        res.json(map);
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ message: error.status ? translateMessage(req, error.message) : req.t('common.serverError') });
    }
};

// 删除资格赛图
exports.deleteQualMap = async (req, res) => {
    try {
        const { tid, mapId } = req.params;
        await qualifierService.deleteQualMap(tid, mapId, req.user?.user_id);
        res.json({ message: req.t('tournament.messages.deleteSuccess') });
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ message: error.status ? translateMessage(req, error.message) : req.t('common.serverError') });
    }
};

// 获取资格赛成绩
exports.getQualScores = async (req, res) => {
    try {
        const { tid } = req.params;
        const scores = await qualifierService.listQualScores(tid);
        res.json(scores);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: req.t('common.serverError') });
    }
};

// 获取资格赛导入记录
exports.getQualImports = async (req, res) => {
    try {
        const { tid } = req.params;
        const result = await qualifierService.listImports(tid, req.query);
        res.json(translatePayload(req, result));
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ message: error.status ? translateMessage(req, error.message) : req.t('common.serverError') });
    }
};

// 从 osu! API 获取资格赛成绩（通过 MP 房间 ID）
exports.fetchQualScoresFromMp = async (req, res) => {
    try {
        const { tid } = req.params;
        const result = await qualifierService.fetchQualScoresFromMp(tid, req.body, req.user?.user_id);
        res.json(translatePayload(req, result));
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ message: error.status ? translateMessage(req, error.message) : req.t('common.serverError') });
    }
};

// 计算排名
exports.calculateRanking = async (req, res) => {
    try {
        const { tid } = req.params;
        const result = await qualifierService.calculateRanking(tid, req.user?.user_id);
        res.json(translatePayload(req, result));
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ message: error.status ? translateMessage(req, error.message) : req.t('common.serverError') });
    }
};

// 锁定资格赛排名
exports.lockQualifierRanking = async (req, res) => {
    try {
        const { tid } = req.params;
        const result = await qualifierService.lockQualifierRanking(tid, req.user?.user_id);
        res.json(translatePayload(req, result));
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ message: error.status ? translateMessage(req, error.message) : req.t('common.serverError') });
    }
};

// 手动修正资格赛成绩
exports.updateQualScore = async (req, res) => {
    try {
        const { tid, scoreId } = req.params;
        const score = await qualifierService.updateQualScore(tid, scoreId, req.body, req.user?.user_id);
        res.json(score);
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ message: error.status ? translateMessage(req, error.message) : req.t('common.serverError') });
    }
};

// 获取资格赛排名
exports.getQualRanking = async (req, res) => {
    try {
        const { tid } = req.params;
        const teams = await qualifierService.getQualRanking(tid);
        res.json(teams);
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ message: error.status ? translateMessage(req, error.message) : req.t('common.serverError') });
    }
};

const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const { User, Post, Pack } = require('../models/index');

let businessAnalytics = null;

exports.configureBusinessAnalytics = ({ appId, pool }) => {
    businessAnalytics = { appId, pool };
};

exports.userAndPostCount = async (req, res) => {
    try {
        const postCount = await Post.count();
        const userCount = await User.count();
        res.status(200).json({ postCount: postCount, userCount: userCount });
    } catch (err) {
        res.status(500).json({ message: req.t('dashboard.getCountFailed') });
    }
}

exports.userGrowthDaily = async (req, res) => {
    try {
        const days = clampDays(req.query.days);
        const to = new Date();
        const from = new Date();
        from.setDate(to.getDate() - (days - 1));

        const fromDate = toDateKey(from);
        const toDate = toDateKey(to);
        const beforeCount = await User.count({
            where: sequelize.where(sequelize.fn('DATE', sequelize.col('created_time')), '<', fromDate)
        });
        const rows = await sequelize.query(`
            SELECT DATE_FORMAT(created_time, '%Y-%m-%d') AS date, COUNT(*) AS new_users
            FROM \`user\`
            WHERE created_time >= :fromDate AND created_time < DATE_ADD(:toDate, INTERVAL 1 DAY)
            GROUP BY DATE_FORMAT(created_time, '%Y-%m-%d')
            ORDER BY date ASC
        `, {
            replacements: { fromDate, toDate },
            type: QueryTypes.SELECT
        });

        const newUsersByDate = new Map(rows.map(row => [row.date, Number(row.new_users) || 0]));
        let totalUsers = Number(beforeCount) || 0;
        const daily = eachDate(from, days).map(date => {
            const newUsers = newUsersByDate.get(date) || 0;
            totalUsers += newUsers;
            return {
                date,
                new_users: newUsers,
                total_users: totalUsers
            };
        });

        res.status(200).json({ daily, days, ok: true });
    } catch (err) {
        res.status(500).json({ message: req.t('dashboard.getCountFailed') });
    }
}

exports.businessAnalytics = async (req, res) => {
    if (!businessAnalytics) {
        return res.status(503).json({ message: req.t('dashboard.getCountFailed') });
    }

    const hours = clampHours(req.query.hours);
    const cutoff = toSqlDate(new Date(Date.now() - hours * 60 * 60 * 1000));
    const { appId, pool } = businessAnalytics;

    try {
        const [userRows, trendRows, packRows] = await Promise.all([
            pool.query(`
                SELECT user_id, COUNT(*) AS requests
                FROM analytics_events
                WHERE app_id = ? AND event_type = 'osu_api_request'
                  AND event_time >= ? AND user_id IS NOT NULL
                GROUP BY user_id
                ORDER BY requests DESC
                LIMIT 10
            `, [appId, cutoff]),
            pool.query(`
                SELECT ${hours <= 48
                    ? "DATE_FORMAT(event_time, '%Y-%m-%d %H:00:00')"
                    : 'DATE(event_time)'} AS bucket,
                       COUNT(*) AS requests
                FROM analytics_events
                WHERE app_id = ? AND event_type = 'osu_api_request' AND event_time >= ?
                GROUP BY bucket
                ORDER BY bucket ASC
            `, [appId, cutoff]),
            pool.query(`
                SELECT CAST(SUBSTRING_INDEX(SUBSTRING(path, 7), '/', 1) AS UNSIGNED) AS pack_id,
                       COUNT(*) AS views
                FROM analytics_events
                WHERE app_id = ? AND event_type = 'page_start' AND event_time >= ?
                  AND path REGEXP '^/pack/[0-9]+(/|$)'
                GROUP BY pack_id
                ORDER BY views DESC
                LIMIT 10
            `, [appId, cutoff]),
        ]);

        const userIds = userRows.map((row) => Number(row.user_id)).filter(Number.isSafeInteger);
        const packIds = packRows.map((row) => Number(row.pack_id)).filter(Number.isSafeInteger);
        const [users, packs] = await Promise.all([
            userIds.length ? User.findAll({
                attributes: ['user_id', 'user_name', 'avatar'],
                where: { user_id: { [Op.in]: userIds } },
            }) : [],
            packIds.length ? Pack.findAll({
                attributes: ['pack_id', 'artist', 'title'],
                where: { pack_id: { [Op.in]: packIds } },
            }) : [],
        ]);
        const usersById = new Map(users.map((user) => [Number(user.user_id), user]));
        const packsById = new Map(packs.map((pack) => [Number(pack.pack_id), pack]));

        return res.status(200).json({
            hours,
            ok: true,
            osuRequests: {
                total: trendRows.reduce((total, row) => total + Number(row.requests || 0), 0),
                trend: trendRows.map((row) => ({
                    bucket: row.bucket,
                    requests: Number(row.requests || 0),
                })),
                users: userRows.map((row) => {
                    const userId = Number(row.user_id);
                    const user = usersById.get(userId);
                    return {
                        avatar: user?.avatar || null,
                        requests: Number(row.requests || 0),
                        userId,
                        userName: user?.user_name || `#${userId}`,
                    };
                }),
            },
            packs: packRows.map((row) => {
                const packId = Number(row.pack_id);
                const pack = packsById.get(packId);
                return {
                    artist: pack?.artist || null,
                    packId,
                    title: pack?.title || `#${packId}`,
                    views: Number(row.views || 0),
                };
            }),
        });
    } catch (error) {
        console.error('Failed to query business analytics:', error);
        return res.status(500).json({ message: req.t('dashboard.getCountFailed') });
    }
};

function clampDays(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 30;
    return Math.min(Math.max(parsed, 1), 365);
}

function clampHours(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 24;
    return Math.min(Math.max(parsed, 1), 14 * 24);
}

function eachDate(from, days) {
    return Array.from({ length: days }, (_, index) => {
        const date = new Date(from);
        date.setDate(from.getDate() + index);
        return toDateKey(date);
    });
}

function toDateKey(date) {
    return date.toISOString().slice(0, 10);
}

function toSqlDate(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const { User, Post } = require('../models/index');

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

function clampDays(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 30;
    return Math.min(Math.max(parsed, 1), 365);
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

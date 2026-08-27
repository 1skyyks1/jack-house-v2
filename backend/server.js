const express = require('express');
const userRoutes = require('./routes/userRoute');
const authRoutes = require('./routes/authRoute');
const postRoutes = require('./routes/postRoute');
const postCommentRoutes = require('./routes/postCommentRoute');
const postFileRoutes = require('./routes/postFileRoute');
const dashboardRoutes = require('./routes/dashboardRoute')
const packRoutes = require('./routes/packRoute')
const tagRoutes = require('./routes/tagRoute')
const packCommentRoutes = require('./routes/packCommentRoute')
const eventRoutes = require('./routes/eventRoute');
const badgeRoutes = require('./routes/badgeRoute');
const permissionsRoutes = require('./routes/permissions');
const tournamentRoutes = require('./routes/tournamentRoute');
const uploadRoutes = require('./routes/uploadRoute');
const toolRoutes = require('./routes/toolRoute');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const mariadb = require('mariadb');
const { createAnalyticsRouter, MariaDbAnalyticsStorage } = require('@jack-house-analytics/server-express');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const i18nextMiddleware = require('i18next-http-middleware');
const csrfMiddleware = require('./middleware/csrfMiddleware');
const aiImageModule = require('./modules/aiImage');
const rewardsRoutes = require('./modules/rewards/router');
require('dotenv').config();

i18next.use(Backend).use(i18nextMiddleware.LanguageDetector).init({
    backend: {
        loadPath: `${__dirname}/locale/{{lng}}.json`,
    },
    fallbackLng: 'en',
    preload: ['en', 'zh'],
})

const app = express();

app.use(i18nextMiddleware.handle(i18next));

const port = process.env.PORT || 3000;

app.set('trust proxy', 'loopback');
app.get('/ip', (request, response) => response.send(request.ip))

// 安全中间件
app.use(helmet());
app.use(morgan('dev'));

const corsOrigins = (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
const isProduction = process.env.NODE_ENV === 'production';
const allowLocalhostCors = !isProduction && process.env.CORS_ALLOW_LOCALHOST !== 'false';
const analyticsEnabled = process.env.ANALYTICS_ENABLED !== 'false';
const analyticsRetentionDays = parsePositiveInteger(process.env.ANALYTICS_RETENTION_DAYS, 14);
const analyticsCleanupIntervalMs = 6 * 60 * 60 * 1000;

if (isProduction && corsOrigins.length === 0) {
    throw new Error('CORS_ORIGIN or FRONTEND_URL must be set in production when credentials are enabled');
}

const isLocalhostOrigin = (origin) => {
    try {
        const { hostname, protocol } = new URL(origin);
        return ['http:', 'https:'].includes(protocol) && ['localhost', '127.0.0.1', '::1'].includes(hostname);
    } catch (error) {
        return false;
    }
};

const getAnalyticsAllowedOrigins = () => {
    const origins = new Set(corsOrigins);

    if (process.env.FRONTEND_URL) {
        origins.add(process.env.FRONTEND_URL);
    }

    if (allowLocalhostCors) {
        ['5173', '5174', '5175'].forEach((port) => {
            origins.add(`http://localhost:${port}`);
            origins.add(`http://127.0.0.1:${port}`);
        });
    }

    return [...origins];
};

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || corsOrigins.includes(origin) || (allowLocalhostCors && isLocalhostOrigin(origin))) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], // 允许的 HTTP 方法
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Accept-Language', 'Cache-Control'], // 允许的请求头
    credentials: true, // 允许发送 Cookie
})); // 启用 CORS

// API限流
const commonLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 200, // 每个IP允许的请求数
    standardHeaders: true,
    legacyHeaders: false,
});

// osu-api
const osuLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
})

if (analyticsEnabled) {
    const analyticsApps = (process.env.ANALYTICS_APPS || 'jack-house-v3')
        .split(',')
        .map((appId) => appId.trim())
        .filter(Boolean);
    const analyticsPool = mariadb.createPool({
        host: process.env.ANALYTICS_DB_HOST || process.env.DB_HOST,
        database: process.env.ANALYTICS_DB_NAME || process.env.DB_NAME,
        user: process.env.ANALYTICS_DB_USER || process.env.DB_USER,
        password: process.env.ANALYTICS_DB_PASSWORD ?? process.env.DB_PASSWORD,
        connectionLimit: Number(process.env.ANALYTICS_DB_CONNECTION_LIMIT || 5),
    });
    const analyticsStorage = new MariaDbAnalyticsStorage(analyticsPool);
    const pageViewAnalyticsStorage = {
        insertEvents: (events) => analyticsStorage.insertEvents(
            events.filter((event) => event.eventType === 'page_start'),
        ),
    };

    app.use('/analytics', commonLimiter, createAnalyticsRouter({
        express,
        mariaDbPool: analyticsPool,
        storage: pageViewAnalyticsStorage,
        apps: analyticsApps,
        allowedOrigins: getAnalyticsAllowedOrigins(),
        autoMigrate: process.env.ANALYTICS_AUTO_MIGRATE === 'true' || (!isProduction && process.env.ANALYTICS_AUTO_MIGRATE !== 'false'),
        enableStats: process.env.ANALYTICS_ENABLE_STATS !== 'false',
    }));

    app.get('/analytics/stats/audience', async (request, response) => {
        const appId = typeof request.query.appId === 'string' ? request.query.appId : analyticsApps[0];
        if (!analyticsApps.includes(appId)) {
            return response.status(400).json({ ok: false, code: 'INVALID_APP_ID' });
        }

        const cutoff = getUtcRetentionCutoff(analyticsRetentionDays);

        try {
            const timezoneRows = await analyticsPool.query(
                `SELECT timezone, COUNT(*) AS visitors
                 FROM (
                     SELECT visitor_id,
                            JSON_UNQUOTE(JSON_EXTRACT(payload, '$.context.timezone')) AS timezone,
                            ROW_NUMBER() OVER (PARTITION BY visitor_id ORDER BY event_time DESC, id DESC) AS context_rank
                     FROM analytics_events
                     WHERE app_id = ? AND event_type = 'page_start' AND event_time >= ?
                 ) AS latest_context
                 WHERE context_rank = 1 AND timezone IS NOT NULL AND timezone <> ''
                 GROUP BY timezone
                 ORDER BY visitors DESC`,
                [appId, cutoff],
            );
            const deviceRows = await analyticsPool.query(
                `SELECT device, COUNT(*) AS visitors
                 FROM (
                     SELECT visitor_id,
                            CASE
                                WHEN JSON_EXTRACT(payload, '$.context.viewport.width') IS NULL THEN 'unknown'
                                WHEN CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.context.viewport.width')) AS UNSIGNED) < 768 THEN 'mobile'
                                WHEN CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.context.viewport.width')) AS UNSIGNED) < 1200 THEN 'tablet'
                                ELSE 'desktop'
                            END AS device,
                            ROW_NUMBER() OVER (PARTITION BY visitor_id ORDER BY event_time DESC, id DESC) AS context_rank
                     FROM analytics_events
                     WHERE app_id = ? AND event_type = 'page_start' AND event_time >= ?
                 ) AS latest_context
                 WHERE context_rank = 1
                 GROUP BY device
                 ORDER BY visitors DESC`,
                [appId, cutoff],
            );
            const screenRows = await analyticsPool.query(
                `SELECT screen_width, screen_height, COUNT(*) AS visitors
                 FROM (
                     SELECT visitor_id,
                            CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.context.screen.width')) AS UNSIGNED) AS screen_width,
                            CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.context.screen.height')) AS UNSIGNED) AS screen_height,
                            ROW_NUMBER() OVER (PARTITION BY visitor_id ORDER BY event_time DESC, id DESC) AS context_rank
                     FROM analytics_events
                     WHERE app_id = ? AND event_type = 'page_start' AND event_time >= ?
                 ) AS latest_context
                 WHERE context_rank = 1 AND screen_width > 0 AND screen_height > 0
                 GROUP BY screen_width, screen_height
                 ORDER BY visitors DESC
                 LIMIT 8`,
                [appId, cutoff],
            );

            return response.status(200).json({
                ok: true,
                appId,
                days: analyticsRetentionDays,
                timezones: timezoneRows.map((row) => ({
                    timezone: row.timezone,
                    visitors: Number(row.visitors || 0),
                })),
                devices: deviceRows.map((row) => ({
                    device: row.device,
                    visitors: Number(row.visitors || 0),
                })),
                screens: screenRows.map((row) => ({
                    width: Number(row.screen_width),
                    height: Number(row.screen_height),
                    visitors: Number(row.visitors || 0),
                })),
            });
        } catch (error) {
            console.error('Failed to query analytics audience:', error);
            return response.status(500).json({ ok: false, code: 'INTERNAL_ERROR' });
        }
    });

    const cleanupAnalyticsEvents = async () => {
        const cutoff = getUtcRetentionCutoff(analyticsRetentionDays);
        const result = await analyticsPool.query(
            'DELETE FROM analytics_events WHERE event_time < ?',
            [cutoff],
        );

        if (result.affectedRows > 0) {
            console.log(`Deleted ${result.affectedRows} analytics events older than ${cutoff}`);
        }
    };

    void cleanupAnalyticsEvents().catch((error) => {
        console.error('Failed to clean up expired analytics events:', error);
    });

    const analyticsCleanupTimer = setInterval(() => {
        void cleanupAnalyticsEvents().catch((error) => {
            console.error('Failed to clean up expired analytics events:', error);
        });
    }, analyticsCleanupIntervalMs);
    analyticsCleanupTimer.unref();
}

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getUtcRetentionCutoff(retentionDays) {
    const cutoff = new Date();
    cutoff.setUTCHours(0, 0, 0, 0);
    cutoff.setUTCDate(cutoff.getUTCDate() - (retentionDays - 1));
    return cutoff.toISOString().slice(0, 19).replace('T', ' ');
}

// 解析 JSON 请求体
app.use(express.json());
app.use(csrfMiddleware);

// 路由
app.use('/user', commonLimiter, userRoutes);
app.use('/auth', osuLimiter, authRoutes);
app.use('/post', commonLimiter, postRoutes);
app.use('/comment', commonLimiter, postCommentRoutes);
app.use('/postFile', commonLimiter, postFileRoutes);
app.use('/dashboard', commonLimiter, dashboardRoutes);
app.use('/pack', commonLimiter, packRoutes);
app.use('/tag', commonLimiter, tagRoutes);
app.use('/packCom', commonLimiter, packCommentRoutes);
app.use('/event', commonLimiter, eventRoutes)
app.use('/badge', commonLimiter, badgeRoutes)
app.use('/permissions', commonLimiter, permissionsRoutes)
app.use('/t', commonLimiter, tournamentRoutes)
app.use('/upload', commonLimiter, uploadRoutes)
app.use('/tool', toolRoutes)
app.use('/rewards', commonLimiter, rewardsRoutes)

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${port}`);
    aiImageModule.start();
});

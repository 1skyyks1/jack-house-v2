const express = require('express');
const userRoutes = require('./routes/userRoute');
const authRoutes = require('./routes/authRoute');
const postRoutes = require('./routes/postRoute');
const postCommentRoutes = require('./routes/postCommentRoute');
const postFileRoutes = require('./routes/postFileRoute');
const homeImgRoutes = require('./routes/homeImgRoute')
const dashboardRoutes = require('./routes/dashboardRoute')
const packRoutes = require('./routes/packRoute')
const tagRoutes = require('./routes/tagRoute')
const packCommentRoutes = require('./routes/packCommentRoute')
const eventRoutes = require('./routes/eventRoute');
const badgeRoutes = require('./routes/badgeRoute');
const permissionsRoutes = require('./routes/permissions');
const tournamentRoutes = require('./routes/tournamentRoute');
const uploadRoutes = require('./routes/uploadRoute');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const mariadb = require('mariadb');
const { createAnalyticsRouter } = require('@jack-house-analytics/server-express');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const i18nextMiddleware = require('i18next-http-middleware');
const csrfMiddleware = require('./middleware/csrfMiddleware');
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
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // 允许的 HTTP 方法
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
    const analyticsPool = mariadb.createPool({
        host: process.env.ANALYTICS_DB_HOST || process.env.DB_HOST,
        database: process.env.ANALYTICS_DB_NAME || process.env.DB_NAME,
        user: process.env.ANALYTICS_DB_USER || process.env.DB_USER,
        password: process.env.ANALYTICS_DB_PASSWORD ?? process.env.DB_PASSWORD,
        connectionLimit: Number(process.env.ANALYTICS_DB_CONNECTION_LIMIT || 5),
    });

    app.use('/analytics', commonLimiter, createAnalyticsRouter({
        express,
        mariaDbPool: analyticsPool,
        apps: (process.env.ANALYTICS_APPS || 'jack-house-v3').split(',').map((appId) => appId.trim()).filter(Boolean),
        allowedOrigins: getAnalyticsAllowedOrigins(),
        autoMigrate: process.env.ANALYTICS_AUTO_MIGRATE === 'true' || (!isProduction && process.env.ANALYTICS_AUTO_MIGRATE !== 'false'),
        enableStats: process.env.ANALYTICS_ENABLE_STATS !== 'false',
    }));
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
app.use('/homeImg', commonLimiter, homeImgRoutes);
app.use('/dashboard', commonLimiter, dashboardRoutes);
app.use('/pack', commonLimiter, packRoutes);
app.use('/tag', commonLimiter, tagRoutes);
app.use('/packCom', commonLimiter, packCommentRoutes);
app.use('/event', commonLimiter, eventRoutes)
app.use('/badge', commonLimiter, badgeRoutes)
app.use('/permissions', commonLimiter, permissionsRoutes)
app.use('/t', commonLimiter, tournamentRoutes)
app.use('/upload', commonLimiter, uploadRoutes)

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${port}`);
});

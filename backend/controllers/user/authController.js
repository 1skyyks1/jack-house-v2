const User = require('../../models/user/user');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { createUserRecord } = require('./userController');
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const { clearAuthCookie, setAuthCookie } = require('../../utils/authCookie');

// 邮箱注册
const register = async (req, res) => {
    const { username, email, password } = req.body;

    try {
        // 检查邮箱是否已注册
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: req.t('auth.emailRegistered') });
        }

        // 邮箱注册是预留能力，创建逻辑复用用户内部 helper。
        const user = await createUserRecord({
            user_name: username,
            email,
            password,
            role: 0,
            status: 0,
        });

        // 生成 JWT
        const token = jwt.sign({ userId: user.user_id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
        setAuthCookie(res, token);

        const data = { message: req.t('auth.registerSuccess'), userId: user.user_id };
        if (process.env.AUTH_LEGACY_BEARER_ENABLED !== 'false') {
            data.token = token;
        }

        res.status(201).json({ data });
    } catch (error) {
        res.status(500).json({ message: req.t('auth.registerFailed') });
    }
};

// 用户名或邮箱登录
const login = async (req, res) => {
    const { identifier, password } = req.body; // identifier 可以是用户名或邮箱

    try {
        // 查找用户
        const user = await User.findOne({
            where: {
                [Op.or]: [
                    { user_name: identifier },
                    { email: identifier },
                ],
            },
        });

        if (!user) {
            return res.status(400).json({ message: req.t('auth.userNotFound') });
        }

        // 验证密码
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ message: req.t('auth.wrongPassword') });
        }

        // 生成 JWT
        const token = jwt.sign({ userId: user.user_id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
        setAuthCookie(res, token);

        const data = { message: req.t('auth.loginSuccess'), userId: user.user_id };
        if (process.env.AUTH_LEGACY_BEARER_ENABLED !== 'false') {
            data.token = token;
        }

        res.json({ data });
    } catch (error) {
        res.status(500).json({ message: req.t('auth.loginFailed') });
    }
};

const logout = async (req, res) => {
    clearAuthCookie(res);
    res.json({ data: { message: req.t('auth.logoutSuccess') } });
};

module.exports = {
    register,
    login,
    logout
};

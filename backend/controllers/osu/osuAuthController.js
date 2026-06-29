const User = require('../../models/user/user');
const jwt = require('jsonwebtoken');
const osu = require("osu-api-v2-js");
const { setAuthCookie } = require('../../utils/authCookie');

const CLIENT_ID = Number(process.env.OSU_CLIENT_ID);
const CLIENT_SECRET = process.env.OSU_CLIENT_SECRET;
const REDIRECT_URI = process.env.OSU_REDIRECT_URI;

// 生成授权链接并重定向
const authRedirect = (req, res) => {
    const url = osu.generateAuthorizationURL(CLIENT_ID, REDIRECT_URI, ["public", "identify"])
    res.redirect(url);
}

// 处理回调并完成登录
const authCallback = async (req, res) => {
    const { code } = req.query;

    try {
        const api = await osu.API.createAsync(CLIENT_ID, CLIENT_SECRET,
            { code, redirect_uri: REDIRECT_URI }, { verbose: "all" });

        const me = await api.getResourceOwner();
        if (!me) {
            return res.status(400).json({ message: req.t('auth.getUserFailed') });
        }

        let user = await User.findOne({
            where: { osu_uid: me.id },
        })
        if (!user) {
            user = await User.create({
                user_name: me.username,
                osu_uid: me.id,
                avatar: me.avatar_url,
                role: 0, // 默认角色
                status: 0, // 默认状态
            })
        }

        const token = jwt.sign({ userId: user.user_id, role: user.role },
            process.env.JWT_SECRET, { expiresIn: '7d' });
        setAuthCookie(res, token);

        const redirectUrl = new URL('/oauth/complete', process.env.FRONTEND_URL);
        redirectUrl.searchParams.set('userId', user.user_id);

        // 更新用户名和头像
        if (user.user_name !== me.username) {
            redirectUrl.searchParams.set('name', me.username);
        }
        if (user.avatar !== me.avatar_url) {
            redirectUrl.searchParams.set('avatar', me.avatar_url);
        }

        // 重定向到前端完成页面
        res.redirect(redirectUrl.toString());

    } catch (error) {
        res.status(500).json({ message: req.t('auth.authFailed') });
    }
}

module.exports = {
    authRedirect,
    authCallback
}

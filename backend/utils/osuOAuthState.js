const crypto=require('node:crypto');
const jwt=require('jsonwebtoken');
const {parseCookies,getCookieOptions}=require('./authCookie');
const COOKIE='jh_osu_state';
function safeReturnTo(value){return typeof value==='string'&&value.startsWith('/')&&!value.startsWith('//')&&!/[\\\x00-\x1f]/.test(value)&&value.length<=512?value:'/';}
function begin(req,res){const state=crypto.randomBytes(32).toString('hex');const token=jwt.sign({state,returnTo:safeReturnTo(req.query.returnTo),purpose:'osu_login'},process.env.JWT_SECRET,{expiresIn:'10m'});res.cookie(COOKIE,token,{...getCookieOptions(),sameSite:'lax',maxAge:600000});return state;}
function consume(req,res){const token=parseCookies(req.headers.cookie||'')[COOKIE];res.clearCookie(COOKIE,{...getCookieOptions(),sameSite:'lax',maxAge:undefined});if(!token||typeof req.query.state!=='string')throw Error('oauth_state_invalid');const decoded=jwt.verify(token,process.env.JWT_SECRET,{algorithms:['HS256']});const a=Buffer.from(decoded.state||''),b=Buffer.from(req.query.state);if(decoded.purpose!=='osu_login'||a.length!==b.length||!crypto.timingSafeEqual(a,b))throw Error('oauth_state_invalid');return safeReturnTo(decoded.returnTo);}
module.exports={begin,consume,safeReturnTo};

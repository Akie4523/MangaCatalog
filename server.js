'use strict';
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const querystring = require('querystring');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const nodemailer = require('nodemailer');

// ==========================================
// 0. Config (ต้องตั้งค่าใน Environment ก่อนรัน)
// ==========================================
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('❌ ต้องตั้ง JWT_SECRET (สุ่มอย่างน้อย 32 ตัวอักษร) ใน Environment ก่อนเริ่มเซิร์ฟเวอร์');
    process.exit(1);
}
if (!process.env.MONGO_URI) {
    console.error('❌ ไม่พบ MONGO_URI ใน Environment');
    process.exit(1);
}

const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE_NAME = 'mc_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const OAUTH_COOKIE = 'mc_oauth';
const OAUTH_MS = 10 * 60 * 1000;
const BCRYPT_COST = 12;

// บัญชีที่เป็นแอดมิน (คั่นด้วยจุลภาค) เช่น ADMIN_USERNAMES=owner,editor
const ADMIN_USERNAMES = (process.env.ADMIN_USERNAMES || '').split(',').map(s => s.trim()).filter(Boolean);

// ----- สมัครด้วย Google (ไม่บังคับ) — ตั้ง GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET เพื่อเปิดใช้งาน -----
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_ENABLED = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
if (!GOOGLE_ENABLED) {
    console.warn('⚠️ ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET — ปุ่ม "เข้าสู่ระบบด้วย Google" จะถูกปิดใช้งาน');
}

// ----- ส่งอีเมล (ลืมรหัสผ่าน) ไม่บังคับ — ตั้ง SMTP_HOST/SMTP_USER/SMTP_PASS เพื่อเปิดใช้งาน -----
let mailTransporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    mailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
} else {
    console.warn('⚠️ ยังไม่ได้ตั้งค่า SMTP_HOST/SMTP_USER/SMTP_PASS — ระบบ "ลืมรหัสผ่าน" จะส่งอีเมลไม่ได้ (จะพิมพ์ลิงก์ไว้ใน log แทน)');
}
async function sendResetEmail(to, resetUrl) {
    if (!mailTransporter) {
        console.warn('✉️  [DEV] ลิงก์รีเซ็ตรหัสผ่านสำหรับ ' + to + ': ' + resetUrl);
        return;
    }
    await mailTransporter.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to,
        subject: 'รีเซ็ตรหัสผ่าน — MangaCatalog',
        text: 'มีการขอตั้งรหัสผ่านใหม่สำหรับบัญชีนี้\n\nกดลิงก์นี้เพื่อตั้งรหัสผ่านใหม่ (ลิงก์หมดอายุใน 1 ชั่วโมง):\n' + resetUrl +
            '\n\nถ้าคุณไม่ได้เป็นคนขอ ไม่ต้องทำอะไร — รหัสผ่านเดิมยังใช้งานได้ตามปกติ',
        html: '<p>มีการขอตั้งรหัสผ่านใหม่สำหรับบัญชีนี้</p>' +
            '<p><a href="' + resetUrl + '">กดที่นี่เพื่อตั้งรหัสผ่านใหม่</a> (ลิงก์หมดอายุใน 1 ชั่วโมง)</p>' +
            '<p style="color:#777;font-size:.85em">ถ้าคุณไม่ได้เป็นคนขอ ไม่ต้องทำอะไร — รหัสผ่านเดิมยังใช้งานได้ตามปกติ</p>'
    });
}

// ----- ช่วยเรียก Google token endpoint แบบ server-to-server (ไม่พึ่ง fetch เพื่อให้รันได้บน Node เวอร์ชันเก่า) -----
function httpsPostForm(hostname, pathName, formObj) {
    return new Promise((resolve, reject) => {
        const body = querystring.stringify(formObj);
        const req = https.request({
            hostname, path: pathName, method: 'POST', timeout: 10000,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch (e) { reject(new Error('การตอบกลับจาก Google ไม่ถูกต้อง')); }
            });
        });
        req.on('timeout', () => req.destroy(new Error('Google token request timed out')));
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// decode เฉพาะ payload ของ JWT (ไม่ verify ลายเซ็น) — ใช้ได้อย่างปลอดภัยเฉพาะตอนที่ id_token
// มาจากการแลก code กับ Google token endpoint โดยตรงผ่าน HTTPS + client_secret เท่านั้น (ไม่ใช่รับจาก client)
function decodeJwtPayloadUnsafe(token) {
    const parts = String(token).split('.');
    if (parts.length !== 3) throw new Error('bad token');
    return JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

// ==========================================
// 1. Discord Bot System (เหมือนเดิม)
// ==========================================
const { Client, GatewayIntentBits } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const MY_OWNER_ID = '767330467329343528';
const TRAP_CHANNELS = ['1498735590596804721', '1498741392770465864'];

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.author.id === MY_OWNER_ID) return;

    if (TRAP_CHANNELS.includes(message.channel.id)) {
        console.log(`🚨 ตรวจพบคนหลงกลในห้อง ${message.channel.name}: ${message.author.tag}`);

        try {
            const member = await message.guild.members.fetch(message.author.id);
            await member.timeout(24 * 60 * 60 * 1000, 'Security Trigger: Honey Pot');
            await message.delete();

            try {
                await message.author.send(
                    `**แจ้งเตือนจากเซิร์ฟเวอร์ ${message.guild.name}**\n\n` +
                    `บัญชีของคุณถูก Timeout เป็นเวลา 24 ชั่วโมง เนื่องจากมีการพิมพ์ในห้อง ${message.channel.name}\n` +
                    `ระบบได้ทำการลบข้อความของคุณเพื่อความปลอดภัย หากคุณไม่ได้เป็นคนพิมพ์ โปรดตรวจสอบไอดีของคุณโดยด่วน`
                );
            } catch (dmErr) {
                console.log(`⚠️ ส่ง DM ให้ ${message.author.tag} ไม่สำเร็จ`);
            }

            console.log(`⚡ จัดการ Timeout และลบข้อความของ ${message.author.tag} สำเร็จ`);
        } catch (err) {
            console.error('❌ เกิดข้อผิดพลาดในการลงโทษ:', err);
        }
    }
});

client.once('ready', () => {
    console.log(`✅ [Discord Bot] ออนไลน์ในชื่อ: ${client.user.tag}`);
});

if (TOKEN) {
    client.login(TOKEN).catch(err => console.error('❌ Login บอทไม่สำเร็จ:', err));
} else {
    console.log('❌ ไม่พบ DISCORD_TOKEN ในหน้า Environment');
}

// ==========================================
// 2. Express App & Security Middleware
// ==========================================
const app = express();
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1)); // จำนวน proxy ที่อยู่หน้าเซิร์ฟเวอร์ (Render = 1)
app.disable('x-powered-by');

app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: false,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],                                   // ห้าม inline script / CDN ภายนอก
            styleSrc: ["'self'", 'https://fonts.googleapis.com'],
            fontSrc: ['https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'https:'],                   // ปกมังงะมาจากหลายเว็บ
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            ...(IS_PROD ? { upgradeInsecureRequests: [] } : {})
        }
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false
}));

// 256kb: พอรองรับการนำเข้าลิงก์ Facebook รายตอนเป็นชุดใหญ่ (สูงสุด 1000 ตอน/เรื่อง) โดยยังเล็กพอที่จะกัน DoS จาก body ขนาดใหญ่
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

// กัน NoSQL injection ระดับ global (ค่า {"$gt":""} จากผู้ใช้จะถูกแปลงเป็นค่าธรรมดา)
mongoose.set('sanitizeFilter', true);
const trusted = mongoose.trusted || (x => x);

// กัน CSRF: คำขอที่เปลี่ยนข้อมูลต้องมาจากเว็บเราเอง (เสริมจาก cookie SameSite=Strict)
app.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin) {
        try {
            if (new URL(origin).host !== req.get('host')) return res.status(403).json({ message: 'Forbidden' });
        } catch (e) {
            return res.status(403).json({ message: 'Forbidden' });
        }
    }
    next();
});

// ไฟล์ static เปิดเฉพาะโฟลเดอร์ assets (เดิมเปิดทั้งโปรเจกต์ ทำให้โหลด server.js / .env ได้)
app.use('/assets', express.static(path.join(__dirname, 'assets'), { index: false, dotfiles: 'ignore', maxAge: '1h' }));

const makeLimiter = (windowMs, limit, message) => rateLimit({
    windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { message }
});
const apiLimiter = makeLimiter(15 * 60 * 1000, 600, 'คำขอมากเกินไป กรุณาลองใหม่ภายหลัง');
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true,
    standardHeaders: 'draft-7', legacyHeaders: false,
    message: { success: false, message: 'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาที' }
});
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { success: false, message: 'สมัครสมาชิกบ่อยเกินไป กรุณารอ 1 ชั่วโมง' }
});
// จำกัดเข้มเป็นพิเศษ: endpoint นี้ส่งอีเมลออก ป้องกันไม่ให้ถูกใช้เป็นเครื่องมือสแปมผู้อื่น
const forgotLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 4, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { success: false, message: 'ขอลิงก์รีเซ็ตรหัสผ่านบ่อยเกินไป กรุณารอ 15 นาที' }
});
const resetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { success: false, message: 'ลองหลายครั้งเกินไป กรุณารอ 15 นาที' }
});
const googleLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { success: false, message: 'ลองหลายครั้งเกินไป กรุณารอ 15 นาที' }
});
app.use('/api', apiLimiter);

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ==========================================
// 3. Database & Schemas
// ==========================================
const Manga = mongoose.model('Manga', new mongoose.Schema({
    id: String,
    title: String,
    cover: String,
    description: String,
    tags: [String],
    rating: String,
    jp_name: String,
    en_name: String,
    th_name: String,
    author: String,
    artist: String,
    translator: String,
    translator_link: String,
    thai_url: String,
    thai_url_Buy: String,
    eng_url: String,
    eng_url_Buy: String,
    original_url: String,
    original_url_Buy: String,
    facebook_post_url: { type: String, default: '' },
    // ลิงก์โพสต์ Facebook แยกรายตอน — สำหรับนักแปลที่ลงแต่ละตอนเป็นโพสต์เดี่ยวๆ โดยไม่ได้ทำอัลบั้มรวม
    chapters: {
        type: [{ _id: false, label: { type: String, default: '' }, url: { type: String, required: true } }],
        default: []
    },
    updated_at: String
}));

const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    // ไม่บังคับอีกต่อไป: บัญชีที่สมัครผ่าน Google อย่างเดียวจะไม่มีรหัสผ่านจนกว่าจะตั้งเองผ่าน "ลืมรหัสผ่าน"
    // select:false กันไม่ให้หลุดติดไปกับ query ทั่วไปโดยไม่ตั้งใจ ต้อง .select('+password') เท่านั้นตอน login
    password: { type: String, select: false },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    googleId: { type: String, unique: true, sparse: true },
    // นับเวอร์ชัน session — เพิ่มขึ้นทุกครั้งที่เปลี่ยน/รีเซ็ตรหัสผ่าน เพื่อให้ JWT เก่าที่หลุดออกไปใช้ต่อไม่ได้
    tokenVersion: { type: Number, default: 0 },
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    favorites: { type: [String], default: [] }
}));

const BCRYPT_RE = /^\$2[aby]\$/;
const DUMMY_HASH = bcrypt.hashSync('timing-attack-dummy', BCRYPT_COST);
const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// รันตอนเริ่มระบบ: เข้ารหัสรหัสผ่านที่ยังเป็น plaintext + ตั้งสิทธิ์แอดมินตาม ADMIN_USERNAMES
async function migrateUsers() {
    const users = await User.find().select('+password');
    let hashed = 0;
    for (const u of users) {
        if (u.password && !BCRYPT_RE.test(u.password)) {
            u.password = await bcrypt.hash(u.password, BCRYPT_COST);
            await u.save();
            hashed++;
        }
    }
    if (hashed) console.log(`🔐 เข้ารหัสรหัสผ่านเดิม ${hashed} บัญชีแล้ว`);

    for (const name of ADMIN_USERNAMES) {
        await User.updateOne({ username: name }, { $set: { role: 'admin' } });
    }
    const admins = await User.countDocuments({ role: 'admin' });
    if (admins === 0) console.warn('⚠️ ยังไม่มีแอดมินเลย — ตั้ง ADMIN_USERNAMES ใน Environment แล้วรีสตาร์ท');
}

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('✅ Connected to MongoDB');
        await migrateUsers();
    })
    .catch(err => console.error('❌ MongoDB Error:', err.message));

// ==========================================
// 4. Auth (JWT ใน httpOnly cookie + ตรวจสิทธิ์จากฐานข้อมูลทุกครั้ง)
// ==========================================
async function loadUser(req, res, next) {
    req.user = null;
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (token) {
        try {
            const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
            const user = await User.findById(payload.id).select('username role favorites tokenVersion');
            // ถ้ารหัสผ่านถูกเปลี่ยน/รีเซ็ตไปแล้ว tokenVersion จะไม่ตรงกับตอนออก token นี้ — session เก่าใช้ต่อไม่ได้
            if (user && user.tokenVersion === payload.v) req.user = user;
        } catch (e) { /* token ไม่ถูกต้อง/หมดอายุ = ถือว่าไม่ได้ล็อกอิน */ }
    }
    next();
}

const requireAuth = [loadUser, (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบ' });
    next();
}];

const requireAdmin = [loadUser, (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบ' });
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'บัญชีนี้ไม่มีสิทธิ์จัดการข้อมูล' });
    next();
}];

const cookieOptions = (req) => ({ httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/' });
// ใช้ sameSite:'lax' เฉพาะคุกกี้ชั่วคราวของ OAuth เท่านั้น เพราะต้องรอดจากการ redirect แบบข้ามเว็บ (Google -> เรา)
// ซึ่งคุกกี้ sameSite:'strict' จะไม่ถูกส่งมาด้วยในสถานการณ์นั้น ส่วนคุกกี้ session หลัก (mc_session) ยังคง strict ตามเดิม
const oauthCookieOptions = (req) => ({ httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/', maxAge: OAUTH_MS });

// ออก JWT + ตั้งคุกกี้ session ให้ผู้ใช้คนหนึ่ง ใช้ร่วมกันทั้ง login / register / Google callback
function issueSession(req, res, user) {
    const token = jwt.sign({ id: String(user._id), v: user.tokenVersion || 0 }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' });
    res.cookie(COOKIE_NAME, token, { ...cookieOptions(req), maxAge: SESSION_MS });
}

// ==========================================
// 5. Helpers: validation & SSRF protection
// ==========================================
function parseHttpUrl(value) {
    try {
        const u = new URL(String(value));
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
        if (u.username || u.password) return null;
        return u;
    } catch (e) { return null; }
}

const isObjectId = (id) => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);

// รับเฉพาะพาธภายในเว็บเราเอง (กัน open-redirect ผ่าน ?next=) — เหมือนฝั่ง client (MC.safeNext ใน app.js)
function MC_safeNext(n) {
    return (typeof n === 'string' && /^\/(?![\/\\])/.test(n)) ? n : '/';
}

// คำนวณ redirect_uri ของ Google OAuth — ใช้ค่าจาก Environment ถ้าตั้งไว้ (แนะนำบน production)
// ไม่งั้นคำนวณจาก request (รองรับ trust proxy ที่ตั้งไว้แล้วสำหรับ X-Forwarded-Proto)
function googleRedirectUri(req) {
    return process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/auth/google/callback`;
}

// ตั้งชื่อผู้ใช้อัตโนมัติจากอีเมลตอนสมัครผ่าน Google ครั้งแรก แล้วเติมเลข/สุ่มต่อท้ายถ้าชื่อซ้ำ
async function uniqueUsernameFromEmail(email) {
    const base = (String(email).split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24) || 'user';
    let candidate = base;
    for (let i = 1; i <= 50; i++) {
        if (!(await User.exists({ username: candidate }))) return candidate;
        candidate = base + i;
    }
    return base + crypto.randomBytes(3).toString('hex');
}

// ใช้ .lean() เสมอ: เอกสารเก่าบางรายการมีรูปแบบฟิลด์ไม่ตรงกับ schema ปัจจุบันเป๊ะๆ
// (เช่น tags เคยเก็บเป็น string ธรรมดา) ซึ่งถ้าโหลดเป็น Mongoose Document เต็มรูปแบบ
// (ไม่ใส่ .lean()) Mongoose จะ cast ทุกฟิลด์ทันทีและโยน CastError ทำให้แก้ไขเรื่องเก่าๆ ไม่ได้เลย
// .lean() คืนค่าเป็น plain object ตรงๆ จาก MongoDB โดยไม่ผ่านการ cast จุดนี้ จึงโหลดได้เสมอ
async function findMangaDoc(id) {
    if (typeof id !== 'string' || !id || id.length > 64) return null;
    if (isObjectId(id)) {
        const byId = await Manga.findById(id).lean();
        if (byId) return byId;
    }
    return Manga.findOne({ id }).lean();
}

const STR_FIELDS = {
    title: 200, th_name: 200, en_name: 200, jp_name: 200, description: 5000,
    rating: 20, author: 200, artist: 200, translator: 200
};
const URL_FIELDS = [
    'cover', 'translator_link', 'thai_url', 'thai_url_Buy', 'eng_url', 'eng_url_Buy',
    'original_url', 'original_url_Buy', 'facebook_post_url'
];

// รับเฉพาะฟิลด์ที่กำหนด (กัน mass-assignment) และบังคับให้ลิงก์เป็น http/https เท่านั้น (กัน javascript: XSS)
function cleanMangaInput(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'ข้อมูลไม่ถูกต้อง' };
    const out = {};

    for (const [key, max] of Object.entries(STR_FIELDS)) {
        const v = body[key];
        if (v === undefined || v === null || v === '') { out[key] = ''; continue; }
        if (typeof v !== 'string' || v.length > max) return { error: `ช่อง ${key} ไม่ถูกต้องหรือยาวเกินไป` };
        out[key] = v.trim();
    }

    for (const key of URL_FIELDS) {
        const v = body[key];
        if (v === undefined || v === null || v === '') { out[key] = ''; continue; }
        if (typeof v !== 'string' || v.length > 2048) return { error: `ลิงก์ ${key} ไม่ถูกต้อง` };
        const u = parseHttpUrl(v.trim());
        if (!u) return { error: `ลิงก์ ${key} ต้องขึ้นต้นด้วย http:// หรือ https://` };
        out[key] = u.href;
    }

    const tags = body.tags === undefined ? [] : body.tags;
    if (!Array.isArray(tags) || tags.length > 30 || tags.some(t => typeof t !== 'string' || t.length > 40)) {
        return { error: 'แท็กไม่ถูกต้อง (สูงสุด 30 แท็ก แท็กละไม่เกิน 40 ตัวอักษร)' };
    }
    out.tags = [...new Set(tags.map(t => t.trim()).filter(Boolean))];

    // ลิงก์ Facebook รายตอน — แถวที่ไม่มี url ถูกข้าม (ผู้ใช้อาจเว้นแถวว่างไว้ระหว่างกรอก)
    const rawChapters = body.chapters === undefined ? [] : body.chapters;
    if (!Array.isArray(rawChapters) || rawChapters.length > 1000) {
        return { error: 'รายการตอนไม่ถูกต้อง (สูงสุด 1000 ตอน)' };
    }
    const chapters = [];        
    for (const ch of rawChapters) {
        if (!ch || typeof ch !== 'object' || Array.isArray(ch)) return { error: 'ข้อมูลรายการตอนไม่ถูกต้อง' };
        const rawUrl = typeof ch.url === 'string' ? ch.url.trim() : '';
        if (!rawUrl) continue;
        if (rawUrl.length > 2048) return { error: 'ลิงก์ตอนยาวเกินไป' };
        const u = parseHttpUrl(rawUrl);
        if (!u) return { error: 'ลิงก์ตอน "' + rawUrl.slice(0, 60) + '" ต้องขึ้นต้นด้วย http:// หรือ https://' };
        const label = typeof ch.label === 'string' ? ch.label.trim().slice(0, 100) : '';
        chapters.push({ label, url: u.href });
    }
    out.chapters = chapters;

    if (!out.th_name) return { error: 'กรุณากรอกชื่อภาษาไทย' };
    out.title = out.title || out.th_name;
    out.updated_at = new Date().toISOString();
    return { data: out };
}

// ==========================================
// 6. API Routes
// ==========================================
app.get('/ping', (req, res) => res.status(200).send('OK'));

// --- Auth ---
// เข้าสู่ระบบด้วยชื่อผู้ใช้ "หรือ" อีเมลที่ผูกไว้ + รหัสผ่าน
app.post('/login', loginLimiter, wrap(async (req, res) => {
    const { identifier, password } = req.body || {};
    if (typeof identifier !== 'string' || typeof password !== 'string' ||
        !identifier || identifier.length > 254 || !password || password.length > 128) {
        return res.status(400).json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' });
    }

    const id = identifier.trim();
    const user = await User.findOne({ $or: [{ username: id }, { email: id.toLowerCase() }] }).select('+password username role favorites tokenVersion');
    // เทียบ hash เสมอแม้ไม่พบผู้ใช้หรือบัญชีนี้ไม่มีรหัสผ่าน (เช่นสมัครด้วย Google ล้วนๆ) เพื่อไม่ให้เดาบัญชีได้จากเวลาตอบสนอง
    const ok = await bcrypt.compare(password, (user && user.password) ? user.password : DUMMY_HASH);
    if (!user || !user.password || !ok) {
        return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้/อีเมล หรือรหัสผ่านไม่ถูกต้อง' });
    }

    issueSession(req, res, user);
    res.json({ success: true, username: user.username, role: user.role });
}));

// สมัครสมาชิกด้วยตัวเอง — ชื่อผู้ใช้ + อีเมล (ไว้ใช้ล็อกอิน/รีเซ็ตรหัสผ่าน) + รหัสผ่าน
app.post('/register', registerLimiter, wrap(async (req, res) => {
    const { username, email, password } = req.body || {};
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
        return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้ต้องมี 3-32 ตัวอักษร (a-z, A-Z, 0-9, _ เท่านั้น)' });
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) {
        return res.status(400).json({ success: false, message: 'อีเมลไม่ถูกต้อง' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return res.status(400).json({ success: false, message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
    }

    const normEmail = email.trim().toLowerCase();
    const exists = await User.findOne({ $or: [{ username }, { email: normEmail }] }).select('_id');
    if (exists) return res.status(409).json({ success: false, message: 'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้แล้ว' });

    const hash = await bcrypt.hash(password, BCRYPT_COST);
    const user = await User.create({ username, email: normEmail, password: hash, role: 'user' });
    issueSession(req, res, user);
    res.status(201).json({ success: true, username: user.username, role: user.role });
}));

app.post('/api/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, cookieOptions(req));
    res.json({ success: true });
});

app.get('/api/me', loadUser, (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user) return res.json({ loggedIn: false });
    res.json({
        loggedIn: true,
        username: req.user.username,
        role: req.user.role,
        favorites: req.user.favorites || []
    });
});

// --- ลืมรหัสผ่าน ---
// ตอบข้อความกลางๆ เหมือนกันไม่ว่าจะพบอีเมลในระบบหรือไม่ เพื่อกันการสุ่มเช็คว่าอีเมลไหนสมัครไว้บ้าง (enumeration)
const FORGOT_GENERIC_MSG = 'ถ้าอีเมลนี้มีอยู่ในระบบ เราได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้แล้ว (เช็คกล่องสแปมด้วยถ้าไม่เจอ)';
app.post('/api/forgot-password', forgotLimiter, wrap(async (req, res) => {
    const { email } = req.body || {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) {
        return res.status(400).json({ success: false, message: 'อีเมลไม่ถูกต้อง' });
    }
    const normEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normEmail }).select('_id');
    if (user) {
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        await User.updateOne({ _id: user._id }, {
            $set: { resetTokenHash: tokenHash, resetTokenExpires: new Date(Date.now() + 60 * 60 * 1000) }
        });
        const resetUrl = `${req.protocol}://${req.get('host')}/reset-password?token=${token}`;
        sendResetEmail(normEmail, resetUrl).catch(err => console.error('❌ ส่งอีเมลรีเซ็ตรหัสผ่านไม่สำเร็จ:', err.message));
    }
    res.json({ success: true, message: FORGOT_GENERIC_MSG });
}));

app.post('/api/reset-password', resetLimiter, wrap(async (req, res) => {
    const { token, password } = req.body || {};
    if (typeof token !== 'string' || !token || token.length > 256) {
        return res.status(400).json({ success: false, message: 'ลิงก์ไม่ถูกต้องหรือหมดอายุ' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return res.status(400).json({ success: false, message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({ resetTokenHash: tokenHash, resetTokenExpires: { $gt: new Date() } }).select('+resetTokenHash +resetTokenExpires');
    if (!user) return res.status(400).json({ success: false, message: 'ลิงก์ไม่ถูกต้องหรือหมดอายุ กรุณาขอลิงก์ใหม่' });

    user.password = await bcrypt.hash(password, BCRYPT_COST);
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // ตัด session เก่าทั้งหมดทิ้งหลังเปลี่ยนรหัสผ่าน
    await user.save();
    res.json({ success: true, message: 'ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว เข้าสู่ระบบได้เลย' });
}));

// --- เข้าสู่ระบบ/สมัครด้วย Google (Authorization Code flow ฝั่งเซิร์ฟเวอร์ ไม่ต้องโหลดสคริปต์จาก Google
//     จึงไม่ต้องผ่อน CSP — ปลอดภัยกว่าและเข้ากับนโยบาย "ไม่มี inline script / CDN ภายนอก" ของเว็บนี้) ---
app.get('/auth/google', googleLimiter, (req, res) => {
    if (!GOOGLE_ENABLED) return res.status(404).type('text').send('ยังไม่ได้เปิดใช้งานการเข้าสู่ระบบด้วย Google');
    const state = crypto.randomBytes(24).toString('hex');
    const next = MC_safeNext(req.query.next);
    res.cookie(OAUTH_COOKIE, JSON.stringify({ state, next }), oauthCookieOptions(req));

    const redirectUri = googleRedirectUri(req);
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + querystring.stringify({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        prompt: 'select_account'
    });
    res.redirect(authUrl);
});

app.get('/auth/google/callback', googleLimiter, wrap(async (req, res) => {
    const fail = (why) => { console.warn('⚠️ Google OAuth ล้มเหลว:', why); res.clearCookie(OAUTH_COOKIE, { path: '/' }); return res.redirect('/login?error=google'); };
    if (!GOOGLE_ENABLED) return fail('not-enabled');

    let saved = {};
    try { saved = JSON.parse(req.cookies && req.cookies[OAUTH_COOKIE] || '{}'); } catch (e) { /* ignore */ }
    res.clearCookie(OAUTH_COOKIE, { path: '/' });

    const { code, state } = req.query || {};
    if (typeof code !== 'string' || typeof state !== 'string' || !saved.state || state !== saved.state) {
        return fail('state-mismatch');
    }

    let tokenRes;
    try {
        tokenRes = await httpsPostForm('oauth2.googleapis.com', '/token', {
            code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: googleRedirectUri(req), grant_type: 'authorization_code'
        });
    } catch (e) { return fail('token-exchange: ' + e.message); }
    if (tokenRes.status !== 200 || !tokenRes.body || !tokenRes.body.id_token) return fail('no-id-token');

    let payload;
    try { payload = decodeJwtPayloadUnsafe(tokenRes.body.id_token); } catch (e) { return fail('bad-id-token'); }

    const validIss = payload.iss === 'accounts.google.com' || payload.iss === 'https://accounts.google.com';
    if (!validIss || payload.aud !== GOOGLE_CLIENT_ID || !payload.exp || payload.exp * 1000 < Date.now()) {
        return fail('invalid-claims');
    }
    if (!payload.sub || !payload.email || payload.email_verified !== true) return fail('email-not-verified');

    const googleId = String(payload.sub);
    const email = String(payload.email).toLowerCase();

    let user = await User.findOne({ googleId }).select('username role tokenVersion');
    if (!user) {
        // ผูกเข้ากับบัญชีเดิมถ้าอีเมลตรงกัน (และ Google ยืนยันแล้วว่าเป็นเจ้าของอีเมลจริง) ไม่งั้นสร้างบัญชีใหม่
        user = await User.findOne({ email }).select('username role tokenVersion');
        if (user) {
            user.googleId = googleId;
            await user.save();
        } else {
            const username = await uniqueUsernameFromEmail(email);
            user = await User.create({ username, email, googleId, role: 'user' });
        }
    }

    issueSession(req, res, user);
    res.redirect(MC_safeNext(saved.next));
}));

// --- Manga (อ่านได้ทุกคน / แก้ไขได้เฉพาะแอดมิน) ---
const LIST_FIELDS = '_id id title th_name en_name jp_name cover author tags rating';

app.get('/manga', wrap(async (req, res) => {
    res.json(await Manga.find().select(LIST_FIELDS).sort({ _id: -1 }).lean());
}));

app.get('/api/manga/:id', wrap(async (req, res) => {
    const manga = await findMangaDoc(req.params.id);
    if (!manga) return res.status(404).json({ message: 'ไม่พบมังงะ' });
    res.json(manga);
}));

app.post('/add', requireAdmin, wrap(async (req, res) => {
    const { data, error } = cleanMangaInput(req.body);
    if (error) return res.status(400).json({ message: error });
    const manga = await Manga.create({ ...data, id: Date.now().toString() });
    res.status(201).json({ message: 'เพิ่มสำเร็จ!', id: String(manga._id) });
}));

app.put('/api/manga/:id', requireAdmin, wrap(async (req, res) => {
    const { data, error } = cleanMangaInput(req.body);
    if (error) return res.status(400).json({ message: error });
    const manga = await findMangaDoc(req.params.id);
    if (!manga) return res.status(404).json({ message: 'ไม่พบมังงะที่ต้องการแก้ไข' });

    // อัปเดตแบบ atomic ด้วย findByIdAndUpdate แทนการโหลดทั้งเอกสารมา .save()
    // เพราะการโหลดทั้งเอกสาร (hydrate) จะ cast ทุกฟิลด์รวมถึงฟิลด์เก่าที่ไม่ได้แก้ไขด้วย
    // ถ้าเรื่องนั้นมีฟิลด์เก่าที่รูปแบบไม่ตรง schema ปัจจุบันจะ save ไม่ผ่านทั้งที่ข้อมูลใหม่ถูกต้องดี
    // วิธีนี้ validate เฉพาะฟิลด์ที่กำลังแก้ไขจริงๆ เท่านั้น
    const updated = await Manga.findByIdAndUpdate(
        manga._id, { $set: data }, { new: true, runValidators: true, context: 'query' }
    ).lean();
    res.json({ message: 'อัปเดตเรียบร้อย!', data: updated });
}));

app.delete('/delete/:id', requireAdmin, wrap(async (req, res) => {
    const manga = await findMangaDoc(req.params.id);
    if (!manga) return res.status(404).json({ message: 'ไม่พบข้อมูลที่ต้องการลบ' });
    await Manga.deleteOne({ _id: manga._id });
    res.json({ message: 'ลบข้อมูลเรียบร้อยแล้ว!' });
}));

// --- Favorites (ผูกกับบัญชีที่ล็อกอินเท่านั้น ไม่รับ username จากผู้ใช้อีกต่อไป) ---
app.get('/api/favorites', requireAuth, wrap(async (req, res) => {
    const favs = req.user.favorites || [];
    const objectIds = favs.filter(isObjectId);
    const [byObjectId, byLegacyId] = await Promise.all([
        Manga.find({ _id: trusted({ $in: objectIds }) }).select(LIST_FIELDS).lean(),
        Manga.find({ id: trusted({ $in: favs }) }).select(LIST_FIELDS).lean()
    ]);
    const seen = new Set();
    const list = [...byObjectId, ...byLegacyId].filter(m => !seen.has(String(m._id)) && seen.add(String(m._id)));
    res.json(list);
}));

app.post('/favorite', requireAuth, wrap(async (req, res) => {
    const { mangaId } = req.body || {};
    if (typeof mangaId !== 'string' || !mangaId || mangaId.length > 64) {
        return res.status(400).json({ message: 'ข้อมูลไม่ถูกต้อง' });
    }
    const manga = await findMangaDoc(mangaId);
    if (!manga) return res.status(404).json({ message: 'ไม่พบมังงะ' });

    // รองรับรายการโปรดเดิมที่เคยเก็บเป็น id แบบเก่า
    const keys = [String(manga._id), manga.id].filter(Boolean);
    const current = req.user.favorites || [];
    const has = current.some(f => keys.includes(f));
    if (!has && current.length >= 500) return res.status(400).json({ message: 'รายการโปรดเต็มแล้ว' });

    const updated = await User.findByIdAndUpdate(
        req.user._id,
        has ? { $pull: { favorites: { $in: keys } } } : { $addToSet: { favorites: String(manga._id) } },
        { new: true }
    ).select('favorites');
    res.json({ success: true, favorites: updated.favorites });
}));

// (ลบ /api/scrape-chapters, /api/fetch-chapters, /api/fetch-images, /api/proxy-reader ออกทั้งหมด:
//  ฟีเจอร์ดึงรายการตอนถูกปิดใช้งานที่ฝั่งหน้าเว็บแล้ว จึงตัดโค้ด scraper/SSRF-guard ที่มีแต่ endpoint พวกนี้เรียกใช้ออกไปด้วย
//  เพื่อลดขนาดเซิร์ฟเวอร์และพื้นที่เสี่ยง — ถ้าจะกลับมาทำ ต้องเขียนระบบดึงข้อมูล + whitelist โดเมนใหม่)

// ==========================================
// 7. Pages
// ==========================================
const PAGES = new Set(['index', 'admin', 'detail', 'favorites', 'login', 'register', 'forgot-password', 'reset-password', 'about']);

const sendPage = (page) => (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, `${page}.html`));
};

app.get('/', sendPage('index'));
app.get('/:page', (req, res, next) => {
    const page = req.params.page.replace(/\.html$/, '');
    if (!PAGES.has(page)) return next();
    sendPage(page)(req, res);
});

// ==========================================
// 8. 404 / Error handling
// ==========================================
app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ message: 'Not found' });
    res.status(404).type('text').send('ไม่พบหน้านี้ (404)');
});

app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === 'entity.too.large' || err.status === 413) {
        return res.status(413).json({ message: 'ข้อมูลที่ส่งมาใหญ่เกินไป กรุณาแบ่งนำเข้ารายการตอนเป็นชุดย่อยกว่านี้' });
    }
    if (err.status === 400 || err.type === 'entity.parse.failed') {
        return res.status(400).json({ message: 'ข้อมูลไม่ถูกต้อง' });
    }
    // ข้อมูลที่บันทึกไม่ผ่าน validation ของ Mongoose (เช่นเอกสารเก่าที่มีรูปแบบฟิลด์ไม่ตรง schema ปัจจุบัน)
    // ส่งเหตุผลจริงกลับไป แทนข้อความกลางๆ เพื่อให้แก้ไขได้ตรงจุดแทนที่จะเจอ error ที่ไม่รู้สาเหตุ
    if (err.name === 'ValidationError' || err.name === 'CastError' || err.name === 'VersionError') {
        console.error('❌ Data error:', err.message);
        return res.status(400).json({ message: 'บันทึกไม่สำเร็จ: ข้อมูลเดิมของเรื่องนี้มีรูปแบบไม่ตรงกับระบบปัจจุบัน (' + err.message + ')' });
    }
    console.error('❌', err.message); // ไม่ส่งรายละเอียดข้อผิดพลาดกลับไปให้ผู้ใช้
    res.status(500).json({ message: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
});

process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server is running on port ${PORT}`));
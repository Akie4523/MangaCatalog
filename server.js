'use strict';
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

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

// บัญชีที่เป็นแอดมิน (คั่นด้วยจุลภาค) เช่น ADMIN_USERNAMES=owner,editor
const ADMIN_USERNAMES = (process.env.ADMIN_USERNAMES || '').split(',').map(s => s.trim()).filter(Boolean);

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

app.use(express.json({ limit: '32kb' }));
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
    updated_at: String
}));

const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    favorites: { type: [String], default: [] }
}));

const BCRYPT_RE = /^\$2[aby]\$/;
const DUMMY_HASH = bcrypt.hashSync('timing-attack-dummy', 12);

// รันตอนเริ่มระบบ: เข้ารหัสรหัสผ่านที่ยังเป็น plaintext + ตั้งสิทธิ์แอดมินตาม ADMIN_USERNAMES
async function migrateUsers() {
    const users = await User.find();
    let hashed = 0;
    for (const u of users) {
        if (!BCRYPT_RE.test(u.password)) {
            u.password = await bcrypt.hash(u.password, 12);
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
            const user = await User.findById(payload.id).select('username role favorites');
            if (user) req.user = user;
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
app.post('/login', loginLimiter, wrap(async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' ||
        !username || username.length > 64 || !password || password.length > 128) {
        return res.status(400).json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' });
    }

    const user = await User.findOne({ username });
    // เทียบ hash เสมอ แม้ไม่พบผู้ใช้ เพื่อไม่ให้เดาชื่อบัญชีจากเวลาตอบสนอง
    const ok = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
    if (!user || !ok) {
        return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    const token = jwt.sign({ id: String(user._id) }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' });
    res.cookie(COOKIE_NAME, token, { ...cookieOptions(req), maxAge: SESSION_MS });
    res.json({ success: true, username: user.username, role: user.role });
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
const PAGES = new Set(['index', 'admin', 'detail', 'favorites', 'login', 'about']);

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

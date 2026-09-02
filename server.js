require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { URL } = require('url');


// ==========================================
// 1. Discord Bot System
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
// 2. Express App & Middleware
// ==========================================
const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static(__dirname));

// ==========================================
// 3. Database Connection & Schemas
// ==========================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch(err => console.error("❌ MongoDB Error:", err));

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
    facebook_post_url: { type: String, default: "" },
    updated_at: String
}));

const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    favorites: [String]
}));

// Auth Middleware (ตรวจ JWT Token แทน SECRET_TOKEN แบบเดิม)
const auth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && (authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader);
    
    // ยอมรับ Fallback TOKEN เดิมชั่วคราวเผื่อระบบเก่ายังไม่เปลี่ยน
    if (token === process.env.SECRET_TOKEN) return next();

    if (!token) return res.status(401).json({ message: "Unauthorized: กรุณาเข้าสู่ระบบ" });

    jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key', (err, user) => {
        if (err) return res.status(403).json({ message: "Forbidden: Token ไม่ถูกต้องหรือหมดอายุ" });
        req.user = user;
        next();
    });
};

// ==========================================
// 4. Scraper Config & Whitelist
// ==========================================
const GAS_URL = "https://script.google.com/macros/s/AKfycbxlIEynv1arhgGRxg4t2VgxZ9zvpzJEuStUWHPHrE4m9qiWhuA8Kx4hC37I2oFh4dL7/exec";

const isWhitelisted = (url) => {
    try {
        const domain = new URL(url).hostname;
        const allowed = ['fluxtoon.com', 'mangaisekaithai.net', 'facebook.com', 'nekopost.net'];
        return allowed.some(d => domain.includes(d));
    } catch (e) { return false; }
};

// ==========================================
// 5. API Routes
// ==========================================
app.get("/ping", (req, res) => res.status(200).send("OK"));

// Login Route (รองรับทั้ง Bcrypt และ Plaintext เดิม)
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ success: false, message: "ข้อมูลไม่ถูกต้อง" });
    }

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ success: false, message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        const isPlainMatch = user.password === password; // รองรับรหัสผ่านเดิมที่ยังไม่ได้ hash

        if (!isMatch && !isPlainMatch) {
            return res.status(401).json({ success: false, message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
        }

        const token = jwt.sign(
            { id: user._id, username: user.username },
            process.env.JWT_SECRET || 'fallback_secret_key',
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token: token,
            username: user.username,
            favorites: user.favorites
        });
    } catch (e) { 
        res.status(500).json({ message: "Server Error: " + e.message }); 
    }
});

// Manga CRUD Routes
app.get("/manga", async (req, res) => {
    const mangas = await Manga.find().sort({ _id: -1 }); 
    res.json(mangas);
});

app.get("/api/manga/:id", async (req, res) => {
    try {
        const { id } = req.params;
        let manga = await Manga.findById(id).catch(() => null);
        if (!manga) manga = await Manga.findOne({ id: id });
        if (!manga) return res.status(404).json({ message: "ไม่พบมังงะ" });
        res.json(manga);
    } catch (err) { res.status(500).json({ message: "Error fetching manga" }); }
});

app.post("/add", auth, async (req, res) => {
    try {
        const mangaData = req.body;
        if (!mangaData.id) mangaData.id = Date.now().toString();
        const newManga = new Manga(mangaData);
        await newManga.save();
        res.json({ message: "เพิ่มสำเร็จ!" });
    } catch (err) { res.status(500).json({ message: "ไม่สามารถเพิ่มข้อมูลได้", error: err.message }); }
});

app.delete("/delete/:id", auth, async (req, res) => {
    try {
        const { id } = req.params;
        let result = await Manga.findByIdAndDelete(id).catch(() => null);
        if (!result) result = await Manga.deleteOne({ id: id });
        if (result.deletedCount === 0 && !result._id) return res.status(404).json({ message: "ไม่พบข้อมูลที่ต้องการลบ" });
        res.json({ message: "ลบข้อมูลเรียบร้อยแล้ว!" });
    } catch (err) { res.status(500).json({ message: "เกิดข้อผิดพลาดในการลบ" }); }
});

app.put('/api/manga/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const updatedData = req.body;
        let result = await Manga.findByIdAndUpdate(id, updatedData, { new: true }).catch(() => null);
        if (!result) result = await Manga.findOneAndUpdate({ id: id }, updatedData, { new: true });
        if (!result) return res.status(404).json({ message: "ไม่พบมังงะที่ต้องการแก้ไข" });
        res.status(200).json({ message: "อัปเดตเรียบร้อย!", data: result });
    } catch (err) { res.status(500).json({ message: "เกิดข้อผิดพลาดในการอัปเดต" }); }
});

app.post("/favorite", auth, async (req, res) => {
    const { username, mangaId } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).send("User not found");
    const index = user.favorites.indexOf(mangaId);
    if (index === -1) user.favorites.push(mangaId);
    else user.favorites.splice(index, 1);
    await user.save();
    res.json({ success: true, favorites: user.favorites });
});

// Scraper Routes
app.get('/api/fetch-chapters', async (req, res) => {
    const { url } = req.query;
    if (!isWhitelisted(url)) return res.status(403).json({ error: "Access Denied" });

    try {
        console.log(`📡 Fetching via GAS: ${url}`);
        
        const response = await axios.get(GAS_URL, {
            params: { url: url },
            timeout: 30000,
            maxRedirects: 5
        });

        const html = response.data;

        if (typeof html !== 'string' || html.startsWith("Error:")) {
            console.error("⚠️ GAS Side Error:", html);
            return res.json({ success: false, targetUrl: url, message: html });
        }

        const $ = cheerio.load(html);
        const chapters = [];

        $('.wp-manga-chapter a, .listing-chapters_wrap a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            if (href && text && /\d+/.test(text)) {
                chapters.push({ title: text, url: href });
            }
        });

        if (chapters.length === 0) {
            $('a').each((i, el) => {
                const href = $(el).attr('href') || "";
                const text = $(el).text().trim();
                if (href.includes('/chapter-') || href.includes('/ตอนที่-')) {
                   chapters.push({ title: text || href.split('/').pop(), url: href });
                }
            });
        }

        const uniqueChapters = chapters.filter((v, i, a) => a.findIndex(t => t.url === v.url) === i);
        console.log(`✅ ดึงสำเร็จ: ${uniqueChapters.length} ตอน`);
        res.json({ success: true, chapters: uniqueChapters });

    } catch (err) {
        console.error("❌ Node Server Error:", err.message);
        res.json({ success: false, targetUrl: url });
    }
});

app.get('/api/fetch-images', async (req, res) => {
    const { url } = req.query;
    if (!isWhitelisted(url)) return res.status(403).json({ error: "Access Denied" });

    try {
        console.log(`📡 Fetching Images via GAS: ${url}`);
        const response = await axios.get(`${GAS_URL}?url=${encodeURIComponent(url)}`);
        const html = response.data;

        const $ = cheerio.load(html);
        const images = [];

        $('.reading-content img, #readerarea img, .page-break img, .wp-manga-chapter-img').each((i, el) => {
            const src = $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('src');
            if (src && src.startsWith('http')) {
                images.push(src.trim());
            }
        });

        console.log(`✅ ดึงรูปสำเร็จ: ${images.length} รูป`);
        res.json({ success: true, images });
    } catch (err) {
        console.error("❌ Image Fetch Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 6. Helper Functions & Scraper API Routes
// ==========================================

// ฟังก์ชันดึงเลขตอนและชื่อตอนอย่างแม่นยำ (แก้ปัญหาจับโดนปี 2025/2026)
function extractChapterData($, el, baseUrl, chapters) {
    const $el = $(el);
    let href = $el.attr('href');
    if (!href || href === '#' || href.startsWith('javascript:')) return;

    try { href = new URL(href, baseUrl).href; } catch (e) { return; }

    let rawText = $el.text().replace(/\s+/g, ' ').trim();
    if (!rawText) rawText = $el.find('span, p, div').first().text().replace(/\s+/g, ' ').trim();

    // 1. ตัดเลขปี ค.ศ./พ.ศ. ออกจากข้อความเพื่อไม่ให้สับสน
    let cleanText = rawText.replace(/\b(19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/g, '')
                           .replace(/\b\d{1,2}[-/.]\d{1,2}[-/.](19|20)\d{2}\b/g, '');

    // 2. จับเลขตอน (ไทย / อังกฤษ / ญี่ปุ่น)
    let chapterNo = null;
    const match = cleanText.match(/(?:ตอนที่|ตอน|ch|chapter|ep|episode|\#|第)\s*([\d\.]+)/i) || 
                  cleanText.match(/([\d\.]+)\s*(?:話|ตอน)/i);

    if (match) {
        chapterNo = parseFloat(match[1]);
    } else {
        const urlMatch = href.match(/(?:chapter|ep|episode|ตอน|content|project)[^\d]*([\d\.]+)/i);
        if (urlMatch) chapterNo = parseFloat(urlMatch[1]);
    }

    if (rawText && rawText.length < 120 && !chapters.some(c => c.url === href)) {
        chapters.push({
            title: rawText,
            url: href,
            chapterNo: chapterNo !== null && !isNaN(chapterNo) ? chapterNo : 0
        });
    }
}

// Scraper API Main Endpoint
app.get('/api/scrape-chapters', async (req, res) => {
    const { targetUrl } = req.query;
    if (!targetUrl) return res.status(400).json({ success: false, error: 'กรุณาระบุ targetUrl' });

    try {
        let chapters = [];

        // --- A. กรณี Nekopost ---
        if (targetUrl.includes('nekopost.net')) {
            const match = targetUrl.match(/(?:project|manga)\/(\d+)/);
            if (match) {
                const projectId = match[1];
                try {
                    const apiRes = await axios.get(`https://www.nekopost.net/api/project/get/${projectId}`, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                            'Referer': 'https://www.nekopost.net/',
                            'Origin': 'https://www.nekopost.net',
                            'Accept': 'application/json, text/plain, */*'
                        },
                        timeout: 10000
                    });

                    const rawData = apiRes.data;
                    const chapterList = rawData?.listChapter || rawData?.data?.listChapter || rawData?.chapterList || [];

                    if (Array.isArray(chapterList) && chapterList.length > 0) {
                        chapters = chapterList.map(item => {
                            const rawNo = item.cd || item.lc || item.chapterNo || item.chapterName || item.no || '0';
                            const chapterId = item.chapterId || item.cid || item.id;
                            return {
                                title: `ตอนที่ ${rawNo}`,
                                url: `https://www.nekopost.net/manga/${projectId}/${chapterId}`,
                                chapterNo: parseFloat(rawNo) || 0
                            };
                        });
                    }
                } catch (apiErr) {
                    // Fallback เมื่อ API หลักของ Nekopost ไม่ตอบสนอง
                    try {
                        const cdnRes = await axios.get(`https://info.nekopost.net/api/project/${projectId}`, {
                            headers: { 'User-Agent': 'Mozilla/5.0' }
                        });
                        const chapterList = cdnRes.data?.listChapter || [];
                        chapters = chapterList.map(item => ({
                            title: `ตอนที่ ${item.cd || item.chapterNo}`,
                            url: `https://www.nekopost.net/manga/${projectId}/${item.chapterId}`,
                            chapterNo: parseFloat(item.cd || item.chapterNo) || 0
                        }));
                    } catch (e) {}
                }
            }
        } 
        // --- B. กรณีเว็บทั่วไป + เว็บ Next.js/Toonary ---
        else {
            const response = await axios.get(targetUrl, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                timeout: 12000
            });

            const $ = cheerio.load(response.data);
            const baseUrl = new URL(targetUrl).origin;

            // 1. ดึงตอนจาก Next.js Script Tag (สำหรับเว็บ Toonary หรือเว็บ React)
            const nextDataScript = $('#__NEXT_DATA__').html();
            if (nextDataScript) {
                try {
                    const parsed = JSON.parse(nextDataScript);
                    const pageProps = parsed.props?.pageProps;
                    const rawChapters = pageProps?.chapters || pageProps?.manga?.chapters || pageProps?.data?.chapters || pageProps?.initialState?.chapters;

                    if (Array.isArray(rawChapters)) {
                        rawChapters.forEach(ch => {
                            const chNum = ch.chapter_number || ch.number || ch.no || ch.chapterNo;
                            const chSlug = ch.slug || ch.id;
                            if (chSlug) {
                                chapters.push({
                                    title: `ตอนที่ ${chNum}`,
                                    url: `${baseUrl}/content/${chSlug}`,
                                    chapterNo: parseFloat(chNum) || 0
                                });
                            }
                        });
                    }
                } catch (e) {}
            }

            // 2. ถ้าดึงจาก Next.js ไม่ได้ ให้ดึงผ่านแท็ก <a> ทั่วไป
            if (chapters.length === 0) {
                const selectors = [
                    '.wp-manga-chapter a', '.eplister ul li a', '.cl-item a',
                    '#chapterlist a', '.chapter-list a', '.listing-chapters_wrap a',
                    'a[class*="chapter"]', 'a[class*="episode"]'
                ];

                $(selectors.join(', ')).each((i, el) => {
                    extractChapterData($, el, baseUrl, chapters);
                });

                // Fallback สุดท้ายถ้าจับ Selector ไม่เจอ
                if (chapters.length === 0) {
                    $('a').each((i, el) => {
                        extractChapterData($, el, baseUrl, chapters);
                    });
                }
            }
        }

        // เรียงลำดับตอนจาก น้อยไปมาก (ตอนที่ 1 -> ตอนล่าสุด)
        chapters.sort((a, b) => a.chapterNo - b.chapterNo);

        // จัดฟอร์แมตชื่อตอนให้สะอาดสวยงาม
        const formattedChapters = chapters.map((c, index) => ({
            title: c.chapterNo > 0 ? `ตอนที่ ${c.chapterNo}` : (c.title || `ตอนที่ ${index + 1}`),
            url: c.url
        }));

        return res.json({
            success: true,
            count: formattedChapters.length,
            chapters: formattedChapters
        });

    } catch (err) {
        console.error('Scrape Error:', err.message);
        return res.status(500).json({
            success: false,
            error: 'ไม่สามารถดึงข้อมูลตอนได้',
            details: err.message
        });
    }
});

// ==========================================
// Ad-Block / Clean Web Reader Proxy
// ==========================================
app.get('/api/proxy-reader', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ success: false, message: "กรุณาระบุ URL" });

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': new URL(url).origin
            },
            timeout: 15000
        });

        const $ = cheerio.load(response.data);
        const baseUrl = new URL(url).origin;
        let images = [];

        // 1. ดึงจาก Next.js State (__NEXT_DATA__) แบบเจาะลึก
        const nextDataScript = $('#__NEXT_DATA__').html();
        if (nextDataScript) {
            try {
                const parsed = JSON.parse(nextDataScript);
                
                // ฟังก์ชันช่วยค้นหา array ของรูปภาพแบบ recursive
                const findImagesRecursive = (obj) => {
                    if (!obj || typeof obj !== 'object') return;
                    
                    for (const key in obj) {
                        if (Array.isArray(obj[key]) && obj[key].length > 0) {
                            const first = obj[key][0];
                            if (typeof first === 'string' && (first.includes('http') || first.startsWith('/'))) {
                                images = obj[key].map(img => new URL(img, baseUrl).href);
                                return;
                            } else if (first && typeof first === 'object' && (first.src || first.url)) {
                                images = obj[key].map(img => new URL(img.src || img.url, baseUrl).href);
                                return;
                            }
                        }
                        if (typeof obj[key] === 'object') {
                            findImagesRecursive(obj[key]);
                            if (images.length > 0) return;
                        }
                    }
                };

                findImagesRecursive(parsed.props);
            } catch (e) {
                console.error("NextData Parse Error:", e.message);
            }
        }

        // 2. ถ้า Next Data ไม่เจอ ให้ดึงผ่าน Image Selector HTML
        if (images.length === 0) {
            $('img').each((i, el) => {
                const src = $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('src');
                if (src) {
                    const cleanSrc = src.trim();
                    // กรองเอาเฉพาะรูปที่ไม่ใช่โลโก้ หรือรูปไอคอนทั่วไป
                    if (!cleanSrc.includes('logo') && !cleanSrc.includes('avatar') && !cleanSrc.includes('banner')) {
                        try {
                            images.push(new URL(cleanSrc, baseUrl).href);
                        } catch (e) {}
                    }
                }
            });
        }

        // ตัดรูปซ้ำออก
        images = [...new Set(images)];

        if (images.length === 0) {
            return res.status(404).json({ success: false, message: "ไม่พบรูปภาพในหน้านี้" });
        }

        return res.json({ success: true, images });

    } catch (err) {
        console.error("Proxy Reader Error:", err.message);
        return res.status(500).json({ 
            success: false, 
            message: "ไม่สามารถดึงรูปภาพได้", 
            error: err.message 
        });
    }
});

// ==========================================
//  7. Serving Frontend (Protected Page Router)
// ==========================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const ALLOWED_PAGES = ['index', 'admin', 'detail', 'favorites', 'login', 'about', 'chapters', 'reader'];

app.get('/:page', (req, res) => {
    let page = req.params.page.replace('.html', '');
    
    if (ALLOWED_PAGES.includes(page)) {
        return res.sendFile(path.join(__dirname, `${page}.html`), (err) => {
            if (err) res.status(404).send("ไม่พบหน้านี้ (404)");
        });
    }
    
    res.status(403).send("Access Denied");
});


// ==========================================
// 7. Start Server
// ==========================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
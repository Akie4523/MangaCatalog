/* MangaCatalog — ตัวช่วยกลางที่ทุกหน้าใช้ร่วมกัน
   โหลดใน <head> แบบ blocking เพื่อตั้งธีมก่อนวาดหน้า (ไม่ให้จอกะพริบ) */
(function () {
    'use strict';

    // ---------- Theme ----------
    var root = document.documentElement;
    var theme = null;
    try { theme = localStorage.getItem('theme'); } catch (e) { /* ignore */ }
    if (theme !== 'light' && theme !== 'dark') {
        theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    root.dataset.theme = theme;

    // ---------- Helpers ----------
    var $ = function (sel, scope) { return (scope || document).querySelector(sel); };
    var $$ = function (sel, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(sel)); };

    var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    // escape ข้อความก่อนใส่ลง innerHTML ทุกครั้ง
    function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }

    // อนุญาตเฉพาะลิงก์ http/https (กัน javascript: / data:) — คืนค่าว่างถ้าไม่ปลอดภัย
    function safeUrl(v, base) {
        try {
            var u = new URL(String(v || '').trim(), base);
            return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
        } catch (e) { return ''; }
    }

    // ใช้กับพารามิเตอร์ ?next= : รับเฉพาะพาธภายในเว็บ
    function safeNext(n) { return (typeof n === 'string' && /^\/(?![\/\\])/.test(n)) ? n : '/'; }

    function debounce(fn, ms) {
        var t;
        return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); };
    }

    function api(path, opts) {
        opts = opts || {};
        var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
        if (opts.body !== undefined) {
            init.headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(opts.body);
        }
        return fetch(path, init).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                return { ok: res.ok, status: res.status, data: data || {} };
            });
        }).catch(function () {
            return { ok: false, status: 0, data: { message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง' } };
        });
    }

    var mePromise = null;
    function me(force) {
        if (force || !mePromise) {
            mePromise = api('/api/me').then(function (r) {
                return (r.ok && r.data.loggedIn) ? r.data : { loggedIn: false, favorites: [] };
            });
        }
        return mePromise;
    }

    function toast(msg, kind) {
        var box = document.getElementById('toasts');
        if (!box) {
            box = document.createElement('div');
            box.id = 'toasts';
            box.className = 'toasts';
            box.setAttribute('aria-live', 'polite');
            document.body.appendChild(box);
        }
        var t = document.createElement('div');
        t.className = 'toast';
        t.dataset.kind = kind || 'ok';
        t.textContent = msg;
        box.appendChild(t);
        setTimeout(function () { t.remove(); }, 4000);
    }

    // ---------- Icons (inline SVG — ไม่พึ่ง CDN) ----------
    var ICONS = {
        logo: '<rect x="3" y="3" width="8" height="18" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect class="logo-accent" x="13" y="13" width="8" height="8" rx="1.5"/>',
        heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
        search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
        moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>',
        user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>',
        external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
        book: '<path d="M3 5.5C5 4.5 8.5 4.5 12 6.5c3.5-2 7-2 9-1V19c-2-1-5.5-1-9 1-3.5-2-7-2-9-1Z"/><path d="M12 6.5V20"/>',
        cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2.5l2.2 10.5a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L20 8H6.2"/>',
        back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
        edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
        trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
        star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8L12 3.5Z"/>',
        copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
        lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 8l-4 4 4 4M6 12h11"/>',
        shield: '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z"/>',
        eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
        tools: '<path d="M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5 2.5-2.5Z"/>'
    };
    function icon(name, cls) {
        return '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICONS[name] || '') + '</svg>';
    }

    // ---------- Shared components ----------
    function isFav(user, m) {
        var f = (user && user.favorites) || [];
        return f.indexOf(String(m._id)) !== -1 || (!!m.id && f.indexOf(String(m.id)) !== -1);
    }

    function bookCard(m, faved) {
        var id = m._id || m.id;
        var name = m.th_name || m.title || 'ไม่มีชื่อ';
        var cover = safeUrl(m.cover);
        var label = (faved ? 'เอาออกจากรายการโปรด: ' : 'เพิ่มในรายการโปรด: ') + name;
        return '<article class="book">' +
            '<a class="book-link" href="/detail?id=' + encodeURIComponent(id) + '">' +
                '<span class="cover">' + (cover ? '<img src="' + esc(cover) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '') + '</span>' +
                '<span class="book-title">' + esc(name) + '</span>' +
                '<span class="book-by">' + esc(m.author || 'ไม่ระบุผู้แต่ง') + '</span>' +
            '</a>' +
            '<button class="fav" type="button" data-fav="' + esc(id) + '" aria-pressed="' + (faved ? 'true' : 'false') + '" aria-label="' + esc(label) + '">' + icon('heart', 'i-heart') + '</button>' +
        '</article>';
    }

    // สลับรายการโปรด — ถ้ายังไม่ล็อกอินจะพาไปหน้าเข้าสู่ระบบ; คืนค่า Set ของรายการโปรดใหม่ หรือ null ถ้าไม่สำเร็จ
    function toggleFav(id) {
        return me().then(function (user) {
            if (!user.loggedIn) {
                location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search);
                return null;
            }
            return api('/favorite', { method: 'POST', body: { mangaId: String(id) } }).then(function (r) {
                if (!r.ok) { toast(r.data.message || 'บันทึกรายการโปรดไม่สำเร็จ', 'error'); return null; }
                user.favorites = r.data.favorites || [];
                return user;
            });
        });
    }

    function paintFav(btn, on) {
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        var label = btn.getAttribute('aria-label') || '';
        var name = label.replace(/^[^:]*:\s*/, '');
        btn.setAttribute('aria-label', (on ? 'เอาออกจากรายการโปรด: ' : 'เพิ่มในรายการโปรด: ') + name);
    }

    // ปกที่โหลดไม่ขึ้นให้แสดงข้อความแทนภาพเสีย
    document.addEventListener('error', function (e) {
        var t = e.target;
        if (t && t.tagName === 'IMG') {
            var c = t.closest && t.closest('.cover, .cover-preview, .thumb');
            if (c) { t.remove(); c.classList.add('broken'); }
        }
    }, true);

    // ---------- Chrome (header / footer) ----------
    function renderChrome() {
        var header = document.getElementById('site-header');
        if (header) {
            header.classList.add('bar');
            header.innerHTML =
                '<div class="wrap bar-in">' +
                    '<a class="brand" href="/">' + icon('logo') + '<span>MangaCatalog</span></a>' +
                    '<nav class="nav" aria-label="เมนูหลัก">' +
                        '<a class="navlink" href="/favorites">' + icon('heart') + '<span class="nav-t">รายการโปรด</span></a>' +
                        '<button class="navlink" id="theme-btn" type="button"></button>' +
                        '<div id="account"></div>' +
                    '</nav>' +
                '</div>';

            var btn = document.getElementById('theme-btn');
            var paintTheme = function () {
                var dark = root.dataset.theme === 'dark';
                btn.innerHTML = icon(dark ? 'sun' : 'moon');
                btn.setAttribute('aria-label', dark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด');
            };
            paintTheme();
            btn.addEventListener('click', function () {
                root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
                try { localStorage.setItem('theme', root.dataset.theme); } catch (e) { /* ignore */ }
                paintTheme();
            });

            var onLogin = location.pathname.replace(/\.html$/, '') === '/login';
            me().then(function (user) {
                var acct = document.getElementById('account');
                if (!acct) return;
                if (!user.loggedIn) {
                    acct.innerHTML = onLogin ? '' :
                        '<a class="btn btn-sm btn-primary" href="/login?next=' + encodeURIComponent(location.pathname + location.search) + '">เข้าสู่ระบบ</a>';
                    return;
                }
                acct.innerHTML =
                    '<details class="menu"><summary class="navlink" aria-label="เมนูบัญชี">' + icon('user') + '<span class="nav-t">' + esc(user.username) + '</span></summary>' +
                    '<div class="menu-pop">' +
                        (user.role === 'admin' ? '<a href="/admin">' + icon('shield') + 'จัดการมังงะ</a>' : '') +
                        '<button type="button" id="logout-btn">' + icon('logout') + 'ออกจากระบบ</button>' +
                    '</div></details>';
                document.getElementById('logout-btn').addEventListener('click', function () {
                    api('/api/logout', { method: 'POST' }).then(function () { location.href = '/'; });
                });
            });
        }

        var footer = document.getElementById('site-footer');
        if (footer) {
            footer.classList.add('foot');
            footer.innerHTML =
                '<div class="wrap foot-in">' +
                    '<span>MangaCatalog — ไดเรกทอรีลิงก์ ไม่มีการโฮสต์ภาพมังงะบนเว็บนี้</span>' +
                    '<a href="/about">เกี่ยวกับเรา / แจ้งลบลิงก์</a>' +
                '</div>';
        }

        // ปิดเมนูบัญชีเมื่อคลิกข้างนอกหรือกด Esc
        document.addEventListener('click', function (e) {
            $$('details.menu[open]').forEach(function (d) { if (!d.contains(e.target)) d.removeAttribute('open'); });
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') $$('details.menu[open]').forEach(function (d) { d.removeAttribute('open'); });
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderChrome);
    else renderChrome();

    window.MC = {
        $: $, $$: $$, esc: esc, safeUrl: safeUrl, safeNext: safeNext, debounce: debounce,
        api: api, me: me, toast: toast, icon: icon,
        isFav: isFav, bookCard: bookCard, toggleFav: toggleFav, paintFav: paintFav
    };
})();

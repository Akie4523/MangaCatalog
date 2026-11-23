(function () {
    'use strict';
    var MC = window.MC;
    var shelf = MC.$('#shelf');
    var tagsEl = MC.$('#tags');
    var typesEl = MC.$('#types');
    var countEl = MC.$('#count');
    var search = MC.$('#q');
    var filterBtn = MC.$('#filter-btn');
    var filterPanel = MC.$('#filter-panel');
    var filterN = MC.$('#filter-n');

    var all = [];
    var user = { loggedIn: false, favorites: [] };
    var params = new URLSearchParams(location.search);
    var activeTag = params.get('tag') || '';
    var activeType = params.get('type') === 'anime' || params.get('type') === 'manga' ? params.get('type') : '';
    search.value = params.get('q') || '';

    // ---------- Welcome dialog (แสดงครั้งแรกครั้งเดียว) ----------
    var dlg = MC.$('#welcome');
    try {
        if (!localStorage.getItem('hasVisitedMangaCatalog') && typeof dlg.showModal === 'function') dlg.showModal();
    } catch (e) { /* ignore */ }
    dlg.addEventListener('close', function () {
        try { localStorage.setItem('hasVisitedMangaCatalog', 'true'); } catch (e) { /* ignore */ }
    });
    MC.$('#welcome-ok').addEventListener('click', function () { dlg.close(); });

    // ---------- Filter panel (ซ่อนไว้ กดปุ่มเพื่อเปิด) ----------
    function setPanel(open) {
        filterPanel.classList.toggle('hide', !open);
        filterBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    filterBtn.addEventListener('click', function () { setPanel(filterPanel.classList.contains('hide')); });
    MC.$('#filter-clear').addEventListener('click', function () { activeTag = ''; renderTags(); render(); });

    // ---------- Render ----------
    function skeleton() {
        var one = '<div class="sk"><div class="sk-cover"></div><div class="sk-line"></div><div class="sk-line short"></div></div>';
        shelf.innerHTML = '<div class="shelf">' + new Array(12 + 1).join(one) + '</div>';
    }

    function inType(m) { return !activeType || MC.typeOf(m).key === activeType; }

    function renderTypes() {
        var n = { '': all.length, manga: 0, anime: 0 };
        all.forEach(function (m) { n[MC.typeOf(m).key]++; });
        var opts = [['', 'ทั้งหมด'], ['manga', 'มังงะ'], ['anime', 'อนิเมะ']];
        typesEl.innerHTML = opts.map(function (o) {
            return '<button class="seg-btn" type="button" role="tab" data-type="' + o[0] + '" data-k="' + (o[0] || 'all') + '" aria-selected="' + (activeType === o[0]) + '">' +
                MC.esc(o[1]) + '<span class="seg-n">' + n[o[0]] + '</span></button>';
        }).join('');
    }

    function renderTags() {
        var counts = {};
        all.filter(inType).forEach(function (m) { (m.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
        var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b, 'th'); });
        var chip = function (value, label) {
            return '<button class="chip" type="button" data-tag="' + MC.esc(value) + '" aria-pressed="' + (activeTag === value) + '">' + MC.esc(label) + '</button>';
        };
        tagsEl.innerHTML = chip('', 'ทั้งหมด') + names.map(function (t) { return chip(t, t); }).join('');
        filterN.textContent = activeTag ? '1' : '';
        filterN.classList.toggle('hide', !activeTag);
        filterBtn.classList.toggle('on', !!activeTag);
    }

    function matches(m, q) {
        if (!inType(m)) return false;
        if (activeTag && (m.tags || []).indexOf(activeTag) === -1) return false;
        if (!q) return true;
        return [m.th_name, m.title, m.en_name, m.jp_name, m.author].some(function (v) {
            return v && String(v).toLowerCase().indexOf(q) !== -1;
        });
    }

    function group(key, title, items, favs) {
        if (!items.length) return '';
        return '<section class="shelf-sec" data-k="' + key + '" aria-label="' + MC.esc(title) + '">' +
            '<div class="shelf-h"><h2>' + MC.esc(title) + '</h2><span class="shelf-n">' + items.length + ' เรื่อง</span></div>' +
            '<div class="shelf">' + items.map(function (m, i) { return MC.bookCard(m, favs(m), i); }).join('') + '</div></section>';
    }

    function render() {
        var q = search.value.trim().toLowerCase();
        var list = all.filter(function (m) { return matches(m, q); });

        var next = new URLSearchParams();
        if (activeType) next.set('type', activeType);
        if (activeTag) next.set('tag', activeTag);
        if (search.value.trim()) next.set('q', search.value.trim());
        history.replaceState(null, '', location.pathname + (next.toString() ? '?' + next : ''));

        var pool = all.filter(inType).length;
        var noun = activeType === 'anime' ? 'อนิเมะ' : activeType === 'manga' ? 'มังงะ' : 'มังงะและอนิเมะ';
        var text = (q || activeTag) ? 'พบ ' + list.length + ' เรื่อง' : 'ทั้งหมด ' + pool + ' เรื่อง' + (activeType ? ' ใน' + noun : '');
        countEl.innerHTML = MC.esc(text) + (activeTag
            ? ' <button class="chip chip-on" type="button" data-clear-tag aria-label="ล้างแท็ก ' + MC.esc(activeTag) + '">' + MC.esc(activeTag) + MC.icon('close') + '</button>'
            : '');

        if (!list.length) {
            shelf.innerHTML = '<div class="empty"><p>ไม่พบเรื่องที่ตรงกับคำค้น</p><button class="btn btn-sm" type="button" id="reset">ล้างตัวกรอง</button></div>';
            return;
        }
        var favs = function (m) { return MC.isFav(user, m); };
        if (activeType) {
            shelf.innerHTML = '<div class="shelf">' + list.map(function (m, i) { return MC.bookCard(m, favs(m), i); }).join('') + '</div>';
        } else {
            // หมวด "ทั้งหมด" แยกเป็นสองส่วนชัดเจน: มังงะ / อนิเมะ
            shelf.innerHTML =
                group('manga', 'มังงะ', list.filter(function (m) { return MC.typeOf(m).key === 'manga'; }), favs) +
                group('anime', 'อนิเมะ', list.filter(function (m) { return MC.typeOf(m).key === 'anime'; }), favs);
        }
    }

    // ---------- Events ----------
    typesEl.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-type]');
        if (!btn || btn.dataset.type === activeType) return;
        activeType = btn.dataset.type;
        activeTag = ''; // แท็กของหมวดเดิมอาจไม่มีในหมวดใหม่
        renderTypes(); renderTags(); render();
    });

    tagsEl.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-tag]');
        if (!btn) return;
        activeTag = btn.dataset.tag;
        renderTags();
        render();
    });

    countEl.addEventListener('click', function (e) {
        if (e.target.closest('[data-clear-tag]')) { activeTag = ''; renderTags(); render(); }
    });

    search.addEventListener('input', MC.debounce(render, 120));

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !filterPanel.classList.contains('hide') && !document.querySelector('dialog[open]')) {
            setPanel(false); filterBtn.focus();
        }
    });

    shelf.addEventListener('click', function (e) {
        if (e.target.closest('#retry')) { location.reload(); return; }
        if (e.target.closest('#reset')) {
            search.value = ''; activeTag = ''; activeType = '';
            renderTypes(); renderTags(); render();
            return;
        }
        var btn = e.target.closest('.fav');
        if (!btn) return;
        btn.disabled = true;
        MC.toggleFav(btn.dataset.fav).then(function (u) {
            btn.disabled = false;
            if (!u) return;
            user = u;
            var m = all.filter(function (x) { return String(x._id) === btn.dataset.fav || x.id === btn.dataset.fav; })[0];
            MC.paintFav(btn, m ? MC.isFav(user, m) : false);
        });
    });

    // ---------- Load ----------
    skeleton();
    Promise.all([MC.api('/manga'), MC.me()]).then(function (res) {
        var list = res[0];
        user = res[1];
        if (!list.ok || !Array.isArray(list.data)) {
            shelf.innerHTML = '<div class="empty"><p>โหลดรายการไม่สำเร็จ</p><button class="btn btn-sm" type="button" id="retry">ลองใหม่</button></div>';
            return;
        }
        all = list.data;
        renderTypes();
        renderTags();
        render();
        if (activeTag) setPanel(true);
    });
})();

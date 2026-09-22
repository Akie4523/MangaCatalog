(function () {
    'use strict';
    var MC = window.MC;
    var shelf = MC.$('#shelf');
    var tagsEl = MC.$('#tags');
    var countEl = MC.$('#count');
    var search = MC.$('#q');

    var all = [];
    var user = { loggedIn: false, favorites: [] };
    var params = new URLSearchParams(location.search);
    var activeTag = params.get('tag') || '';
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

    // ---------- Render ----------
    function skeleton() {
        var one = '<div class="sk"><div class="sk-cover"></div><div class="sk-line"></div><div class="sk-line short"></div></div>';
        shelf.innerHTML = new Array(12 + 1).join(one);
    }

    function renderTags() {
        var counts = {};
        all.forEach(function (m) { (m.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
        var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b, 'th'); });
        var chip = function (value, label) {
            return '<button class="chip" type="button" data-tag="' + MC.esc(value) + '" aria-pressed="' + (activeTag === value) + '">' + MC.esc(label) + '</button>';
        };
        tagsEl.innerHTML = chip('', 'ทั้งหมด') + names.map(function (t) { return chip(t, t); }).join('');
    }

    function matches(m, q) {
        if (activeTag && (m.tags || []).indexOf(activeTag) === -1) return false;
        if (!q) return true;
        return [m.th_name, m.title, m.en_name, m.jp_name, m.author].some(function (v) {
            return v && String(v).toLowerCase().indexOf(q) !== -1;
        });
    }

    function render() {
        var q = search.value.trim().toLowerCase();
        var list = all.filter(function (m) { return matches(m, q); });

        var next = new URLSearchParams();
        if (activeTag) next.set('tag', activeTag);
        if (search.value.trim()) next.set('q', search.value.trim());
        history.replaceState(null, '', location.pathname + (next.toString() ? '?' + next : ''));

        countEl.textContent = (q || activeTag) ? 'พบ ' + list.length + ' เรื่อง' : 'ทั้งหมด ' + all.length + ' เรื่อง';

        if (!list.length) {
            shelf.innerHTML = '<div class="empty"><p>ไม่พบมังงะที่ตรงกับคำค้น</p><button class="btn btn-sm" type="button" id="reset">ล้างตัวกรอง</button></div>';
            return;
        }
        shelf.innerHTML = list.map(function (m) { return MC.bookCard(m, MC.isFav(user, m)); }).join('');
    }

    // ---------- Events ----------
    tagsEl.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-tag]');
        if (!btn) return;
        activeTag = btn.dataset.tag;
        renderTags();
        render();
    });

    search.addEventListener('input', MC.debounce(render, 120));

    shelf.addEventListener('click', function (e) {
        if (e.target.closest('#retry')) { location.reload(); return; }
        if (e.target.closest('#reset')) {
            search.value = ''; activeTag = '';
            renderTags(); render();
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
            shelf.innerHTML = '<div class="empty"><p>โหลดรายการมังงะไม่สำเร็จ</p><button class="btn btn-sm" type="button" id="retry">ลองใหม่</button></div>';
            return;
        }
        all = list.data;
        renderTags();
        render();
    });
})();

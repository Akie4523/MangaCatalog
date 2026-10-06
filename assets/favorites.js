(function () {
    'use strict';
    var MC = window.MC;
    var shelf = MC.$('#shelf');
    var sub = MC.$('#sub');
    var list = [];

    function empty(text, withLink) {
        shelf.innerHTML = '<div class="empty"><p>' + MC.esc(text) + '</p>' +
            (withLink ? '<a class="btn btn-sm btn-primary" href="/">ดูมังงะทั้งหมด</a>' : '') + '</div>';
    }

    function render() {
        sub.textContent = list.length ? 'บันทึกไว้ ' + list.length + ' เรื่อง' : 'มังงะที่คุณกดหัวใจไว้จะมารวมอยู่ที่นี่';
        if (!list.length) return empty('ยังไม่มีรายการโปรด กดรูปหัวใจที่ปกมังงะเพื่อบันทึกเรื่องที่ชอบ', true);
        shelf.innerHTML = list.map(function (m, i) { return MC.bookCard(m, true, i); }).join('');
    }

    shelf.addEventListener('click', function (e) {
        var btn = e.target.closest('.fav');
        if (!btn) return;
        btn.disabled = true;
        MC.toggleFav(btn.dataset.fav).then(function (u) {
            if (!u) { btn.disabled = false; return; }
            list = list.filter(function (m) { return MC.isFav(u, m); });
            render();
            MC.toast('เอาออกจากรายการโปรดแล้ว');
        });
    });

    MC.me().then(function (u) {
        if (!u.loggedIn) { location.replace('/login?next=' + encodeURIComponent('/favorites')); return; }
        MC.api('/api/favorites').then(function (r) {
            if (!r.ok || !Array.isArray(r.data)) return empty('โหลดรายการโปรดไม่สำเร็จ ลองใหม่อีกครั้ง');
            list = r.data;
            render();
        });
    });
})();

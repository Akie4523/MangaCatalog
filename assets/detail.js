(function () {
    'use strict';
    var MC = window.MC;
    var esc = MC.esc, safeUrl = MC.safeUrl, icon = MC.icon;
    var view = MC.$('#view');
    var id = new URLSearchParams(location.search).get('id');

    var user = { loggedIn: false, favorites: [] };
    var manga = null;

    function isMobile() { return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth <= 768; }
    function isFacebook(u) {
        try { return /(^|\.)(facebook\.com|fb\.watch|fb\.me)$/.test(new URL(u).hostname); } catch (e) { return false; }
    }

    function message(text, kind) {
        view.innerHTML = '<div class="page-h"><p class="note" data-kind="' + (kind || '') + '">' + esc(text) + '</p>' +
            '<p class="mt"><a class="btn btn-sm" href="/">' + icon('back') + '<span>กลับหน้าหลัก</span></a></p></div>';
    }

    function linkBtn(url, label, cls, ic, isFb) {
        var u = safeUrl(url);
        if (!u) return '';
        return '<a class="btn btn-block ' + cls + '" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer"' + (isFb ? ' data-fb' : '') + '>' +
            icon(ic) + '<span>' + esc(label) + '</span></a>';
    }

    function favLabel(on) { return on ? 'อยู่ในรายการโปรดแล้ว' : 'บันทึกเป็นรายการโปรด'; }

    function render() {
        var m = manga;
        var name = m.th_name || m.title || 'ไม่มีชื่อ';
        document.title = name + ' — MangaCatalog';

        var readUrl = m.thai_url || m.facebook_post_url;
        var read = linkBtn(readUrl, 'อ่านแปลไทย', 'btn-primary', 'book', isFacebook(safeUrl(readUrl))) +
            (m.thai_url && m.facebook_post_url ? linkBtn(m.facebook_post_url, 'ดูโพสต์ Facebook', '', 'external', true) : '') +
            linkBtn(m.eng_url, 'อ่านภาษาอังกฤษ', '', 'book') +
            linkBtn(m.original_url, 'ต้นฉบับ (Raw)', '', 'book');
        var buy = linkBtn(m.thai_url_Buy, 'ซื้อฉบับไทย', 'btn-buy', 'cart') +
            linkBtn(m.eng_url_Buy, 'ซื้อฉบับอังกฤษ', 'btn-buy', 'cart') +
            linkBtn(m.original_url_Buy, 'ซื้อฉบับต้นฉบับ', 'btn-buy', 'cart');

        var cover = safeUrl(m.cover);
        var faved = MC.isFav(user, m);
        var translator = safeUrl(m.translator_link)
            ? '<a href="' + esc(safeUrl(m.translator_link)) + '" target="_blank" rel="noopener noreferrer">' + esc(m.translator || 'ลิงก์ค่ายแปล') + '</a>'
            : esc(m.translator || '-');

        var alt = [];
        if (m.en_name) alt.push('EN: ' + m.en_name);
        if (m.jp_name) alt.push('OG: ' + m.jp_name);

        view.innerHTML =
            '<div class="detail">' +
                '<div class="detail-aside">' +
                    '<div class="cover">' + (cover ? '<img src="' + esc(cover) + '" alt="ปกเรื่อง ' + esc(name) + '" referrerpolicy="no-referrer">' : '') + '</div>' +
                    '<section class="panel" aria-label="ลิงก์อ่านและซื้อ">' +
                        (read ? '<div class="link-group"><h2>อ่านออนไลน์</h2>' + read + '</div>' : '') +
                        (buy ? '<div class="link-group"><h2>ซื้อลิขสิทธิ์</h2>' + buy + '</div>' : '') +
                        (!read && !buy ? '<p class="muted">ยังไม่มีลิงก์สำหรับเรื่องนี้</p>' : '') +
                    '</section>' +
                '</div>' +
                '<div class="detail-main">' +
                    '<div class="title-row">' +
                        '<div>' +
                            '<h1>' + esc(name) + '</h1>' +
                            (alt.length ? '<p class="alt">' + alt.map(esc).join('<br>') + '</p>' : '') +
                        '</div>' +
                        '<div class="row-actions">' +
                            '<button class="btn btn-sm" id="fav-btn" type="button" aria-pressed="' + faved + '">' + icon('heart', 'i-heart') + '<span>' + favLabel(faved) + '</span></button>' +
                            (user.role === 'admin' ? '<a class="btn btn-sm" href="/admin?edit=' + encodeURIComponent(m._id) + '">' + icon('edit') + '<span>แก้ไข</span></a>' : '') +
                        '</div>' +
                    '</div>' +
                    '<div class="tags">' +
                        (m.rating ? '<span class="tag tag-rating">' + icon('star') + esc(m.rating) + '</span>' : '') +
                        (m.tags || []).map(function (t) { return '<a class="tag" href="/?tag=' + encodeURIComponent(t) + '">' + esc(t) + '</a>'; }).join('') +
                    '</div>' +
                    '<section><div class="sec-h"><h2>เรื่องย่อ</h2></div><p class="synopsis">' + esc(m.description || 'ยังไม่มีเรื่องย่อ') + '</p></section>' +
                    '<dl class="credits">' +
                        '<div><dt>ผู้แต่ง</dt><dd>' + esc(m.author || '-') + '</dd></div>' +
                        '<div><dt>ผู้วาด</dt><dd>' + esc(m.artist || '-') + '</dd></div>' +
                        '<div><dt>ผู้แปล / ค่ายแปล</dt><dd>' + translator + '</dd></div>' +
                    '</dl>' +
                '</div>' +
            '</div>';
    }

    // ---------- Events ----------
    var fbDlg = MC.$('#fb-dialog');
    var fbCopy = MC.$('#fb-copy');
    var fbLink = '';
    function copyLabel(text) { fbCopy.innerHTML = icon('copy') + '<span>' + esc(text) + '</span>'; }

    document.addEventListener('click', function (e) {
        var t = e.target;
        var fb = t.closest('a[data-fb]');
        if (fb && isMobile() && typeof fbDlg.showModal === 'function') {
            e.preventDefault();
            fbLink = fb.href;
            MC.$('#fb-go').href = fbLink;
            copyLabel('คัดลอกลิงก์');
            fbDlg.showModal();
            return;
        }
        if (t.closest('#fb-cancel') || t.closest('#fb-go')) { fbDlg.close(); return; }
        if (t.closest('#fb-copy')) {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(fbLink).then(function () {
                    copyLabel('คัดลอกแล้ว');
                    setTimeout(function () { copyLabel('คัดลอกลิงก์'); }, 2000);
                }).catch(function () { MC.toast('คัดลอกไม่สำเร็จ', 'error'); });
            }
            return;
        }

        var favBtn = t.closest('#fav-btn');
        if (favBtn) {
            favBtn.disabled = true;
            MC.toggleFav(manga._id).then(function (u) {
                favBtn.disabled = false;
                if (!u) return;
                user = u;
                var on = MC.isFav(user, manga);
                favBtn.setAttribute('aria-pressed', on);
                favBtn.querySelector('span').textContent = favLabel(on);
            });
        }
    });

    // ---------- Load ----------
    if (!id) {
        message('ไม่พบรหัสของมังงะเรื่องนี้', 'error');
        return;
    }
    Promise.all([MC.api('/api/manga/' + encodeURIComponent(id)), MC.me()]).then(function (res) {
        user = res[1];
        if (res[0].status === 404) return message('ไม่พบมังงะเรื่องนี้ อาจถูกลบไปแล้ว', 'error');
        if (!res[0].ok) return message('โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง', 'error');
        manga = res[0].data;
        render();
    });
})();

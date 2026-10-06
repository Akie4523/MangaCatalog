(function () {
    'use strict';
    var MC = window.MC;
    var esc = MC.esc, icon = MC.icon;

    var TEXT_FIELDS = ['th_name', 'en_name', 'jp_name', 'cover', 'rating', 'description', 'author', 'artist',
        'translator', 'translator_link', 'thai_url', 'thai_url_Buy', 'eng_url', 'eng_url_Buy',
        'original_url', 'original_url_Buy', 'facebook_post_url'];

    var list = [];
    var pendingDelete = null;

    var form = MC.$('#manga-form');
    var rowsEl = MC.$('#rows');
    var editId = MC.$('#editId');
    var saveBtn = MC.$('#save');
    var confirmDlg = MC.$('#confirm');

    // ---------- Tabs ----------
    function showTab(name) {
        var isList = name === 'list';
        MC.$('#tab-list').setAttribute('aria-selected', isList);
        MC.$('#tab-form').setAttribute('aria-selected', !isList);
        MC.$('#panel-list').classList.toggle('hide', !isList);
        MC.$('#panel-form').classList.toggle('hide', isList);
    }
    MC.$('#tab-list').addEventListener('click', function () { showTab('list'); });
    MC.$('#tab-form').addEventListener('click', function () { showTab('form'); });

    // ---------- List ----------
    function renderRows() {
        var q = MC.$('#filter').value.trim().toLowerCase();
        var items = list.filter(function (m) {
            return !q || [m.th_name, m.title, m.en_name, m.jp_name].some(function (v) { return v && String(v).toLowerCase().indexOf(q) !== -1; });
        });
        if (!items.length) {
            rowsEl.innerHTML = '<li class="note">' + (list.length ? 'ไม่พบเรื่องที่ค้นหา' : 'ยังไม่มีมังงะในระบบ กดแท็บ "เพิ่ม / แก้ไข" เพื่อเพิ่มเรื่องแรก') + '</li>';
            return;
        }
        rowsEl.innerHTML = items.map(function (m) {
            var name = m.th_name || m.title || 'ไม่มีชื่อ';
            var cover = MC.safeUrl(m.cover);
            return '<li class="row">' +
                '<span class="thumb">' + (cover ? '<img src="' + esc(cover) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') + '</span>' +
                '<div><div class="row-title">' + esc(name) + '</div><div class="row-sub">' + esc(m.author || 'ไม่ระบุผู้แต่ง') + '</div></div>' +
                '<div class="row-actions">' +
                    '<a class="icon-btn" href="/detail?id=' + encodeURIComponent(m._id) + '" aria-label="ดูหน้ารายละเอียด: ' + esc(name) + '">' + icon('external') + '</a>' +
                    '<button class="icon-btn" type="button" data-edit="' + esc(m._id) + '" aria-label="แก้ไข: ' + esc(name) + '">' + icon('edit') + '</button>' +
                    '<button class="icon-btn danger" type="button" data-del="' + esc(m._id) + '" aria-label="ลบ: ' + esc(name) + '">' + icon('trash') + '</button>' +
                '</div></li>';
        }).join('');
    }

    function loadList() {
        return MC.api('/manga').then(function (r) {
            if (r.ok && Array.isArray(r.data)) { list = r.data; renderRows(); }
            else rowsEl.innerHTML = '<li class="note" data-kind="error">โหลดรายการไม่สำเร็จ</li>';
        });
    }

    MC.$('#filter').addEventListener('input', MC.debounce(renderRows, 120));

    rowsEl.addEventListener('click', function (e) {
        var ed = e.target.closest('[data-edit]');
        var del = e.target.closest('[data-del]');
        if (ed) startEdit(ed.dataset.edit);
        if (del) {
            var m = list.filter(function (x) { return String(x._id) === del.dataset.del; })[0];
            pendingDelete = del.dataset.del;
            MC.$('#confirm-text').textContent = 'ข้อมูลของ "' + ((m && (m.th_name || m.title)) || 'เรื่องนี้') + '" จะถูกลบอย่างถาวร และไม่สามารถกู้คืนได้';
            confirmDlg.showModal();
        }
    });

    MC.$('#confirm-cancel').addEventListener('click', function () { pendingDelete = null; confirmDlg.close(); });
    MC.$('#confirm-ok').addEventListener('click', function () {
        var id = pendingDelete;
        if (!id) return;
        MC.$('#confirm-ok').disabled = true;
        MC.api('/delete/' + encodeURIComponent(id), { method: 'DELETE' }).then(function (r) {
            MC.$('#confirm-ok').disabled = false;
            confirmDlg.close();
            pendingDelete = null;
            if (r.ok) { MC.toast('ลบข้อมูลแล้ว'); return loadList(); }
            MC.toast(r.data.message || 'ลบไม่สำเร็จ', 'error');
        });
    });

    // ---------- Form ----------
    function setCoverPreview() {
        var url = MC.safeUrl(MC.$('#cover').value);
        var box = MC.$('#cover-preview');
        box.classList.remove('broken');
        box.innerHTML = url ? '<img src="' + esc(url) + '" alt="ตัวอย่างปก" referrerpolicy="no-referrer">' : '';
    }
    MC.$('#cover').addEventListener('input', MC.debounce(setCoverPreview, 300));

    function resetForm() {
        HTMLFormElement.prototype.reset.call(form);
        editId.value = '';
        MC.$('#form-title').textContent = 'เพิ่มมังงะใหม่';
        setCoverPreview();
    }
    MC.$('#btn-reset').addEventListener('click', resetForm);

    // แปลงค่าฟิลด์จากข้อมูลเดิมให้เป็น string เสมอ เผื่อเรื่องเก่าบางรายการเก็บเป็นชนิดอื่น (เช่น number)
    function asText(v) {
        if (v === null || v === undefined) return '';
        return String(v);
    }
    // รองรับทั้งกรณี tags เป็น array ปกติ และกรณีเรื่องเก่าที่อาจเก็บเป็น string คั่นด้วยจุลภาคไว้
    function tagsToText(v) {
        if (Array.isArray(v)) return v.join(', ');
        if (typeof v === 'string') return v;
        return '';
    }

    function startEdit(id) {
        return MC.api('/api/manga/' + encodeURIComponent(id)).then(function (r) {
            if (!r.ok) { MC.toast(r.data.message || 'โหลดข้อมูลไม่สำเร็จ', 'error'); return; }
            var d = r.data;
            resetForm();
            editId.value = d._id;
            TEXT_FIELDS.forEach(function (f) {
                MC.$('#' + f).value = asText(d[f]) || (f === 'th_name' ? asText(d.title) : '');
            });
            MC.$('#tags').value = tagsToText(d.tags);
            MC.$('#form-title').textContent = 'แก้ไข: ' + (d.th_name || d.title || 'เรื่องนี้');
            setCoverPreview();
            showTab('form');
            window.scrollTo({ top: 0 });
        }).catch(function (err) {
            // กันกรณีข้อมูลเดิมมีรูปแบบที่ไม่คาดคิดจนโค้ดด้านบน throw — ไม่ปล่อยให้เงียบจนดูเหมือนปุ่มไม่ทำงาน
            console.error('startEdit failed:', err);
            MC.toast('เกิดข้อผิดพลาดตอนโหลดข้อมูลเรื่องนี้ ลองใหม่อีกครั้ง หรือแจ้งผู้ดูแลระบบ', 'error');
        });
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!form.reportValidity()) return;

        var payload = {};
        TEXT_FIELDS.forEach(function (f) { payload[f] = MC.$('#' + f).value.trim(); });
        payload.title = payload.th_name;
        payload.tags = MC.$('#tags').value.split(',').map(function (t) { return t.trim(); }).filter(Boolean);

        var id = editId.value;
        saveBtn.disabled = true;
        MC.api(id ? '/api/manga/' + encodeURIComponent(id) : '/add', { method: id ? 'PUT' : 'POST', body: payload }).then(function (r) {
            saveBtn.disabled = false;
            if (!r.ok) return MC.toast(r.data.message || 'บันทึกไม่สำเร็จ', 'error');
            MC.toast(id ? 'อัปเดตข้อมูลแล้ว' : 'เพิ่มมังงะแล้ว');
            resetForm();
            showTab('list');
            loadList();
        });
    });

    // ---------- Boot (ตรวจสิทธิ์จากเซิร์ฟเวอร์ ไม่ใช่แค่มี token) ----------
    MC.me().then(function (u) {
        if (!u.loggedIn) { location.replace('/login?next=' + encodeURIComponent(location.pathname + location.search)); return; }
        if (u.role !== 'admin') {
            var d = MC.$('#denied');
            d.textContent = 'บัญชีนี้ไม่มีสิทธิ์จัดการข้อมูล หากคุณเป็นเจ้าของเว็บ ให้ตั้งค่า ADMIN_USERNAMES ในเซิร์ฟเวอร์';
            d.classList.remove('hide');
            return;
        }
        MC.$('#app').classList.remove('hide');
        loadList().then(function () {
            var id = new URLSearchParams(location.search).get('edit');
            if (id) startEdit(id);
        });
    });
})();
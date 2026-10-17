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

    
    // ---------- Facebook Chapter Links ----------
    var chapterRows = MC.$('#chapter-rows');
    var chapterBulk = MC.$('#chapter-bulk');

    function addChapterRow(label, url) {
        var row = document.createElement('div');
        row.className = 'chapter-row';

        var labelField = document.createElement('input');
        labelField.type = 'text';
        labelField.className = 'input';
        labelField.placeholder = 'ชื่อตอน เช่น ตอนที่ 1';
        labelField.maxLength = 100;
        labelField.value = label || '';
        labelField.setAttribute('aria-label', 'ชื่อตอน');
        labelField.dataset.chapterLabel = '1';

        var urlField = document.createElement('input');
        urlField.type = 'url';
        urlField.className = 'input';
        urlField.placeholder = 'https://www.facebook.com/...';
        urlField.value = url || '';
        urlField.setAttribute('aria-label', 'ลิงก์ Facebook ของตอน');
        urlField.dataset.chapterUrl = '1';

        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn btn-sm';
        removeBtn.textContent = 'ลบตอน';
        removeBtn.setAttribute('aria-label', 'ลบแถวตอนนี้');

        row.append(labelField, urlField, removeBtn);
        chapterRows.appendChild(row);
    }

    function renderChapterRows(chapters) {
        chapterRows.replaceChildren();

        if (Array.isArray(chapters)) {
            chapters.forEach(function (chapter) {
                if (chapter && typeof chapter === 'object') {
                    addChapterRow(chapter.label, chapter.url);
                }
            });
        }

        if (!chapterRows.children.length) {
            addChapterRow('', '');
        }
    }

    function collectChapters() {
        return Array.from(chapterRows.children).map(function (row) {
            return {
                label: row.querySelector('[data-chapter-label]').value.trim(),
                url: row.querySelector('[data-chapter-url]').value.trim()
            };
        }).filter(function (chapter) {
            return chapter.url !== '';
        });
    }

    MC.$('#chapter-add').addEventListener('click', function () {
        addChapterRow('', '');
    });

    chapterRows.addEventListener('click', function (e) {
        var btn = e.target.closest('button');
        if (!btn) return;

        btn.closest('.chapter-row').remove();

        if (!chapterRows.children.length) {
            addChapterRow('', '');
        }
    });

    MC.$('#chapter-import').addEventListener('click', function () {
        var lines = chapterBulk.value.split(/\r?\n/)
            .map(function (line) { return line.trim(); })
            .filter(Boolean);

        var imported = [];
        lines.forEach(function (line) {
            var parts = line.split('|');
            var label = '';
            var url = line;

            if (parts.length > 1) {
                label = parts.shift().trim();
                url = parts.join('|').trim();
            }

            if (!label) {
                label = 'ตอนที่ ' + (collectChapters().length + imported.length + 1);
            }

            imported.push({ label: label, url: url });
        });

        if (!imported.length) {
            MC.toast('กรุณาวางลิงก์ที่ต้องการนำเข้า', 'error');
            return;
        }

        // ลบแถวว่าง แต่เก็บตอนที่กรอกไว้แล้ว
        Array.from(chapterRows.children).forEach(function (row) {
            var url = row.querySelector('[data-chapter-url]').value.trim();
            if (!url) row.remove();
        });

        imported.forEach(function (chapter) {
            addChapterRow(chapter.label, chapter.url);
        });

        chapterBulk.value = '';
        MC.toast('นำเข้าลิงก์แล้ว ' + imported.length + ' รายการ');
    });


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
    renderChapterRows([]);
    chapterBulk.value = '';
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
            renderChapterRows(d.chapters);
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

    console.log('[DEBUG] submit event fired');

    if (!form.reportValidity()) {
        console.warn('[DEBUG] Form validation failed');
        MC.toast('มีข้อมูลบางช่องไม่ถูกต้อง กรุณาตรวจสอบ URL', 'error');
        return;
    }

    var payload = {};

    TEXT_FIELDS.forEach(function (f) {
        payload[f] = MC.$('#' + f).value.trim();
    });

    payload.title = payload.th_name;
    payload.tags = MC.$('#tags').value
        .split(',')
        .map(function (t) { return t.trim(); })
        .filter(Boolean);

    payload.chapters = collectChapters();

    // DEBUG: ตรวจสอบข้อมูลก่อนส่ง
    console.log('[DEBUG] chapters:', payload.chapters);
    console.log('[DEBUG] payload:', JSON.stringify(payload, null, 2));

    var id = editId.value;
    var url = id
        ? '/api/manga/' + encodeURIComponent(id)
        : '/add';

    saveBtn.disabled = true;

    MC.api(url, {
        method: id ? 'PUT' : 'POST',
        body: payload
    })
    .then(function (r) {
        // DEBUG: ตรวจสอบผลตอบกลับจาก API
        console.log('[DEBUG] API response:', r);

        saveBtn.disabled = false;

        if (!r.ok) {
            MC.toast(
                (r.data && r.data.message) || 'บันทึกไม่สำเร็จ',
                'error'
            );
            return;
        }

        MC.toast(id ? 'อัปเดตข้อมูลแล้ว' : 'เพิ่มมังงะแล้ว');
        resetForm();
        showTab('list');
        return loadList();
    })
    .catch(function (err) {
        saveBtn.disabled = false;
        console.error('[DEBUG] Save failed:', err);
        MC.toast('เกิดข้อผิดพลาดระหว่างบันทึก กรุณาตรวจสอบ Console', 'error');
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
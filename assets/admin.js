(function () {
    'use strict';
    var MC = window.MC;
    var esc = MC.esc, icon = MC.icon;

    // ช่องที่ใช้ร่วมกันทุกหมวด (id ตรงๆ)
    var COMMON_FIELDS = ['th_name', 'en_name', 'jp_name', 'cover', 'rating', 'description', 'series', 'season_label', 'season_order'];

    // ช่องเฉพาะหมวด: แต่ละหมวดมีฟอร์มของตัวเอง id = <หมวด>-<ชื่อช่อง> (เก็บลง field เดียวกันใน DB)
    function F(k, label, o) { var f = { k: k, label: label }; for (var x in (o || {})) f[x] = o[x]; return f; }
    var URLO = { url: true, ph: 'https://...' };
    var PANES = {
        manga: [
            { legend: 'ทีมงาน', fields: [F('author', 'ผู้แต่ง'), F('artist', 'ผู้วาด'), F('translator', 'ผู้แปล / ค่ายแปล'), F('translator_link', 'ลิงก์ค่ายแปล', URLO)] },
            { legend: 'ข้อมูลมังงะ', cols: 3, fields: [
                F('format', 'ประเภท', { ph: 'Manga, Manhwa, Webtoon', list: ['Manga', 'Manhwa', 'Manhua', 'Webtoon', 'Light Novel'] }),
                F('episodes', 'จำนวนตอน / เล่ม', { ph: 'เช่น 120' }),
                F('air_status', 'สถานะ', { list: ['จบแล้ว', 'กำลังเผยแพร่', 'พักการเผยแพร่'] }),
                F('aired', 'ช่วงที่เผยแพร่', { ph: '2018 - ปัจจุบัน' }),
                F('producers', 'สำนักพิมพ์'),
                F('licensors', 'ผู้ถือลิขสิทธิ์ไทย'),
                F('age_rating', 'เรทอายุ', { ph: '18+ จะขึ้นคำเตือนเนื้อหาล่อแหลม' }),
                F('themes', 'ธีม', { themes: true, ph: 'คั่นด้วยจุลภาค (,)' })] },
            { legend: 'ลิงก์อ่าน', fields: [F('thai_url', 'อ่านแปลไทย', URLO), F('eng_url', 'อ่านภาษาอังกฤษ', URLO), F('original_url', 'ต้นฉบับ (Raw)', URLO), F('facebook_post_url', 'โพสต์ Facebook', URLO)] },
            { legend: 'ลิงก์ซื้อฉบับลิขสิทธิ์ (แบบเดิม)', cols: 3, fields: [F('thai_url_Buy', 'ฉบับไทย', URLO), F('eng_url_Buy', 'ฉบับอังกฤษ', URLO), F('original_url_Buy', 'ฉบับต้นฉบับ', URLO)] }
        ],
        anime: [
            { legend: 'สตูดิโอและต้นเรื่อง', fields: [F('author', 'ต้นฉบับ / ผู้แต่ง'), F('translator', 'สตูดิโอ (Studios)'), F('translator_link', 'ลิงก์สตูดิโอ / เว็บทางการ', URLO)] },
            { legend: 'ข้อมูลอนิเมะ', cols: 3, fields: [
                F('format', 'ประเภท', { ph: 'TV', list: ['TV', 'Movie', 'OVA', 'ONA', 'Special'] }),
                F('episodes', 'จำนวนตอน', { ph: 'เช่น 11' }),
                F('air_status', 'สถานะ', { list: ['Finished Airing', 'Currently Airing', 'Not yet aired'] }),
                F('aired', 'ออกอากาศ', { ph: 'Apr 11, 2021 to Jun 20, 2021' }),
                F('premiered', 'ซีซันที่เริ่ม', { ph: 'Spring 2021' }),
                F('broadcast', 'เวลาออกอากาศ', { ph: 'Sundays at 00:00 (JST)' }),
                F('producers', 'ผู้ผลิต (Producers)', { ph: 'คั่นด้วยจุลภาค' }),
                F('licensors', 'ผู้ถือลิขสิทธิ์'),
                F('source', 'ต้นเรื่อง', { ph: 'Light novel, Manga, Original' }),
                F('duration', 'ความยาวต่อตอน', { ph: '23 min. per ep.' }),
                F('age_rating', 'เรทอายุ', { ph: '18+ จะขึ้นคำเตือนเนื้อหาล่อแหลม' }),
                F('themes', 'ธีม', { themes: true, ph: 'Mecha, Military' })] },
            { legend: 'ลิงก์ดู', fields: [F('thai_url', 'ดูซับไทย', URLO), F('eng_url', 'ดูซับอังกฤษ', URLO), F('original_url', 'ต้นฉบับ (Raw)', URLO), F('facebook_post_url', 'โพสต์ Facebook', URLO)] },
            { legend: 'ช่องทางถูกลิขสิทธิ์ (แบบเดิม)', cols: 3, fields: [F('thai_url_Buy', 'สตรีมถูกลิขสิทธิ์ (ไทย)', URLO), F('eng_url_Buy', 'สตรีมถูกลิขสิทธิ์ (สากล)', URLO), F('original_url_Buy', 'ช่องทางต้นฉบับ (ญี่ปุ่น)', URLO)] }
        ]
    };
    var PANE_HEAD = {
        manga: ['กรอกข้อมูลมังงะ', 'ช่องในส่วนนี้ใช้เฉพาะมังงะ'],
        anime: ['กรอกข้อมูลอนิเมะ', 'ช่องในส่วนนี้ใช้เฉพาะอนิเมะ — ข้อมูลของหมวดอื่นที่กรอกไว้จะไม่ถูกบันทึก']
    };

    function buildPanes() {
        Object.keys(PANES).forEach(function (type) {
            var host = document.getElementById('pane-' + type);
            host.innerHTML = PANES[type].map(function (g) {
                return '<fieldset class="group"><legend>' + esc(g.legend) + '</legend><div class="' + (g.cols === 3 ? 'grid-3' : 'grid-2') + '">' +
                    g.fields.map(function (f) {
                        var id = type + '-' + f.k;
                        var dl = f.list ? '<datalist id="dl-' + id + '">' + f.list.map(function (o) { return '<option value="' + esc(o) + '">'; }).join('') + '</datalist>' : '';
                        return '<div class="field"><label for="' + id + '">' + esc(f.label) + '</label>' +
                            '<input class="input" id="' + id + '"' + (f.url ? ' type="url" inputmode="url"' : '') +
                            (f.list ? ' list="dl-' + id + '"' : '') + ' maxlength="300"' + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '') + '>' + dl + '</div>';
                    }).join('') + '</div></fieldset>';
            }).join('');
        });
    }
    function typedKeys(type) {
        var out = [];
        PANES[type].forEach(function (g) { g.fields.forEach(function (f) { if (!f.themes) out.push(f.k); }); });
        return out;
    }

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
                label = MC.TYPES[currentType()].epWord + (collectChapters().length + imported.length + 1);
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


    // ---------- Type (manga / anime) ----------
    function currentType() { var r = form.querySelector('input[name="type"]:checked'); return r ? r.value : 'manga'; }
    function setType(t) {
        var r = form.querySelector('input[name="type"][value="' + (t === 'anime' ? 'anime' : 'manga') + '"]');
        if (r) r.checked = true;
        applyType();
    }
    function applyType() {
        var T = MC.TYPES[currentType()];
        Object.keys(PANES).forEach(function (t) {
            var p = document.getElementById('pane-' + t);
            p.hidden = t !== T.key;      // ซ่อนฟอร์มของอีกหมวด
            p.disabled = t !== T.key;    // และไม่นับรวมตอน validate / ส่งข้อมูล
        });
        MC.$('#pane-title').textContent = PANE_HEAD[T.key][0];
        MC.$('#pane-sub').textContent = PANE_HEAD[T.key][1];
        MC.$$('[data-t]', form).forEach(function (el) { el.textContent = T[el.dataset.t]; });
        MC.$$('[data-only]', form).forEach(function (el) { el.classList.toggle('hide', el.dataset.only !== T.key); });
        if (!editId.value) MC.$('#form-title').textContent = T.newTitle;
        MC.$('#chapter-bulk').placeholder = T.epWord + '12 | https://facebook.com/...\nhttps://facebook.com/...';
    }
    form.addEventListener('change', function (e) { if (e.target.name === 'type') applyType(); });
    buildPanes();
    applyType();

    // ---------- Legal links (หลายช่องทาง) ----------
    var legalRows = MC.$('#legal-rows');
    function addLegalRow(label, url) {
        var row = document.createElement('div');
        row.className = 'chapter-row';
        var l = document.createElement('input');
        l.type = 'text'; l.className = 'input'; l.maxLength = 60; l.value = label || '';
        l.placeholder = 'ช่องทาง เช่น Netflix'; l.setAttribute('aria-label', 'ชื่อช่องทาง'); l.dataset.legalLabel = '1';
        l.setAttribute('list', 'dl-platform');
        var u = document.createElement('input');
        u.type = 'url'; u.className = 'input'; u.value = url || '';
        u.placeholder = 'https://...'; u.setAttribute('aria-label', 'ลิงก์ช่องทาง'); u.dataset.legalUrl = '1';
        var rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'btn btn-sm'; rm.textContent = 'ลบ'; rm.setAttribute('aria-label', 'ลบช่องทางนี้');
        row.append(l, u, rm);
        legalRows.appendChild(row);
    }
    function renderLegalRows(items) {
        legalRows.replaceChildren();
        (Array.isArray(items) ? items : []).forEach(function (x) { if (x && typeof x === 'object') addLegalRow(x.label, x.url); });
        if (!legalRows.children.length) addLegalRow('', '');
    }
    function collectLegal() {
        return Array.from(legalRows.children).map(function (row) {
            return { label: row.querySelector('[data-legal-label]').value.trim(), url: row.querySelector('[data-legal-url]').value.trim() };
        }).filter(function (x) { return x.url !== ''; });
    }
    renderLegalRows([]);
    MC.$('#legal-add').addEventListener('click', function () { addLegalRow('', ''); });
    legalRows.addEventListener('click', function (e) {
        var btn = e.target.closest('button');
        if (!btn) return;
        btn.closest('.chapter-row').remove();
        if (!legalRows.children.length) addLegalRow('', '');
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
    var listType = '';
    function renderListTypes() {
        var n = { '': list.length, manga: 0, anime: 0 };
        list.forEach(function (m) { n[m.type === 'anime' ? 'anime' : 'manga']++; });
        MC.$('#list-types').innerHTML = [['', 'ทั้งหมด'], ['manga', 'มังงะ'], ['anime', 'อนิเมะ']].map(function (o) {
            return '<button class="seg-btn" type="button" role="tab" data-lt="' + o[0] + '" data-k="' + (o[0] || 'all') + '" aria-selected="' + (listType === o[0]) + '">' +
                esc(o[1]) + '<span class="seg-n">' + n[o[0]] + '</span></button>';
        }).join('');
    }
    MC.$('#list-types').addEventListener('click', function (e) {
        var b = e.target.closest('[data-lt]');
        if (!b) return;
        listType = b.dataset.lt;
        renderRows();
    });

    function renderRows() {
        var q = MC.$('#filter').value.trim().toLowerCase();
        renderListTypes();
        var items = list.filter(function (m) {
            if (listType && (m.type === 'anime' ? 'anime' : 'manga') !== listType) return false;
            return !q || [m.th_name, m.title, m.en_name, m.jp_name].some(function (v) { return v && String(v).toLowerCase().indexOf(q) !== -1; });
        });
        if (!items.length) {
            rowsEl.innerHTML = '<li class="note">' + (list.length ? 'ไม่พบเรื่องที่ค้นหา' : 'ยังไม่มีรายการในระบบ กดแท็บ "เพิ่ม / แก้ไข" เพื่อเพิ่มเรื่องแรก') + '</li>';
            return;
        }
        rowsEl.innerHTML = items.map(function (m) {
            var name = m.th_name || m.title || 'ไม่มีชื่อ';
            var cover = MC.safeUrl(m.cover);
            return '<li class="row">' +
                '<span class="thumb">' + (cover ? '<img src="' + esc(cover) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') + '</span>' +
                '<div><div class="row-title">' + (m.type === 'anime' ? '<span class="tag tag-type">อนิเมะ</span> ' : '') + esc(name) + '</div><div class="row-sub">' + esc(m.author || 'ไม่ระบุผู้แต่ง') + '</div></div>' +
                '<div class="row-actions">' +
                    '<a class="icon-btn" href="/detail?id=' + encodeURIComponent(m._id) + '" aria-label="ดูหน้ารายละเอียด: ' + esc(name) + '">' + icon('external') + '</a>' +
                    '<button class="icon-btn" type="button" data-edit="' + esc(m._id) + '" aria-label="แก้ไข: ' + esc(name) + '">' + icon('edit') + '</button>' +
                    '<button class="icon-btn danger" type="button" data-del="' + esc(m._id) + '" aria-label="ลบ: ' + esc(name) + '">' + icon('trash') + '</button>' +
                '</div></li>';
        }).join('');
    }

    function loadList() {
        return MC.api('/manga').then(function (r) {
            if (r.ok && Array.isArray(r.data)) {
                list = r.data; renderRows();
                var names = {}; list.forEach(function (m) { if (m.series) names[m.series] = 1; });
                MC.$('#dl-series').innerHTML = Object.keys(names).sort().map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
            }
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
    applyType();
    renderChapterRows([]);
    renderLegalRows([]);
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
            setType(d.type);
            COMMON_FIELDS.forEach(function (f) {
                MC.$('#' + f).value = asText(d[f]) || (f === 'th_name' ? asText(d.title) : '');
            });
            var tk = currentType();
            typedKeys(tk).forEach(function (f) { MC.$('#' + tk + '-' + f).value = asText(d[f]); });
            MC.$('#' + tk + '-themes').value = tagsToText(d.themes);
            MC.$('#tags').value = tagsToText(d.tags);
            renderChapterRows(d.chapters);
            renderLegalRows(d.legal_links);
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

    if (!form.reportValidity()) {
        console.warn('[DEBUG] Form validation failed');
        MC.toast('มีข้อมูลบางช่องไม่ถูกต้อง กรุณาตรวจสอบ URL', 'error');
        return;
    }

    var payload = {};

    COMMON_FIELDS.forEach(function (f) {
        payload[f] = MC.$('#' + f).value.trim();
    });
    var ct = currentType();
    typedKeys(ct).forEach(function (f) { payload[f] = MC.$('#' + ct + '-' + f).value.trim(); });
    payload.themes = MC.$('#' + ct + '-themes').value.split(',').map(function (t) { return t.trim(); }).filter(Boolean);

    payload.type = currentType();
    payload.title = payload.th_name;
    payload.tags = MC.$('#tags').value
        .split(',')
        .map(function (t) { return t.trim(); })
        .filter(Boolean);

    payload.chapters = collectChapters();
    payload.legal_links = collectLegal();

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
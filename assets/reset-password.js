(function () {
    'use strict';
    var MC = window.MC;
    var form = MC.$('#reset-form');
    var errEl = MC.$('#form-error');
    var doneEl = MC.$('#done');
    var btn = MC.$('#submit');
    var pw = MC.$('#password');
    var pw2 = MC.$('#password2');
    var toggle = MC.$('#pw-toggle');
    var token = new URLSearchParams(location.search).get('token') || '';

    toggle.innerHTML = MC.icon('eye');
    toggle.addEventListener('click', function () {
        var show = pw.type === 'password';
        pw.type = pw2.type = show ? 'text' : 'password';
        toggle.setAttribute('aria-pressed', show);
        toggle.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
    });

    if (!token) {
        form.classList.add('hide');
        errEl.textContent = 'ลิงก์ไม่ถูกต้อง กรุณาขอลิงก์รีเซ็ตรหัสผ่านใหม่';
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        errEl.textContent = '';
        if (!form.reportValidity()) return;
        if (pw.value !== pw2.value) { errEl.textContent = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'; pw2.focus(); return; }

        btn.disabled = true;
        btn.innerHTML = '<span class="spin" aria-hidden="true"></span><span>กำลังบันทึก...</span>';
        MC.api('/api/reset-password', { method: 'POST', body: { token: token, password: pw.value } }).then(function (r) {
            if (r.ok && r.data.success) {
                form.classList.add('hide');
                doneEl.textContent = r.data.message || 'ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว';
                doneEl.classList.remove('hide');
                setTimeout(function () { location.href = '/login'; }, 1800);
                return;
            }
            errEl.textContent = r.data.message || 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ';
            btn.disabled = false;
            btn.textContent = 'ตั้งรหัสผ่านใหม่';
        });
    });
})();

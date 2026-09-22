(function () {
    'use strict';
    var MC = window.MC;
    var form = MC.$('#login-form');
    var errEl = MC.$('#form-error');
    var btn = MC.$('#submit');
    var pw = MC.$('#password');
    var toggle = MC.$('#pw-toggle');
    var next = MC.safeNext(new URLSearchParams(location.search).get('next'));

    toggle.innerHTML = MC.icon('eye');
    toggle.addEventListener('click', function () {
        var show = pw.type === 'password';
        pw.type = show ? 'text' : 'password';
        toggle.setAttribute('aria-pressed', show);
        toggle.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
    });

    // ถ้าล็อกอินอยู่แล้วไม่ต้องกรอกซ้ำ
    MC.me().then(function (u) { if (u.loggedIn) location.replace(next); });

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        errEl.textContent = '';
        var username = MC.$('#username').value.trim();
        var password = pw.value;
        if (!username || !password) { errEl.textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'; return; }

        btn.disabled = true;
        btn.innerHTML = '<span class="spin" aria-hidden="true"></span><span>กำลังตรวจสอบ...</span>';
        MC.api('/login', { method: 'POST', body: { username: username, password: password } }).then(function (r) {
            if (r.ok && r.data.success) { location.href = next; return; }
            errEl.textContent = r.data.message || 'เข้าสู่ระบบไม่สำเร็จ';
            btn.disabled = false;
            btn.textContent = 'เข้าสู่ระบบ';
            pw.value = '';
            pw.focus();
        });
    });
})();

(function () {
    'use strict';
    var MC = window.MC;
    var form = MC.$('#login-form');
    var errEl = MC.$('#form-error');
    var btn = MC.$('#submit');
    var pw = MC.$('#password');
    var toggle = MC.$('#pw-toggle');
    var qs = new URLSearchParams(location.search);
    var next = MC.safeNext(qs.get('next'));

    // ต่อ ?next= เข้าไปในลิงก์ "เข้าสู่ระบบด้วย Google" และ "สมัครสมาชิก" ด้วย เพื่อให้กลับมาหน้าเดิมได้หลังทำเสร็จ
    var googleBtn = MC.$('#google-btn');
    if (googleBtn) googleBtn.href = '/auth/google?next=' + encodeURIComponent(next);
    var registerLink = document.querySelector('a[href="/register"]');
    if (registerLink && next !== '/') registerLink.href = '/register?next=' + encodeURIComponent(next);

    if (qs.get('error') === 'google') {
        errEl.textContent = 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
    }

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
        var identifier = MC.$('#identifier').value.trim();
        var password = pw.value;
        if (!identifier || !password) { errEl.textContent = 'กรุณากรอกชื่อผู้ใช้/อีเมลและรหัสผ่าน'; return; }

        btn.disabled = true;
        btn.innerHTML = '<span class="spin" aria-hidden="true"></span><span>กำลังตรวจสอบ...</span>';
        MC.api('/login', { method: 'POST', body: { identifier: identifier, password: password } }).then(function (r) {
            if (r.ok && r.data.success) { location.href = next; return; }
            errEl.textContent = r.data.message || 'เข้าสู่ระบบไม่สำเร็จ';
            btn.disabled = false;
            btn.textContent = 'เข้าสู่ระบบ';
            pw.value = '';
            pw.focus();
        });
    });
})();

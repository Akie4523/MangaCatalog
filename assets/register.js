(function () {
    'use strict';
    var MC = window.MC;
    var form = MC.$('#register-form');
    var errEl = MC.$('#form-error');
    var btn = MC.$('#submit');
    var pw = MC.$('#password');
    var pw2 = MC.$('#password2');
    var toggle = MC.$('#pw-toggle');
    var qs = new URLSearchParams(location.search);
    var next = MC.safeNext(qs.get('next'));

    var googleBtn = MC.$('#google-btn');
    if (googleBtn) googleBtn.href = '/auth/google?next=' + encodeURIComponent(next);
    var loginLink = document.querySelector('a[href="/login"]');
    if (loginLink && next !== '/') loginLink.href = '/login?next=' + encodeURIComponent(next);

    toggle.innerHTML = MC.icon('eye');
    toggle.addEventListener('click', function () {
        var show = pw.type === 'password';
        pw.type = pw2.type = show ? 'text' : 'password';
        toggle.setAttribute('aria-pressed', show);
        toggle.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
    });

    // ถ้าล็อกอินอยู่แล้วไม่ต้องสมัครซ้ำ
    MC.me().then(function (u) { if (u.loggedIn) location.replace(next); });

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        errEl.textContent = '';
        var username = MC.$('#username').value.trim();
        var email = MC.$('#email').value.trim();
        var password = pw.value;

        if (!form.reportValidity()) return;
        if (password !== pw2.value) { errEl.textContent = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'; pw2.focus(); return; }

        btn.disabled = true;
        btn.innerHTML = '<span class="spin" aria-hidden="true"></span><span>กำลังสมัคร...</span>';
        MC.api('/register', { method: 'POST', body: { username: username, email: email, password: password } }).then(function (r) {
            if (r.ok && r.data.success) { MC.toast('สมัครสมาชิกสำเร็จ ยินดีต้อนรับ!'); location.href = next; return; }
            errEl.textContent = r.data.message || 'สมัครสมาชิกไม่สำเร็จ';
            btn.disabled = false;
            btn.textContent = 'สมัครสมาชิก';
        });
    });
})();

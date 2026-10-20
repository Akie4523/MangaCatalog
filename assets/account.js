(function () {
    'use strict';
    var MC = window.MC;

    var profileForm = MC.$('#profile-form');
    var profileErr = MC.$('#profile-error');
    var pwForm = MC.$('#password-form');
    var pwErr = MC.$('#password-error');
    var currentPwField = MC.$('#current-pw-field');
    var googleStatus = MC.$('#google-status');
    var googleErr = MC.$('#google-error');
    var googleLinkBtn = MC.$('#google-link-btn');
    var googleUnlinkBtn = MC.$('#google-unlink-btn');

    // ปุ่มแสดง/ซ่อนรหัสผ่าน ใช้ร่วมกันหลายช่องผ่าน data-for
    MC.$$('.pw-toggle').forEach(function (btn) {
        btn.innerHTML = MC.icon('eye');
        btn.addEventListener('click', function () {
            var input = MC.$('#' + btn.dataset.for);
            var show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            btn.setAttribute('aria-pressed', show);
            btn.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
        });
    });

    function paintGoogle(data) {
        if (data.googleLinked) {
            googleStatus.textContent = 'บัญชีนี้เชื่อมกับ Google แล้ว';
            googleLinkBtn.classList.add('hide');
            googleUnlinkBtn.classList.remove('hide');
        } else {
            googleStatus.textContent = 'ยังไม่ได้เชื่อมกับบัญชี Google — เชื่อมไว้เพื่อเข้าสู่ระบบด้วย Google ได้ในครั้งถัดไป';
            googleLinkBtn.classList.remove('hide');
            googleUnlinkBtn.classList.add('hide');
        }
    }

    function loadAccount() {
        return MC.api('/api/account').then(function (r) {
            if (!r.ok) { MC.toast(r.data.message || 'โหลดข้อมูลบัญชีไม่สำเร็จ', 'error'); return; }
            var d = r.data;
            MC.$('#p-username').value = d.username;
            MC.$('#p-email').value = d.email || '';
            currentPwField.classList.toggle('hide', !d.hasPassword);
            MC.$('#pw-heading').textContent = d.hasPassword ? 'เปลี่ยนรหัสผ่าน' : 'ตั้งรหัสผ่าน';
            MC.$('#password-save').textContent = d.hasPassword ? 'เปลี่ยนรหัสผ่าน' : 'ตั้งรหัสผ่าน';
            paintGoogle(d);
        });
    }

    profileForm.addEventListener('submit', function (e) {
        e.preventDefault();
        profileErr.textContent = '';
        if (!profileForm.reportValidity()) return;
        var username = MC.$('#p-username').value.trim();
        var email = MC.$('#p-email').value.trim();
        var btn = MC.$('#profile-save');
        btn.disabled = true;
        MC.api('/api/account/profile', { method: 'PUT', body: { username: username, email: email } }).then(function (r) {
            btn.disabled = false;
            if (!r.ok) { profileErr.textContent = r.data.message || 'บันทึกไม่สำเร็จ'; return; }
            MC.toast('บันทึกข้อมูลบัญชีแล้ว');
            MC.me(true); // รีเฟรช cache ชื่อผู้ใช้ที่หัวเว็บ
        });
    });

    pwForm.addEventListener('submit', function (e) {
        e.preventDefault();
        pwErr.textContent = '';
        if (!pwForm.reportValidity()) return;
        var newPw = MC.$('#new-password').value;
        var newPw2 = MC.$('#new-password2').value;
        if (newPw !== newPw2) { pwErr.textContent = 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน'; return; }

        var btn = MC.$('#password-save');
        btn.disabled = true;
        MC.api('/api/account/password', {
            method: 'POST',
            body: { currentPassword: MC.$('#current-password').value, newPassword: newPw }
        }).then(function (r) {
            btn.disabled = false;
            if (!r.ok) { pwErr.textContent = r.data.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ'; return; }
            MC.toast(r.data.message || 'เปลี่ยนรหัสผ่านแล้ว');
            pwForm.reset();
            loadAccount();
        });
    });

    googleUnlinkBtn.addEventListener('click', function () {
        googleErr.textContent = '';
        googleUnlinkBtn.disabled = true;
        MC.api('/api/account/unlink-google', { method: 'POST' }).then(function (r) {
            googleUnlinkBtn.disabled = false;
            if (!r.ok) { googleErr.textContent = r.data.message || 'ยกเลิกการเชื่อมไม่สำเร็จ'; return; }
            MC.toast(r.data.message || 'ยกเลิกการเชื่อม Google แล้ว');
            loadAccount();
        });
    });

    // ข้อความจากการเชื่อม/ยกเลิก Google ที่ redirect กลับมา
    var qs = new URLSearchParams(location.search);
    if (qs.get('linked') === '1') { MC.toast('เชื่อมบัญชี Google สำเร็จแล้ว'); history.replaceState(null, '', '/account'); }
    if (qs.get('error') === 'google_in_use') { googleErr.textContent = 'บัญชี Google นี้ถูกผูกกับบัญชีอื่นไปแล้ว'; history.replaceState(null, '', '/account'); }
    if (qs.get('error') === 'google_email_taken') { googleErr.textContent = 'อีเมลของบัญชี Google นี้ถูกใช้โดยบัญชีอื่นแล้ว'; history.replaceState(null, '', '/account'); }

    MC.me().then(function (u) {
        if (!u.loggedIn) { location.replace('/login?next=' + encodeURIComponent('/account')); return; }
        MC.$('#app').classList.remove('hide');
        loadAccount();
    });
})();

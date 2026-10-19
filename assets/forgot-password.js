(function () {
    'use strict';
    var MC = window.MC;
    var form = MC.$('#forgot-form');
    var errEl = MC.$('#form-error');
    var doneEl = MC.$('#done');
    var btn = MC.$('#submit');

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        errEl.textContent = '';
        var email = MC.$('#email').value.trim();
        if (!email) { errEl.textContent = 'กรุณากรอกอีเมล'; return; }

        btn.disabled = true;
        btn.innerHTML = '<span class="spin" aria-hidden="true"></span><span>กำลังส่ง...</span>';
        MC.api('/api/forgot-password', { method: 'POST', body: { email: email } }).then(function (r) {
            btn.disabled = false;
            btn.textContent = 'ส่งลิงก์รีเซ็ตรหัสผ่าน';
            // แสดงข้อความสำเร็จแบบเดียวกันเสมอไม่ว่าจะพบอีเมลในระบบหรือไม่ (กันการสุ่มเช็คอีเมล)
            if (r.data && r.data.message && r.ok) {
                form.classList.add('hide');
                doneEl.textContent = r.data.message;
                doneEl.classList.remove('hide');
            } else {
                errEl.textContent = (r.data && r.data.message) || 'ส่งคำขอไม่สำเร็จ ลองใหม่อีกครั้ง';
            }
        });
    });
})();

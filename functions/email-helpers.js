const { minToHHmm } = require('./format-helpers');

function escHtml(s) {
  const amp = '&' + 'amp;';
  const lt = '&' + 'lt;';
  const gt = '&' + 'gt;';
  const quot = '&' + 'quot;';
  const apos = '&' + '#39;';
  return String(s)
    .replace(/&/g, amp)
    .replace(/</g, lt)
    .replace(/>/g, gt)
    .replace(/"/g, quot)
    .replace(/'/g, apos);
}

async function queueConfirmationEmail(db, email, fullName, sp, sk, isUpdate, assessmentName) {
  const fmtSlot = (s) => {
    const [, mo, d] = s.date.split('-');
    return `${d}/${mo} · ${minToHHmm(s.startMin)}-${minToHHmm(s.endMin)}${s.location ? ' · ' + escHtml(s.location) : ''}`;
  };
  const verb = isUpdate ? 'cập nhật' : 'đăng ký';
  await db.collection('mail').add({
    to: email,
    message: {
      subject: `[${assessmentName}] Xác nhận ${verb} ca thi`,
      html: `
        <p>Xin chào <b>${escHtml(fullName)}</b>,</p>
        <p>Bạn đã ${verb} thành công 2 ca thi ${escHtml(assessmentName)}:</p>
        <ul>
          <li><b>Speaking:</b> ${fmtSlot(sp)}</li>
          <li><b>3 Skills:</b> ${fmtSlot(sk)}</li>
        </ul>
        <p>Bạn có thể thêm lịch thi vào Google Calendar từ màn hình Lịch thi của bạn trên hệ thống.</p>
        <p>Nếu cần đổi/huỷ, vui lòng truy cập lại hệ thống trước thời hạn.</p>
        <p>- Ban tổ chức Assessment</p>
      `,
    },
  });
}

module.exports = { queueConfirmationEmail };

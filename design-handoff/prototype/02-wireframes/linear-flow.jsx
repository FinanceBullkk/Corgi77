// ─────────────────────────────────────────────────────────────────────────
// Linear Flow Wireframes
// Sign-in → Step 1 (User Info) → Confirm Modal → Success Screen → Booking Display
// All monochrome lo-fi. Annotations explain UX rationale.
// ─────────────────────────────────────────────────────────────────────────

// ─── Shared bits ─────────────────────────────────────────────────────────

const WHeader = ({ withDeadline = true, deadlineState = 'normal' }) => (
  <header className="wf-header">
    <div className="wf-header-left">
      <div className="wf-logo" />
      <div>
        <div className="wf-header-title">Đăng ký thi Assessment Q2 2026</div>
        <div className="wf-header-sub">an.nguyen@cyberlogitec.com</div>
      </div>
    </div>
    <div className="wf-header-right">
      {withDeadline && (
        <span className={`wf-pill ${deadlineState === 'warn' ? 'warn' : deadlineState === 'danger' ? 'danger' : ''}`}>
          {deadlineState === 'warn' ? '⏱ Còn 1 ngày 6 giờ' : '⏱ Hạn: còn 12 ngày'}
        </span>
      )}
      <span className="wf-pill">Đăng xuất</span>
    </div>
  </header>
);

const WStepper = ({ current = 1 }) => (
  <div className="wf-stepper">
    <div className="wf-step">
      <div className={`wf-step-dot ${current > 1 ? 'done' : current === 1 ? 'active' : ''}`}>
        {current > 1 ? '✓' : '1'}
      </div>
      <span className={`wf-step-label ${current >= 1 ? 'active' : ''}`}>Thông tin</span>
    </div>
    <div className={`wf-step-line ${current > 1 ? 'done' : ''}`} />
    <div className="wf-step">
      <div className={`wf-step-dot ${current === 2 ? 'active' : ''}`}>2</div>
      <span className={`wf-step-label ${current >= 2 ? 'active' : ''}`}>Chọn ca thi</span>
    </div>
    <div className={`wf-step-line`} />
    <div className="wf-step">
      <div className={`wf-step-dot ${current === 3 ? 'active' : ''}`}>3</div>
      <span className={`wf-step-label ${current >= 3 ? 'active' : ''}`}>Xác nhận</span>
    </div>
  </div>
);

// ─── 01 · Sign-In ────────────────────────────────────────────────────────

const SignInScreen = () => (
  <div className="wf wf-app">
    <header className="wf-header">
      <div className="wf-header-left">
        <div className="wf-logo" />
      </div>
    </header>
    <div className="wf-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <div style={{ width: 380, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, margin: '0 auto 18px', borderRadius: '50%', background: 'var(--wf-bg-alt)', border: '1.5px solid var(--wf-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🎓</div>
        <h1 style={{ fontSize: 20, marginBottom: 6 }}>Đăng ký thi Assessment Q2 2026</h1>
        <p style={{ fontSize: 13, color: 'var(--wf-text-muted)', marginBottom: 24 }}>
          Đăng nhập bằng tài khoản Google công ty để tiếp tục.
        </p>
        <button className="wf-btn lg full">
          <span style={{ width: 18, height: 18, border: '1.5px solid white', borderRadius: 3, display: 'inline-block' }} />
          Đăng nhập với Google
        </button>
        <p style={{ fontSize: 11, color: 'var(--wf-text-muted)', marginTop: 14 }}>
          Chỉ chấp nhận email <b>@cyberlogitec.com</b>
        </p>
      </div>

      <div className="wf-anno arrow-left" style={{ top: 80, right: 30, maxWidth: 170 }}>
        Single-purpose screen, không có distraction. Domain rule hiển thị rõ NGAY trên CTA → user biết trước khi click.
      </div>
    </div>
  </div>
);

// ─── 02 · Step 1 — User Info ─────────────────────────────────────────────

const Step1UserInfo = () => (
  <div className="wf wf-app" style={{ position: 'relative' }}>
    <WHeader />
    <div className="wf-content">
      <div className="wf-content-narrow" style={{ position: 'relative' }}>
        <WStepper current={1} />

        <div className="wf-card">
          <div className="wf-card-title">Thông tin học viên</div>
          <div className="wf-card-sub">Điền chính xác để hệ thống kiểm tra eligibility trước khi chọn ca thi.</div>

          <div className="wf-field">
            <span className="wf-label">Mã NV · 6 chữ số</span>
            <div className="wf-input filled focused">262010</div>
          </div>
          <div className="wf-field">
            <span className="wf-label">Họ và tên</span>
            <div className="wf-input filled">Nguyễn Văn An</div>
          </div>
          <div className="wf-field">
            <span className="wf-label">Business Unit (BU)</span>
            <div className="wf-input">VD: ITS-PHX</div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, padding: '8px 10px', background: 'var(--wf-bg-alt)', borderRadius: 4, fontSize: 11, color: 'var(--wf-text-muted)' }}>
            <span>🔒</span>
            <span>Hệ thống sẽ check empCode với danh sách eligibility trước khi sang Bước 2.</span>
          </div>
        </div>

        <div className="wf-actions split">
          <span style={{ fontSize: 12, color: 'var(--wf-text-muted)' }}>3/3 trường hợp lệ</span>
          <button className="wf-btn">Tiếp tục →</button>
        </div>

        <div className="wf-anno arrow-left" style={{ top: 80, right: -180, maxWidth: 170 }}>
          <b>Stepper persistent</b> — user luôn biết đang ở đâu (Nielsen #1: Visibility of system status).
        </div>
        <div className="wf-anno arrow-left" style={{ top: 220, right: -180, maxWidth: 170 }}>
          Label UPPERCASE cho hierarchy. Trường focused có ring + viền dày.
        </div>
        <div className="wf-anno arrow-up" style={{ bottom: 60, left: 40, maxWidth: 180 }}>
          Inline validation count trước khi enable CTA → user hiểu vì sao bị disable.
        </div>
      </div>
    </div>
  </div>
);

// ─── 04 · Confirm Modal ──────────────────────────────────────────────────

const ConfirmModal = () => (
  <div className="wf wf-app" style={{ position: 'relative', background: 'var(--wf-bg-alt)' }}>
    {/* Ghost background hint of Step 2 */}
    <div style={{ position: 'absolute', inset: 0, opacity: 0.3 }}>
      <WHeader />
    </div>

    <div className="wf-modal-backdrop">
      <div className="wf-modal">
        <div className="wf-modal-title">Xác nhận đăng ký</div>
        <p className="wf-modal-sub">Vui lòng kiểm tra trước khi gửi. Sau đăng ký bạn vẫn có thể đổi 3 lần.</p>

        <div className="wf-section-h">Học viên</div>
        <div style={{ background: 'var(--wf-bg-alt)', padding: 10, borderRadius: 5, marginBottom: 14, fontSize: 12 }}>
          <div><b>Nguyễn Văn An</b> · 262010 · ITS-PHX</div>
        </div>

        <div className="wf-section-h">2 ca thi đã chọn</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          <div className="wf-slot selected" style={{ paddingRight: 28 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--wf-accent)', letterSpacing: '0.08em' }}>SPEAKING</div>
            <div className="wf-slot-row">
              <div>
                <div className="wf-slot-time">13:30 – 14:30</div>
                <div className="wf-slot-date">Thứ 2, 22/06/2026 · 📍 Phòng A</div>
              </div>
            </div>
          </div>
          <div className="wf-slot selected" style={{ paddingRight: 28 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--wf-accent)', letterSpacing: '0.08em' }}>3 SKILLS</div>
            <div className="wf-slot-row">
              <div>
                <div className="wf-slot-time">09:00 – 11:00</div>
                <div className="wf-slot-date">Thứ 4, 24/06/2026 · 📍 Phòng B</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '8px 10px', background: 'var(--wf-warn-bg)', borderRadius: 4, fontSize: 11, color: 'var(--wf-warn)', marginBottom: 16 }}>
          <span>⚠</span>
          <span>Bạn còn <b>3 lần đổi ca</b> sau khi đăng ký. Sau khi hết, sẽ phải liên hệ BTC.</span>
        </div>

        <div className="wf-actions" style={{ justifyContent: 'flex-end', marginTop: 0 }}>
          <button className="wf-btn ghost">← Quay lại sửa</button>
          <button className="wf-btn">Xác nhận đăng ký</button>
        </div>
      </div>
    </div>

    <div className="wf-anno arrow-down" style={{ top: 30, right: 30, maxWidth: 170 }}>
      Thay <code>window.confirm()</code> native bằng custom modal có preview rõ ràng → user check kỹ trước khi commit.
    </div>
    <div className="wf-anno arrow-left" style={{ bottom: 60, left: 30, maxWidth: 180 }}>
      Hai nút <b>tách trái-phải</b>, primary action ở vị trí kết thúc tự nhiên cho người Việt (đọc trái → phải).
    </div>
  </div>
);

// ─── 05 · Success Screen ─────────────────────────────────────────────────

const SuccessScreen = () => (
  <div className="wf wf-app" style={{ position: 'relative' }}>
    <WHeader />
    <div className="wf-content">
      <div className="wf-content-narrow" style={{ position: 'relative' }}>
        <div className="wf-success-hero">
          <div className="wf-success-check">✓</div>
          <div className="wf-success-title">Đăng ký thành công!</div>
          <div className="wf-success-sub">Nguyễn Văn An · 262010</div>
        </div>

        <div className="wf-countdown">
          <div>
            <div className="wf-countdown-label">Còn đến ngày thi đầu tiên</div>
            <div style={{ fontSize: 12, color: 'var(--wf-text-muted)', marginTop: 2 }}>Speaking · 22/06/2026</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="wf-countdown-num">15</div>
            <div className="wf-countdown-label">ngày</div>
          </div>
        </div>

        <div className="wf-card">
          <div className="wf-section-h">Lịch thi của bạn</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            <div className="wf-slot" style={{ borderColor: 'var(--wf-text)', borderWidth: 1.5 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--wf-text-muted)' }}>① SPEAKING</div>
              <div className="wf-slot-row">
                <div>
                  <div className="wf-slot-time">Thứ 2 · 22/06/2026 · 13:30 – 14:30</div>
                  <div className="wf-slot-loc">📍 Phòng A · Tầng 5, SCETPA Building</div>
                </div>
                <span className="wf-btn ghost small">+ Lịch</span>
              </div>
            </div>
            <div className="wf-slot" style={{ borderColor: 'var(--wf-text)', borderWidth: 1.5 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--wf-text-muted)' }}>② 3 SKILLS</div>
              <div className="wf-slot-row">
                <div>
                  <div className="wf-slot-time">Thứ 4 · 24/06/2026 · 09:00 – 11:00</div>
                  <div className="wf-slot-loc">📍 Phòng B · Tầng 5, SCETPA Building</div>
                </div>
                <span className="wf-btn ghost small">+ Lịch</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'var(--wf-accent-soft)', borderRadius: 5, fontSize: 12, marginBottom: 14 }}>
          <span>📧</span>
          <span style={{ color: 'var(--wf-text-muted)' }}>Email xác nhận đã được gửi đến <b style={{ color: 'var(--wf-text)' }}>an.nguyen@cyberlogitec.com</b>.</span>
        </div>

        <div className="wf-actions split">
          <span style={{ fontSize: 12, color: 'var(--wf-text-muted)' }}>Còn <b style={{ color: 'var(--wf-text)' }}>3 lần</b> đổi ca</span>
          <button className="wf-btn ghost">Xem chi tiết →</button>
        </div>

        <div className="wf-anno arrow-left" style={{ top: 90, right: -180, maxWidth: 170 }}>
          <b>Full-screen Success</b> thay banner toast. Giải tỏa lo âu "Đã đăng ký chưa?"
        </div>
        <div className="wf-anno arrow-left" style={{ top: 230, right: -180, maxWidth: 170 }}>
          <b>Countdown</b> tạo anticipation + reminder ngày thi. D-7, D-3, D-1.
        </div>
        <div className="wf-anno arrow-left" style={{ top: 420, right: -180, maxWidth: 170 }}>
          Nút <b>+ Lịch</b> (.ics) ở từng ca → giảm "tôi quên" anxiety. Push ngay vào Google/Outlook Calendar.
        </div>
        <div className="wf-anno arrow-up" style={{ bottom: 30, left: 30, maxWidth: 170 }}>
          Set expectation trước: "còn 3 lần đổi" — không bị bất ngờ về sau.
        </div>
      </div>
    </div>
  </div>
);

// ─── 06 · Booking Display (Đã đăng ký) ───────────────────────────────────

const BookingDisplay = () => (
  <div className="wf wf-app" style={{ position: 'relative' }}>
    <WHeader />
    <div className="wf-content">
      <div className="wf-content-narrow" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <h2 style={{ fontSize: 16 }}>Lịch thi của bạn</h2>
          <span className="wf-pill" style={{ background: 'var(--wf-success-bg)', color: 'var(--wf-success)', border: 'none' }}>
            ✓ Đã đăng ký
          </span>
        </div>

        <div className="wf-countdown" style={{ marginBottom: 16 }}>
          <div>
            <div className="wf-countdown-label">Ca thi gần nhất</div>
            <div style={{ fontSize: 12, color: 'var(--wf-text-muted)', marginTop: 2 }}>Speaking · 22/06/2026 · 13:30</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="wf-countdown-num">15</div>
            <div className="wf-countdown-label">ngày</div>
          </div>
        </div>

        <div className="wf-card" style={{ padding: 0 }}>
          {/* Profile section */}
          <div style={{ padding: '14px 18px', borderBottom: '1.5px solid var(--wf-border)' }}>
            <div className="wf-section-h" style={{ marginBottom: 8 }}>Học viên</div>
            <div className="wf-booking-row" style={{ padding: '4px 0', border: 'none' }}>
              <span className="key">Họ tên</span>
              <span className="val">Nguyễn Văn An</span>
            </div>
            <div className="wf-booking-row" style={{ padding: '4px 0', border: 'none' }}>
              <span className="key">Mã NV / BU</span>
              <span className="val">262010 · ITS-PHX</span>
            </div>
          </div>

          {/* Slot cards */}
          <div style={{ padding: 18 }}>
            <div className="wf-section-h">2 Ca thi</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="wf-slot" style={{ borderColor: 'var(--wf-text)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--wf-text-muted)' }}>① SPEAKING</div>
                <div className="wf-slot-time">22/06/2026 · 13:30 – 14:30</div>
                <div className="wf-slot-loc">📍 Phòng A · Tầng 5</div>
              </div>
              <div className="wf-slot" style={{ borderColor: 'var(--wf-text)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--wf-text-muted)' }}>② 3 SKILLS</div>
                <div className="wf-slot-time">24/06/2026 · 09:00 – 11:00</div>
                <div className="wf-slot-loc">📍 Phòng B · Tầng 5</div>
              </div>
            </div>
          </div>

          {/* Meta */}
          <div style={{ padding: '12px 18px', background: 'var(--wf-bg-alt)', borderTop: '1px solid var(--wf-border)', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--wf-text-muted)' }}>
            <span>Đăng ký: 28/05/2026 14:23</span>
            <span>Còn <b style={{ color: 'var(--wf-text)' }}>3 / 3</b> lần đổi</span>
          </div>
        </div>

        {/* Actions — SAFE distancing */}
        <div className="wf-actions split" style={{ marginTop: 16 }}>
          <button className="wf-btn ghost">↻ Đổi ca thi</button>
          <button className="wf-btn ghost small" style={{ color: 'var(--wf-text-muted)', borderColor: 'var(--wf-border)' }}>
            ⋮ Tùy chọn khác
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--wf-text-muted)', marginTop: 6, textAlign: 'right' }}>
          Hủy đăng ký nằm trong menu "Tùy chọn khác" để tránh click nhầm
        </div>

        <div className="wf-anno arrow-left" style={{ top: 80, right: -180, maxWidth: 170 }}>
          <b>Card layout</b> thay thế <code>dl/dt/dd</code> dàn trải. Scan nhanh, mobile-friendly.
        </div>
        <div className="wf-anno arrow-left" style={{ top: 280, right: -180, maxWidth: 170 }}>
          Mỗi ca thành 1 <b>card riêng</b> với ① ② → tránh nhầm thứ tự.
        </div>
        <div className="wf-anno arrow-up" style={{ bottom: 60, left: 30, maxWidth: 200 }}>
          <b>"Hủy đăng ký" ẩn trong menu</b> → cách xa "Đổi ca" để tránh click nhầm. Click vào menu → confirm 2 bước.
        </div>
      </div>
    </div>
  </div>
);

// Export to window so other scripts can use these
Object.assign(window, {
  SignInScreen,
  Step1UserInfo,
  ConfirmModal,
  SuccessScreen,
  BookingDisplay,
  WHeader,
  WStepper,
});

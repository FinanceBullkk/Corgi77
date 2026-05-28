// ─────────────────────────────────────────────────────────────────────────
// Sign-In + Step 1 (Info form)
// ─────────────────────────────────────────────────────────────────────────

function SignInScreen({ onSignIn }) {
  return (
    <div className="signin">
      <div className="signin-bg"></div>
      <div className="signin-content">
        <div className="signin-card">
          <div className="signin-icon">🎓</div>
          <h1>Assessment Booking</h1>
          <p className="sub">Đăng ký ca thi đánh giá năng lực Q2 2026</p>

          <button className="gbtn" onClick={onSignIn}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Đăng nhập với Google
          </button>

          <div className="signin-meta">
            <span>🔒 Chỉ chấp nhận <b style={{ color: 'var(--ink-700)' }}>@cyberlogitec.com</b></span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 1 · Info form ────────────────────────────────────────────────
function Step1Form({ user, deadline, initial, onContinue, onLogout, onHome }) {
  const [empCode, setEmpCode] = useState(initial.empCode || '');
  const [name, setName] = useState(initial.name || user.name || '');
  const [bu, setBu] = useState(initial.bu || '');
  const [checking, setChecking] = useState(false);

  const empValid = /^\d{6}$/.test(empCode);
  const nameValid = name.trim().length >= 2;
  const buValid = bu.trim().length >= 2;
  const allValid = empValid && nameValid && buValid;
  const validCount = [empValid, nameValid, buValid].filter(Boolean).length;

  function onSubmit(e) {
    e.preventDefault();
    if (!allValid) return;
    setChecking(true);
    setTimeout(() => {
      setChecking(false);
      onContinue({ empCode, name: name.trim(), bu: bu.trim().toUpperCase() });
    }, 600);
  }

  return (
    <div className="app">
      <Topbar user={user} deadline={deadline} onLogout={onLogout} onHome={onHome} />

      <main className="container">
        <Stepper current={1} />

        <form className="card" onSubmit={onSubmit}>
          <div className="card-hd">
            <div className="card-title">Thông tin học viên</div>
            <div className="card-sub">Điền chính xác để hệ thống xác nhận eligibility trước khi chọn ca thi.</div>
          </div>
          <div className="card-bd">
            <div className="field">
              <label className="label" htmlFor="empCode">
                Mã nhân viên <span className="req">*</span>
                <span className="opt">· 6 chữ số</span>
              </label>
              <input
                id="empCode"
                className={`input ${empCode && !empValid ? 'error' : ''}`}
                placeholder="VD: 262010"
                value={empCode}
                onChange={e => setEmpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
                autoFocus
              />
              {empCode && !empValid && (
                <span className="help error">⚠ Mã NV phải có đúng 6 chữ số</span>
              )}
              {empValid && (
                <span className="help success">✓ Hợp lệ</span>
              )}
            </div>

            <div className="field">
              <label className="label" htmlFor="name">
                Họ và tên <span className="req">*</span>
              </label>
              <input
                id="name"
                className="input"
                placeholder="Nguyễn Văn An"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={50}
              />
              <span className="help">Đúng theo tên trên hệ thống nhân sự</span>
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label className="label" htmlFor="bu">
                Business Unit (BU) <span className="req">*</span>
              </label>
              <input
                id="bu"
                className="input"
                placeholder="VD: ITS-PHX"
                value={bu}
                onChange={e => setBu(e.target.value.toUpperCase().slice(0, 20))}
                maxLength={20}
              />
              <span className="help">Mã phòng ban / BU của bạn (chữ hoa)</span>
            </div>
          </div>
          <div className="card-ft">
            <div className="row" style={{ gap: 8 }}>
              <span className="text-xs">🔒</span>
              <span>Hệ thống sẽ kiểm tra eligibility trước khi chuyển bước 2.</span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="text-xs text-muted">{validCount}/3 trường hợp lệ</span>
              <button type="submit" className={`btn ${allValid && !checking ? '' : 'disabled'}`} disabled={!allValid || checking}>
                {checking ? (
                  <>
                    <span className="dots"><span></span><span></span><span></span></span>
                    Đang kiểm tra...
                  </>
                ) : (
                  <>Tiếp tục →</>
                )}
              </button>
            </div>
          </div>
        </form>

        <div className="banner info mt-4">
          <span className="banner-icon">ⓘ</span>
          <div>
            <b>Sau khi đăng ký:</b> Bạn có thể đổi ca tối đa <b>3 lần</b> trước hạn chót.
            Liên hệ <a href="#" style={{ color: 'inherit', textDecoration: 'underline' }}>BTC Assessment</a> nếu cần hỗ trợ.
          </div>
        </div>
      </main>
    </div>
  );
}

Object.assign(window, { SignInScreen, Step1Form });

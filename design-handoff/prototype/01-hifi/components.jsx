// ─────────────────────────────────────────────────────────────────────────
// Shared components · Topbar, Stepper, Toast, Modal
// ─────────────────────────────────────────────────────────────────────────
const { useState, useEffect, useMemo, useRef, Fragment } = React;

// ─── Topbar ────────────────────────────────────────────────────────────
function Topbar({ user, deadline, showLogout = true, onLogout, onHome }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <a onClick={onHome} className="logo" style={{ cursor: onHome ? 'pointer' : 'default', textDecoration: 'none' }}>
            <span className="logo-mark">CL</span>
            <span style={{ display: 'none' }}>CyberLogitec</span>
          </a>
          <div style={{ width: 1, height: 24, background: 'var(--ink-150)' }}></div>
          <div className="topbar-title">
            <span className="t">Assessment Booking</span>
            <span className="s">Q2 2026 · English Proficiency Test</span>
          </div>
        </div>
        <div className="topbar-right">
          {deadline && <DeadlinePill {...deadline} />}
          {user && (
            <div className="user-chip" title={user.email}>
              <span className="avatar">{user.initials}</span>
              <span>{user.shortName}</span>
            </div>
          )}
          {showLogout && <button className="btn-link" onClick={onLogout}>Đăng xuất</button>}
        </div>
      </div>
    </header>
  );
}

function DeadlinePill({ daysLeft, hoursLeft }) {
  const state = daysLeft <= 1 ? 'danger' : daysLeft <= 3 ? 'warn' : 'brand';
  const text = daysLeft <= 1
    ? `Còn ${hoursLeft}h`
    : `Còn ${daysLeft} ngày`;
  return (
    <span className={`pill ${state}`}>
      <span>Hạn đăng ký: {text}</span>
    </span>
  );
}

// ─── Stepper ───────────────────────────────────────────────────────────
function Stepper({ current }) {
  const steps = [
    { n: 1, label: 'Thông tin' },
    { n: 2, label: 'Chọn ca thi' },
    { n: 3, label: 'Xác nhận' },
  ];
  return (
    <div className="stepper">
      {steps.map((s, i) => (
        <div key={s.n} style={{ display: 'contents' }}>
          <div className={`step ${current === s.n ? 'active' : ''} ${current > s.n ? 'done' : ''}`}>
            <div className="step-dot">{current > s.n ? '✓' : s.n}</div>
            <span className="step-label">{s.label}</span>
          </div>
          {i < steps.length - 1 && <div className={`step-line ${current > s.n ? 'done' : ''}`}></div>}
        </div>
      ))}
    </div>
  );
}

// ─── Modal ─────────────────────────────────────────────────────────────
function Modal({ title, subtitle, onClose, children, footer, maxWidth = 480 }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth }} onClick={e => e.stopPropagation()}>
        {(title || subtitle) && (
          <div className="modal-hd">
            {title && <div className="modal-title">{title}</div>}
            {subtitle && <div className="modal-sub">{subtitle}</div>}
          </div>
        )}
        <div className="modal-bd">{children}</div>
        {footer && <div className="modal-ft">{footer}</div>}
      </div>
    </div>
  );
}

// ─── Toast ─────────────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div className="toast-stack">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.kind || ''}`}>
          {t.icon && <span>{t.icon}</span>}
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const push = (msg, kind = '', ms = 3000) => {
    const id = Math.random().toString(36).slice(2);
    const icon = kind === 'success' ? '✓' : kind === 'danger' ? '!' : 'ⓘ';
    setToasts(ts => [...ts, { id, msg, kind, icon }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), ms);
  };
  return { toasts, push };
}

// ─── Section Title ─────────────────────────────────────────────────────
function SecTitle({ icon, text, accent }) {
  return (
    <div className="sec-title">
      {icon && <span className={`dot ${accent ? 'accent' : ''}`}>{icon}</span>}
      <span>{text}</span>
    </div>
  );
}

Object.assign(window, { Topbar, Stepper, Modal, Toast, useToast, SecTitle, DeadlinePill });

import { Fragment } from 'react';
import cltLogo from '../assets/clt-logo.jpg';
import { emailInitials, emailShortName, type DeadlineInfo } from './booking-utils';

// ─── Topbar ───────────────────────────────────────────────────────────────

export function Topbar({
  email,
  deadlineInfo,
  canAdmin,
  onOpenAdmin,
  onSignOut,
}: {
  email: string;
  deadlineInfo: DeadlineInfo | null;
  canAdmin?: boolean;
  onOpenAdmin?: () => void;
  onSignOut?: () => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <div className="logo">
            <img className="logo-img" src={cltLogo} alt="CLT" />
          </div>
          <div style={{ width: 1, height: 24, background: 'var(--ink-150)', flexShrink: 0 }} />
          <div className="topbar-title">
            <span className="t">Assessment Booking</span>
            <span className="s">Q2 2026 · English Proficiency Test</span>
          </div>
        </div>
        <div className="topbar-right">
          {deadlineInfo && !deadlineInfo.passed && (
            <span className={`pill ${deadlineInfo.urgent ? 'danger' : deadlineInfo.daysLeft <= 3 ? 'warn' : 'brand'}`}>
              ⏱ Hạn: {deadlineInfo.text}
            </span>
          )}
          {deadlineInfo?.passed && <span className="pill danger">Đã đóng đăng ký</span>}
          {canAdmin && onOpenAdmin && (
            <button className="admin-btn" onClick={onOpenAdmin}>🛠 Admin</button>
          )}
          <div className="user-chip" title={email}>
            <span className="avatar">{emailInitials(email)}</span>
            <span>{emailShortName(email)}</span>
          </div>
          {onSignOut && (
            <button className="topbar-signout" onClick={onSignOut} title="Đăng xuất" aria-label="Đăng xuất">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

// ─── Stepper ──────────────────────────────────────────────────────────────

export function Stepper({ current }: { current: number }) {
  const steps = [
    { n: 1, label: 'Thông tin' },
    { n: 2, label: 'Chọn ca thi' },
    { n: 3, label: 'Xác nhận' },
  ];
  return (
    <div className="stepper mb-5">
      {steps.map((s, i) => (
        <Fragment key={s.n}>
          <div className={`step ${current === s.n ? 'active' : ''} ${current > s.n ? 'done' : ''}`}>
            <div className="step-dot">{current > s.n ? '✓' : s.n}</div>
            <span className="step-label">{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`step-line ${current > s.n ? 'done' : ''}`} />
          )}
        </Fragment>
      ))}
    </div>
  );
}

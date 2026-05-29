import { Component, Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import {
  formatDateVi,
  minToHHmm,
  overlaps,
  type InitResult,
  type MyBooking,
  type Slot,
} from './lib/types';
import { initDb, bookDb, cancelDb, checkIneligibility } from './lib/db';
import { fetchAdminEmails, isAdmin } from './lib/admin';
import { AdminPanel } from './AdminPanel';
import { onAuth, signInWithGoogle, signOutUser } from './lib/firebase';
import type { User } from 'firebase/auth';

// ─── Types ────────────────────────────────────────────────────────────────

type FlowState = 'step1' | 'step2' | 'confirm' | 'success' | 'display';
type ToastItem = { id: string; kind: 'success' | 'error' | 'info'; text: string };
type Step1Data = { empCode: string; fullName: string; bu: string };
type Selection = { speakingId: string | null; skillsId: string | null };

// ─── Helpers ──────────────────────────────────────────────────────────────

function emailInitials(email: string): string {
  return email.split('@')[0].slice(0, 2).toUpperCase();
}

function emailShortName(email: string): string {
  return email.split('@')[0];
}

interface DeadlineInfo {
  daysLeft: number;
  hoursLeft: number;
  urgent: boolean;
  text: string;
  passed: boolean;
}

function computeDeadline(
  deadline: string | null,
  _serverNow: string,
  deadlinePassed: boolean,
  skew: number,
): DeadlineInfo | null {
  if (!deadline) return null;
  if (deadlinePassed)
    return { daysLeft: 0, hoursLeft: 0, urgent: true, text: 'Đã đóng đăng ký', passed: true };
  const diffMs = new Date(deadline).getTime() - (Date.now() + skew);
  if (diffMs <= 0)
    return { daysLeft: 0, hoursLeft: 0, urgent: true, text: 'Đã đóng đăng ký', passed: true };
  const totalMin = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  let text: string;
  if (totalMin < 60) text = `Còn ${mins} phút`;
  else if (days > 0) text = `Còn ${days} ngày ${hours} giờ`;
  else text = `Còn ${hours} giờ ${mins} phút`;
  return { daysLeft: days, hoursLeft: hours, urgent: totalMin < 60, text, passed: false };
}

function uniqueSortedDates(slots: Slot[]): string[] {
  return [...new Set(slots.map((s) => s.date))].sort();
}

function dayHeader(date: string): { abbr: string; label: string } {
  const d = new Date(date + 'T00:00:00');
  const abbrs = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const dd = d.getDate().toString().padStart(2, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  return { abbr: abbrs[d.getDay()], label: `${dd}/${mm}` };
}

function weekRangeLabel(dates: string[]): string {
  if (!dates.length) return '';
  const a = new Date(dates[0] + 'T00:00:00');
  const b = new Date(dates[dates.length - 1] + 'T00:00:00');
  return `Tuần ${a.getDate()}/${a.getMonth() + 1} – ${b.getDate()}/${b.getMonth() + 1}/${b.getFullYear()}`;
}

function daysUntil(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(isoDate + 'T00:00:00');
  return Math.max(0, Math.ceil((d.getTime() - today.getTime()) / 86_400_000));
}

type SlotSt = 'sel' | 'full' | 'conflict' | 'ok';

function slotSt(
  s: Slot,
  spSel: Slot | null,
  skSel: Slot | null,
  curSpId: string | null,
  curSkId: string | null,
): SlotSt {
  if (s.slotId === spSel?.slotId || s.slotId === skSel?.slotId) return 'sel';
  const isCur = s.slotId === curSpId || s.slotId === curSkId;
  if (s.remaining <= 0 && !isCur) return 'full';
  const other = s.type === 'Speaking' ? skSel : spSel;
  if (other && overlaps(s, other)) return 'conflict';
  return 'ok';
}

/** Accessible label for a slot button (replaces the inconsistently announced `title`). */
function slotAriaLabel(slot: Slot, st: SlotSt, deadlinePassed: boolean): string {
  const time = `${minToHHmm(slot.startMin)}–${minToHHmm(slot.endMin)}`;
  const loc = slot.location ? ` · ${slot.location}` : '';
  const seats = `Còn ${slot.remaining}/${slot.capacity} chỗ`;
  if (deadlinePassed && st !== 'sel') return `Ca ${slot.type} ${time}${loc} · ${seats} (đã hết hạn đăng ký)`;
  switch (st) {
    case 'sel': return `Đang chọn ca ${slot.type} ${time}${loc} · ${seats} · Bấm để bỏ chọn`;
    case 'full': return `Ca ${slot.type} ${time}${loc} · Đã hết chỗ`;
    case 'conflict': return `Ca ${slot.type} ${time}${loc} · Trùng giờ với ca đã chọn`;
    default: return `Chọn ca ${slot.type} ${time}${loc} · ${seats}`;
  }
}

function genId(): string {
  return Math.random().toString(36).slice(2);
}

/** Remove Vietnamese diacritics and convert to uppercase. */
function toUpperNoAccent(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // remove combining diacritical marks
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase();
}

// ─── App ──────────────────────────────────────────────────────────────────

export function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

function AppInner() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [data, setData] = useState<InitResult | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [screen, setScreen] = useState<FlowState>('step1');
  const [step1, setStep1] = useState<Step1Data>({ empCode: '', fullName: '', bu: '' });
  const [selection, setSelection] = useState<Selection>({ speakingId: null, skillsId: null });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [canAdmin, setCanAdmin] = useState(false);
  const skewRef = useRef(0);
  const [_tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!data?.email) return;
    setCanAdmin(isAdmin(data.email));
    fetchAdminEmails()
      .then(() => setCanAdmin(isAdmin(data.email)))
      .catch(() => {});
  }, [data?.email]);

  // Firebase Auth listener — run once
  useEffect(() => {
    const unsub = onAuth((u) => {
      setAuthUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Load data after auth is resolved and user is signed in
  useEffect(() => {
    if (!authUser?.email) return;
    initDb(authUser.email)
      .then((d) => {
        skewRef.current = new Date(d.serverNow).getTime() - Date.now();
        setData(d);
        if (d.myBooking) {
          setScreen('display');
          setStep1({ empCode: d.myBooking.empCode, fullName: d.myBooking.fullName, bu: d.myBooking.bu });
          setSelection({ speakingId: d.myBooking.speakingSlotId, skillsId: d.myBooking.skillsSlotId });
        } else {
          setScreen('step1');
        }
      })
      .catch((e: Error) => setLoadErr(e.message || 'Không tải được dữ liệu.'));
  }, [authUser?.email]);

  const pushToast = useCallback((kind: ToastItem['kind'], text: string) => {
    const id = genId();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const openAdmin = useCallback(async () => {
    try {
        let email = authUser?.email ?? null;
      if (!email) {
        const cred = await signInWithGoogle();
        email = cred.user?.email ?? null;
      }
      if (!email) {
        pushToast('error', 'Không lấy được email đăng nhập Google.');
        return;
      }
      await fetchAdminEmails().catch(() => {});
      if (!isAdmin(email)) {
        pushToast('error', `Tài khoản ${email} không có quyền admin.`);
        return;
      }
        setAdminOpen(true);
    } catch (e) {
      const msg = (e as Error)?.message || String(e);
      if (!/popup-closed|cancelled-popup|popup-blocked/i.test(msg)) {
        pushToast('error', 'Đăng nhập admin thất bại: ' + msg);
      }
    }
  }, [pushToast]);

  const handleSignOut = useCallback(async () => {
    if (!window.confirm('Đăng xuất sẽ thoát phiên đăng nhập hiện tại. Tiếp tục?')) return;
    try { await signOutUser(); } catch { /* ignore */ }
  }, []);

  // Auth loading state
  if (authLoading) {
    return (
      <div className="app">
        <div className="loading-screen">
          <div className="spinner" />
          Đang xác thực…
        </div>
      </div>
    );
  }

  // Not signed in → show sign-in screen
  if (!authUser) {
    return (
      <div className="app">
        <header className="topbar">
          <div className="topbar-inner">
            <div className="topbar-left">
              <div className="logo"><span className="logo-mark">CL</span></div>
              <div style={{ width: 1, height: 24, background: 'var(--ink-150)', flexShrink: 0 }} />
              <div className="topbar-title">
                <span className="t">Assessment Booking</span>
                <span className="s">Q2 2026 · English Proficiency Test</span>
              </div>
            </div>
          </div>
        </header>
        <main className="container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Đăng nhập để tiếp tục</h2>
          <p className="text-sm text-muted" style={{ marginBottom: '2rem' }}>
            Bạn cần đăng nhập bằng tài khoản Google để sử dụng hệ thống đặt lịch Assessment.
          </p>
          <button className="btn" onClick={() => signInWithGoogle().catch((e) => {
            if (!/popup-closed|cancelled-popup|popup-blocked/i.test(e.message || '')) {
              pushToast('error', 'Đăng nhập thất bại: ' + (e.message || e));
            }
          })}>
            Đăng nhập với Google
          </button>
        </main>
        <ToastStack toasts={toasts} />
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className="app">
        <div className="error-screen">
          <div className="error-icon">⚠</div>
          <h2>Không tải được dữ liệu</h2>
          <p>{loadErr}</p>
          <button className="btn" onClick={() => window.location.reload()}>Tải lại</button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app">
        <div className="loading-screen">
          <div className="spinner" />
          Đang tải…
        </div>
      </div>
    );
  }

  if (adminOpen) {
    return <AdminPanel adminEmail={data.email} onExit={() => setAdminOpen(false)} />;
  }

  const deadlineInfo = computeDeadline(data.deadline, data.serverNow, data.deadlinePassed, skewRef.current);
  const spSel = data.slots.find((s) => s.slotId === selection.speakingId) ?? null;
  const skSel = data.slots.find((s) => s.slotId === selection.skillsId) ?? null;
  const curSpId = isEditing ? (data.myBooking?.speakingSlotId ?? null) : null;
  const curSkId = isEditing ? (data.myBooking?.skillsSlotId ?? null) : null;

  const topbar = (
    <Topbar
      email={data.email}
      deadlineInfo={deadlineInfo}
      canAdmin={canAdmin}
      onOpenAdmin={openAdmin}
      onSignOut={handleSignOut}
    />
  );

  // ── Step 1
  if (screen === 'step1') {
    if (!isEditing && !data.allowEnrollment) {
      return (
        <div className="app">
          {topbar}
          <main className="container">
            <div className="banner warn mt-4">
              <span className="banner-icon">🔒</span>
              <div>Đăng ký hiện đang bị khoá. Vui lòng liên hệ Ban tổ chức.</div>
            </div>
          </main>
        </div>
      );
    }
    if (!isEditing && data.deadlinePassed) {
      return (
        <div className="app">
          {topbar}
          <main className="container">
            <div className="banner danger mt-4">
              <span className="banner-icon">⏰</span>
              <div>Đã hết hạn đăng ký. Bạn chưa đăng ký ca thi — vui lòng liên hệ Ban tổ chức.</div>
            </div>
          </main>
        </div>
      );
    }
    return (
      <div className="app">
        {topbar}
        <main className="container">
          <Step1Form
            initial={step1}
            onContinue={(d) => { setStep1(d); setScreen('step2'); }}
            onCancel={isEditing ? () => { setIsEditing(false); setScreen('display'); } : undefined}
          />
        </main>
        <ToastStack toasts={toasts} />
      </div>
    );
  }

  // ── Step 2 + Confirm overlay
  if (screen === 'step2' || screen === 'confirm') {
    const canSubmit = !!(selection.speakingId && selection.skillsId);

    const handleConfirmSubmit = async () => {
      if (!selection.speakingId || !selection.skillsId) return;
      // F13: editing with same slots → no-op, no quota consumed
      if (isEditing && selection.speakingId === curSpId && selection.skillsId === curSkId) {
        setIsEditing(false);
        setScreen('display');
        return;
      }
      try {
        // bookDb() enforces the blocklist server-side and returns res.error,
        // which is surfaced below — covers any path that skipped the Step 1 gate.
        const res = await bookDb(data.email, {
          empCode: step1.empCode,
          fullName: step1.fullName,
          bu: step1.bu,
          speakingSlotId: selection.speakingId,
          skillsSlotId: selection.skillsId,
        });
        if (!res.ok) {
          pushToast('error', res.error || 'Đăng ký thất bại.');
          if (res.state) setData(res.state);
          setScreen('step2');
        } else if (res.state) {
          setData(res.state);
          setIsEditing(false);
          setScreen('success');
        } else {
          pushToast('error', 'Đăng ký thành công nhưng không nhận được state. Tải lại trang.');
          setScreen('step2');
        }
      } catch (e) {
        pushToast('error', (e as Error).message || 'Đăng ký thất bại.');
        setScreen('step2');
      }
    };

    return (
      <div className="app">
        {topbar}
        <main className="container wide" style={{ paddingBottom: 24 }}>
          <CalendarStep
            step1={step1}
            slots={data.slots}
            selection={selection}
            setSelection={setSelection}
            curSpId={curSpId}
            curSkId={curSkId}
            deadlinePassed={data.deadlinePassed}
            onBack={() => setScreen('step1')}
          />
        </main>

        {screen === 'confirm' && (
          <ConfirmModal
            step1={step1}
            slots={data.slots}
            selection={selection}
            isEditing={isEditing}
            maxChanges={data.maxChanges}
            onCancel={() => setScreen('step2')}
            onConfirm={handleConfirmSubmit}
          />
        )}

        <div className="sticky-summary">
          <div className="sticky-summary-inner">
            <div className="summary-items">
              <div className={`summary-item ${spSel ? 'filled' : ''}`}>
                <div className="badge">①</div>
                <div>
                  <div className="lbl">Speaking</div>
                  <div className={`val ${spSel ? '' : 'empty'}`}>
                    {spSel
                      ? `${formatDateVi(spSel.date)} · ${minToHHmm(spSel.startMin)}–${minToHHmm(spSel.endMin)}`
                      : 'Chưa chọn ca'}
                  </div>
                </div>
              </div>
              <div className={`summary-item ${skSel ? 'filled' : ''}`}>
                <div className="badge">②</div>
                <div>
                  <div className="lbl">3 Skills</div>
                  <div className={`val ${skSel ? '' : 'empty'}`}>
                    {skSel
                      ? `${formatDateVi(skSel.date)} · ${minToHHmm(skSel.startMin)}–${minToHHmm(skSel.endMin)}`
                      : 'Chưa chọn ca'}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="btn ghost" onClick={() => setScreen('step1')}>← Quay lại</button>
              <button
                className={`btn ${canSubmit ? '' : 'disabled'}`}
                disabled={!canSubmit}
                onClick={() => setScreen('confirm')}
              >
                Tiếp tục →
              </button>
            </div>
          </div>
        </div>

        <ToastStack toasts={toasts} />
      </div>
    );
  }

  // ── Success
  if (screen === 'success') {
    return (
      <div className="app">
        {topbar}
        <main className="container">
          <SuccessScreen
            email={data.email}
            step1={step1}
            slots={data.slots}
            selection={selection}
            maxChanges={data.maxChanges}
            changeCount={data.myBooking?.changeCount ?? 0}
            onViewDetail={() => {
              if (data.myBooking) {
                setSelection({ speakingId: data.myBooking.speakingSlotId, skillsId: data.myBooking.skillsSlotId });
              }
              setScreen('display');
            }}
          />
        </main>
      </div>
    );
  }

  // ── Display
  if (screen === 'display' && data.myBooking) {
    return (
      <div className="app">
        {topbar}
        <main className="container">
          <BookingDisplay
            email={data.email}
            booking={data.myBooking}
            slots={data.slots}
            deadlinePassed={data.deadlinePassed}
            maxChanges={data.maxChanges}
            onEdit={() => {
              setIsEditing(true);
              if (data.myBooking) {
                setSelection({ speakingId: data.myBooking.speakingSlotId, skillsId: data.myBooking.skillsSlotId });
              }
              setScreen('step2');
            }}
            onCancelled={(newState) => {
              pushToast('success', 'Đã hủy đăng ký.');
              setData(newState);
              setStep1({ empCode: '', fullName: '', bu: '' });
              setSelection({ speakingId: null, skillsId: null });
              setIsEditing(false);
              setScreen('step1');
            }}
            onError={(msg) => pushToast('error', msg)}
          />
        </main>
        <ToastStack toasts={toasts} />
      </div>
    );
  }

  return null;
}

// ─── Topbar ───────────────────────────────────────────────────────────────

function Topbar({
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
            <span className="logo-mark">CL</span>
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

function Stepper({ current }: { current: number }) {
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

const BU_LIST = ['BSG', 'CHORUS', 'LBU', 'MOC', 'ONC', 'POC', 'TBU'];

// ─── Step 1 · Info Form ───────────────────────────────────────────────────

function Step1Form({
  initial,
  onContinue,
  onCancel,
}: {
  initial: Step1Data;
  onContinue: (d: Step1Data) => void;
  onCancel?: () => void;
}) {
  const [empCode, setEmpCode] = useState(initial.empCode);
  const [fullName, setFullName] = useState(initial.fullName);
  const [bu, setBu] = useState(initial.bu);
  const [checking, setChecking] = useState(false);
  const [blockErr, setBlockErr] = useState<string | null>(null);

  const empValid = /^\d{6}$/.test(empCode);
  const nameValid = fullName.trim().length >= 2;
  const buValid = BU_LIST.includes(bu);
  const allValid = empValid && nameValid && buValid;
  const validCount = [empValid, nameValid, buValid].filter(Boolean).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allValid || checking) return;
    setBlockErr(null);
    setChecking(true);
    try {
      // Pre-flight blocklist check via Firestore /ineligibility collection.
      // bookDb() enforces the same list server-side as the hard guarantee.
      const reason = await checkIneligibility(empCode);
      if (reason) {
        setBlockErr(reason);
        return;
      }
      onContinue({ empCode, fullName: fullName.trim(), bu });
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <Stepper current={1} />
      <form className="card" onSubmit={handleSubmit}>
        <div className="card-hd">
          <div className="card-title">Thông tin học viên</div>
          <div className="card-sub">
            Điền chính xác để hệ thống xác nhận eligibility trước khi chọn ca thi.
          </div>
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
              onChange={(e) => { setEmpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setBlockErr(null); }}
              inputMode="numeric"
              maxLength={6}
              autoFocus
            />
            {empCode && !empValid && <span className="help error">⚠ Mã NV phải có đúng 6 chữ số</span>}
            {empValid && <span className="help success">✓ Hợp lệ</span>}
          </div>

          <div className="field">
            <label className="label" htmlFor="fullName">
              Họ và tên <span className="req">*</span>
            </label>
            <input
              id="fullName"
              className="input"
              placeholder="NGUYEN VAN AN"
              value={fullName}
              onChange={(e) => setFullName(toUpperNoAccent(e.target.value))}
              maxLength={50}
              style={{ textTransform: 'uppercase' }}
            />
            <span className="help">Không dấu, in hoa · Đúng theo tên trên hệ thống nhân sự</span>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="bu">
              Business Unit (BU) <span className="req">*</span>
            </label>
            <select
              id="bu"
              className="input"
              value={bu}
              onChange={(e) => setBu(e.target.value)}
            >
              <option value="">— Chọn BU —</option>
              {BU_LIST.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          {blockErr && (
            <div className="banner danger" style={{ marginTop: 'var(--s-4)' }}>
              <span className="banner-icon">⛔</span>
              <div>
                <b>Không thể tiếp tục.</b> {blockErr}
              </div>
            </div>
          )}
        </div>
        <div className="card-ft">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {onCancel && (
              <button type="button" className="btn ghost sm" onClick={onCancel}>
                ← Hủy
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="text-xs text-muted">{validCount}/3 trường hợp lệ</span>
            <button
              type="submit"
              className={`btn ${allValid && !checking ? '' : 'disabled'}`}
              disabled={!allValid || checking}
            >
              {checking ? (
                <>
                  <span className="dots">
                    <span />
                    <span />
                    <span />
                  </span>
                  Đang kiểm tra...
                </>
              ) : (
                'Tiếp tục →'
              )}
            </button>
          </div>
        </div>
      </form>

      <div className="banner info mt-4">
        <span className="banner-icon">ⓘ</span>
        <div>
          <b>Sau khi đăng ký:</b> Bạn có thể đổi ca tối đa <b>3 lần</b> trước hạn chót. Liên hệ BTC
          Assessment nếu cần hỗ trợ.
        </div>
      </div>
    </>
  );
}

// ─── Step 2 · Calendar ────────────────────────────────────────────────────

// px per hour row · MUST match --row-h in .cal (styles.css)
const ROW_H = 64;

function CalendarStep({
  step1,
  slots,
  selection,
  setSelection,
  curSpId,
  curSkId,
  deadlinePassed,
  onBack,
}: {
  step1: Step1Data;
  slots: Slot[];
  selection: Selection;
  setSelection: React.Dispatch<React.SetStateAction<Selection>>;
  curSpId: string | null;
  curSkId: string | null;
  deadlinePassed: boolean;
  onBack: () => void;
}) {
  const dates = useMemo(() => uniqueSortedDates(slots), [slots]);
  const spSel = slots.find((s) => s.slotId === selection.speakingId) ?? null;
  const skSel = slots.find((s) => s.slotId === selection.skillsId) ?? null;

  // Which type is the user currently picking? Default to whichever is still unfilled.
  const [activeType, setActiveType] = useState<Slot['type']>(() =>
    selection.speakingId && !selection.skillsId ? '3 Skills' : 'Speaking',
  );
  const [flashMsg, setFlashMsg] = useState<string | null>(null);
  const [flashPulse, setFlashPulse] = useState<'sp' | 'sk' | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const tone = activeType === 'Speaking' ? 'sp' : 'sk';
  // The OTHER type's selection — drawn as a dashed "locked" ghost on the active calendar.
  const lockedOther = activeType === 'Speaking' ? skSel : spSel;

  // Hour range spans ALL slots so the grid height stays stable when switching tabs.
  const startMins = slots.map((s) => s.startMin);
  const endMins = slots.map((s) => s.endMin);
  const firstHour = startMins.length ? Math.floor(Math.min(...startMins) / 60) : 8;
  const lastHour = endMins.length ? Math.ceil(Math.max(...endMins) / 60) : 18;
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);

  const byDate = useMemo(() => {
    const m: Record<string, Slot[]> = {};
    dates.forEach((d) => { m[d] = slots.filter((s) => s.date === d && s.type === activeType); });
    return m;
  }, [slots, dates, activeType]);

  function onClickSlot(slot: Slot) {
    const st = slotSt(slot, spSel, skSel, curSpId, curSkId);
    if (st === 'full' || st === 'conflict' || deadlinePassed) return;
    const isPicking =
      (slot.type === 'Speaking' ? selection.speakingId : selection.skillsId) !== slot.slotId;
    if (slot.type === 'Speaking') {
      setSelection((sel) => ({ ...sel, speakingId: sel.speakingId === slot.slotId ? null : slot.slotId }));
    } else {
      setSelection((sel) => ({ ...sel, skillsId: sel.skillsId === slot.slotId ? null : slot.slotId }));
    }
    // After picking a type, auto-switch to the other tab if it is still empty.
    if (isPicking) {
      const otherPicked = slot.type === 'Speaking' ? !!selection.skillsId : !!selection.speakingId;
      if (!otherPicked) {
        const doneLabel = slot.type === 'Speaking' ? 'Speaking' : '3 Skills';
        const nextLabel = slot.type === 'Speaking' ? '3 Skills' : 'Speaking';
        const pulseSide: 'sp' | 'sk' = slot.type === 'Speaking' ? 'sp' : 'sk';
        // Show flash message and pulse on completed tab
        setFlashMsg(`Đã chọn ${doneLabel} ✓ — giờ chọn ${nextLabel}`);
        setFlashPulse(pulseSide);
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = setTimeout(() => { setFlashMsg(null); setFlashPulse(null); }, 2500);
        setTimeout(() => setActiveType(slot.type === 'Speaking' ? '3 Skills' : 'Speaking'), 300);
      }
    }
  }

  const initials = step1.fullName.trim().slice(0, 2).toUpperCase() || '??';
  const activeSlots = slots.filter((s) => s.type === activeType);
  const activeAvail = activeSlots.filter((s) => s.remaining > 0).length;

  return (
    <>
      <Stepper current={2} />

      <div className="profile-row">
        <div className="info">
          <span className="avatar">{initials}</span>
          <b>{step1.fullName}</b>
          <span className="info-sep" />
          <span>Mã NV: <b>{step1.empCode}</b></span>
          <span className="info-sep" />
          <span>BU: <b>{step1.bu}</b></span>
        </div>
        <button className="btn-link" onClick={onBack}>← Sửa thông tin</button>
      </div>

      <div className="mb-3">
        <h1 style={{ fontSize: 'var(--fs-xl)', letterSpacing: '-.02em' }}>Chọn 2 ca thi của bạn</h1>
        <p className="text-sm text-muted mt-1">
          Chọn lần lượt <b style={{ color: 'var(--brand-700)' }}>1 ca Speaking</b> và{' '}
          <b style={{ color: 'var(--accent-700)' }}>1 ca 3 Skills</b>. Hệ thống tự khoá ca trùng giờ với lựa chọn của bạn.
        </p>
      </div>

      {flashMsg && (
        <div className="flash-msg" role="status" aria-live="polite">
          {flashMsg}
        </div>
      )}
      <div className="type-tabs">
        <TypeTab
          tone="sp"
          num="1"
          active={activeType === 'Speaking'}
          picked={!!spSel}
          label="Speaking"
          duration="60 phút"
          statusText={spSel ? `${dayHeader(spSel.date).label} · ${minToHHmm(spSel.startMin)}–${minToHHmm(spSel.endMin)}` : 'Click chọn ca'}
          onClick={() => setActiveType('Speaking')}
          pulse={flashPulse === 'sp'}
        />
        <TypeTab
          tone="sk"
          num="2"
          active={activeType === '3 Skills'}
          picked={!!skSel}
          label="3 Skills"
          duration="150 phút"
          statusText={skSel ? `${dayHeader(skSel.date).label} · ${minToHHmm(skSel.startMin)}–${minToHHmm(skSel.endMin)}` : 'Click chọn ca'}
          onClick={() => setActiveType('3 Skills')}
          pulse={flashPulse === 'sk'}
        />
      </div>

      <div className={`cal-wrap tone-${tone}`} role="region" aria-label={`Lịch ca ${activeType}`}>
        <div className="cal-toolbar">
          <div className="week-nav">
            <button className="iconbtn" disabled aria-label="Tuần trước">‹</button>
            <span className="week-label">{weekRangeLabel(dates)}</span>
            <button className="iconbtn" disabled aria-label="Tuần sau">›</button>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="text-xs text-muted">
              Đang xem{' '}
              <b style={{ color: activeType === 'Speaking' ? 'var(--brand-700)' : 'var(--accent-700)' }}>{activeType}</b>{' '}
              · {activeAvail} ca còn chỗ · {activeSlots.length} tổng
            </span>
            {lockedOther && (
              <span className="locked-chip">
                ✓ {lockedOther.type} đã chọn: {dayHeader(lockedOther.date).label} · {minToHHmm(lockedOther.startMin)}
              </span>
            )}
          </div>
        </div>

        {/* F16 — No slots at all */}
        {dates.length === 0 ? (
          <div className="cal-empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <p className="ces-title">Chưa có ca thi nào</p>
            <p className="ces-body">Lịch thi chưa được mở. Vui lòng liên hệ Ban tổ chức hoặc thử tải lại.</p>
            <button className="btn ghost" style={{ marginTop: 'var(--s-4)' }} onClick={() => window.location.reload()}>
              ↺ Tải lại
            </button>
          </div>
        ) : (
          <div className="cal">
            {/* Header · sticky day labels */}
            <div
              className="cal-header"
              style={{ gridTemplateColumns: `var(--gutter) repeat(${dates.length}, 1fr)` }}
            >
              <div className="cal-corner" />
              {dates.map((date) => {
                const { abbr, label } = dayHeader(date);
                return (
                  <div key={date} className="cal-dayhead">
                    <span className="dh-day">{abbr}</span>
                    <span className="dh-date">{label}</span>
                  </div>
                );
              })}
            </div>

            {/* F16 — No slots of active type (other type may have slots) */}
            {activeSlots.length === 0 ? (
              <div className="cal-type-empty">
                <p>Không có ca <b>{activeType}</b> nào trong lịch thi.</p>
                <button
                  className="btn-link"
                  onClick={() => setActiveType(activeType === 'Speaking' ? '3 Skills' : 'Speaking')}
                >
                  Chuyển sang tab <b>{activeType === 'Speaking' ? '3 Skills' : 'Speaking'}</b> →
                </button>
              </div>
            ) : (
              /* Body · gutter + full-height day columns (blocks positioned by minute) */
              <div
                className="cal-body"
                style={{
                  gridTemplateColumns: `var(--gutter) repeat(${dates.length}, 1fr)`,
                  height: hours.length * ROW_H,
                }}
              >
                <div className="cal-gutter">
                  {hours.map((h, i) => (
                    <span
                      key={h}
                      className={`cal-hourlabel${i === 0 ? ' first' : ''}`}
                      style={{ top: i * ROW_H }}
                    >
                      {String(h).padStart(2, '0')}:00
                    </span>
                  ))}
                </div>

                {dates.map((date) => {
                  const showLocked = !!lockedOther && lockedOther.date === date;
                  return (
                    <div key={date} className="cal-col">
                      {showLocked && lockedOther && (
                        /* F17 — ghost is purely decorative; screen readers skip it */
                        <div
                          className={`ev ghost ${lockedOther.type === 'Speaking' ? 'sp' : 'sk'}`}
                          style={{
                            top: ((lockedOther.startMin - firstHour * 60) / 60) * ROW_H + 2,
                            height: ((lockedOther.endMin - lockedOther.startMin) / 60) * ROW_H - 4,
                          }}
                          aria-hidden="true"
                        >
                          <div className="ev-time">
                            {minToHHmm(lockedOther.startMin)}–{minToHHmm(lockedOther.endMin)}
                          </div>
                          <div className="ev-meta">
                            <span className="ev-room">{lockedOther.type} · đã chọn</span>
                          </div>
                        </div>
                      )}
                      {(byDate[date] ?? []).map((slot) => {
                        const st = slotSt(slot, spSel, skSel, curSpId, curSkId);
                        const topPx = ((slot.startMin - firstHour * 60) / 60) * ROW_H + 2;
                        const heightPx = ((slot.endMin - slot.startMin) / 60) * ROW_H - 4;
                        const isSp = slot.type === 'Speaking';
                        const low =
                          st === 'ok' && slot.capacity > 0 && slot.remaining / slot.capacity <= 0.3;
                        return (
                          <button
                            key={slot.slotId}
                            className={['ev', isSp ? 'sp' : 'sk', st === 'sel' ? 'sel' : '', st === 'full' ? 'full' : '', st === 'conflict' ? 'conflict' : '']
                              .filter(Boolean)
                              .join(' ')}
                            style={{ top: topPx, height: heightPx }}
                            onClick={() => onClickSlot(slot)}
                            disabled={st === 'full' || st === 'conflict' || deadlinePassed}
                            aria-label={slotAriaLabel(slot, st, deadlinePassed)}
                          >
                            <div className="ev-time">
                              {minToHHmm(slot.startMin)}–{minToHHmm(slot.endMin)}
                            </div>
                            <div className="ev-meta">
                              <span className="ev-room">{slot.location.split(' · ')[0]}</span>
                              {st === 'conflict' ? (
                                <span className="ev-rem">Trùng giờ</span>
                              ) : st === 'full' ? (
                                <span className="ev-rem">Hết chỗ</span>
                              ) : (
                                <span className={`ev-rem ${low ? 'warn' : ''}`}>Còn {slot.remaining}</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-muted mt-3">
        💡 <b>Mẹo:</b> Chọn xong một ca sẽ tự nhảy sang tab còn lại. Block nét đứt là ca bạn đã chọn ở
        tab kia; block gạch chéo là trùng giờ.
      </p>
    </>
  );
}

// ─── Type Tab · segmented control above the calendar ──────────────────────

function TypeTab({
  tone,
  num,
  active,
  picked,
  label,
  duration,
  statusText,
  onClick,
  pulse,
}: {
  tone: 'sp' | 'sk';
  num: string;
  active: boolean;
  picked: boolean;
  label: string;
  duration: string;
  statusText: string;
  onClick: () => void;
  pulse?: boolean;
}) {
  return (
    <button
      className={`type-tab ${tone} ${active ? 'active' : ''} ${picked ? 'picked' : ''} ${pulse ? 'pulse' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <div className="tt-num">{picked ? '✓' : num}</div>
      <div className="tt-body">
        <div className="tt-label">
          {label}
          <span className="tt-dur"> · {duration}</span>
        </div>
        <div className={`tt-status ${picked ? 'picked' : ''}`}>{statusText}</div>
      </div>
      {active && <div className="tt-indicator" aria-hidden />}
    </button>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────

function ConfirmModal({
  step1,
  slots,
  selection,
  isEditing,
  maxChanges,
  onCancel,
  onConfirm,
}: {
  step1: Step1Data;
  slots: Slot[];
  selection: Selection;
  isEditing: boolean;
  maxChanges: number;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const sp = slots.find((s) => s.slotId === selection.speakingId);
  const sk = slots.find((s) => s.slotId === selection.skillsId);

  async function handleConfirm() {
    setSubmitting(true);
    await onConfirm();
    // If onConfirm redirects screen, this component unmounts — setSubmitting(false) is no-op
    setSubmitting(false);
  }

  return (
    <Modal
      title={isEditing ? 'Xác nhận đổi ca' : 'Xác nhận đăng ký'}
      subtitle="Vui lòng kiểm tra kỹ trước khi gửi. Sau đăng ký bạn vẫn có thể đổi ca."
      onClose={onCancel}
      footer={
        <>
          <button className="btn ghost" onClick={onCancel} disabled={submitting}>
            ← Quay lại sửa
          </button>
          <button
            className={`btn ${submitting ? 'disabled' : ''}`}
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="dots">
                  <span />
                  <span />
                  <span />
                </span>
                Đang gửi...
              </>
            ) : isEditing ? (
              'Xác nhận đổi ca'
            ) : (
              'Xác nhận đăng ký'
            )}
          </button>
        </>
      }
    >
      <div className="sec-title">
        <span className="dot"><svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><circle cx="5" cy="3.2" r="2"/><path d="M1 9c0-2.2 1.8-3.8 4-3.8s4 1.6 4 3.8"/></svg></span>Học viên
      </div>
      <div
        style={{
          background: 'var(--ink-25)',
          padding: 'var(--s-3) var(--s-4)',
          borderRadius: 'var(--r-md)',
          marginBottom: 'var(--s-4)',
        }}
      >
        <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{step1.fullName}</div>
        <div className="text-sm text-muted mt-1">
          Mã NV: <b style={{ color: 'var(--ink-800)' }}>{step1.empCode}</b> · BU:{' '}
          <b style={{ color: 'var(--ink-800)' }}>{step1.bu}</b>
        </div>
      </div>

      <div className="sec-title">
        <span className="dot accent"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><rect x="1" y="1.5" width="8" height="7.5" rx="1.2"/><line x1="3" y1="0.5" x2="3" y2="2.5"/><line x1="7" y1="0.5" x2="7" y2="2.5"/><line x1="1" y1="4" x2="9" y2="4"/></svg></span>2 ca thi đã chọn
      </div>
      <div className="col mb-4" style={{ gap: 'var(--s-2)' }}>
        {sp && <SlotCard slot={sp} index={1} />}
        {sk && <SlotCard slot={sk} index={2} />}
      </div>

      <div className="banner warn">
        <span className="banner-icon">⚠</span>
        <div>
          <b>Sau khi đăng ký</b> bạn còn <b>{maxChanges} lần đổi ca</b>. Hết quota sẽ phải liên hệ BTC.
        </div>
      </div>
    </Modal>
  );
}

// ─── Success Screen ───────────────────────────────────────────────────────

function SuccessScreen({
  email,
  step1,
  slots,
  selection,
  maxChanges,
  changeCount,
  onViewDetail,
}: {
  email: string;
  step1: Step1Data;
  slots: Slot[];
  selection: Selection;
  maxChanges: number;
  changeCount: number;
  onViewDetail: () => void;
}) {
  const sp = slots.find((s) => s.slotId === selection.speakingId);
  const sk = slots.find((s) => s.slotId === selection.skillsId);
  const ordered = ([sp, sk].filter(Boolean) as Slot[]).sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.startMin - b.startMin,
  );
  const first = ordered[0];
  const countdown = first ? daysUntil(first.date) : 0;
  const changesLeft = Math.max(0, maxChanges - changeCount);

  return (
    <>
      <div className="success-hero">
        <div className="success-check">✓</div>
        <h1 className="success-title">Đăng ký thành công!</h1>
        <p className="success-sub">
          {step1.fullName} · {step1.empCode}
        </p>
      </div>

      {first && (
        <div className="countdown">
          <div className="meta">
            <div className="lbl">Còn đến ca thi gần nhất</div>
            <div className="when">
              {first.type === 'Speaking' ? 'Speaking' : '3 Skills'} ·{' '}
              {dayHeader(first.date).label} · {minToHHmm(first.startMin)}
            </div>
          </div>
          <div className="big">
            <div className="n">{countdown}</div>
            <div className="u">ngày</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-hd">
          <div className="card-title">Lịch thi của bạn</div>
          <div className="card-sub">
            Email xác nhận đã gửi đến <b>{email}</b>.
          </div>
        </div>
        <div className="card-bd">
          <div className="col" style={{ gap: 'var(--s-3)' }}>
            {ordered.map((slot, i) => (
              <SlotCard key={slot.slotId} slot={slot} index={i + 1} />
            ))}
          </div>
        </div>
        <div className="card-ft">
          <span>
            Còn <b style={{ color: 'var(--ink-900)' }}>{changesLeft}/{maxChanges}</b> lần đổi ca
          </span>
          <button className="btn ghost sm" onClick={onViewDetail}>
            Xem chi tiết →
          </button>
        </div>
      </div>

      <div className="banner info mt-4">
        <span className="banner-icon">📨</span>
        <div>
          <b>Lưu ý:</b> Mang theo CCCD/Thẻ NV khi tới phòng thi. Reminder sẽ gửi trước ngày thi 7
          / 3 / 1 ngày.
        </div>
      </div>
    </>
  );
}

// ─── Booking Display ──────────────────────────────────────────────────────

function BookingDisplay({
  email,
  booking,
  slots,
  deadlinePassed,
  maxChanges,
  onEdit,
  onCancelled,
  onError,
}: {
  email: string;
  booking: MyBooking;
  slots: Slot[];
  deadlinePassed: boolean;
  maxChanges: number;
  onEdit: () => void;
  onCancelled: (state: InitResult) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const sp = slots.find((s) => s.slotId === booking.speakingSlotId);
  const sk = slots.find((s) => s.slotId === booking.skillsSlotId);
  const ordered = ([sp, sk].filter(Boolean) as Slot[]).sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.startMin - b.startMin,
  );
  const first = ordered[0];
  const countdown = first ? daysUntil(first.date) : 0;
  const changesLeft = Math.max(0, maxChanges - booking.changeCount);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  async function handleCancel() {
    if (!window.confirm('Hủy đăng ký 2 ca thi của bạn? Bạn có thể đăng ký lại trước hạn.')) return;
    setMenuOpen(false);
    setBusy(true);
    try {
      const res = await cancelDb(email);
      if (!res.ok) onError(res.error || 'Hủy thất bại.');
      else if (res.state) onCancelled(res.state);
      else onError('Đã hủy nhưng không nhận được state mới. Vui lòng tải lại.');
    } catch (e) {
      onError((e as Error).message || 'Hủy thất bại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 'var(--s-4)',
        }}
      >
        <h1 style={{ fontSize: 'var(--fs-xl)' }}>Lịch thi của bạn</h1>
        <span className="pill success">✓ Đã đăng ký</span>
      </div>

      {first && (
        <div className="countdown mb-4">
          <div className="meta">
            <div className="lbl">Còn đến ca thi gần nhất</div>
            <div className="when">
              {first.type === 'Speaking' ? 'Speaking' : '3 Skills'} ·{' '}
              {dayHeader(first.date).label} · {minToHHmm(first.startMin)}
            </div>
          </div>
          <div className="big">
            <div className="n">{countdown}</div>
            <div className="u">ngày</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-hd">
          <div className="sec-title" style={{ marginBottom: 'var(--s-1)' }}>
            <span className="dot"><svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><circle cx="5" cy="3.2" r="2"/><path d="M1 9c0-2.2 1.8-3.8 4-3.8s4 1.6 4 3.8"/></svg></span>Học viên
          </div>
          <div className="text-sm">
            <b>{booking.fullName}</b> · {booking.empCode} · {booking.bu}
          </div>
        </div>
        <div className="card-bd">
          <div className="sec-title">
            <span className="dot accent"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><rect x="1" y="1.5" width="8" height="7.5" rx="1.2"/><line x1="3" y1="0.5" x2="3" y2="2.5"/><line x1="7" y1="0.5" x2="7" y2="2.5"/><line x1="1" y1="4" x2="9" y2="4"/></svg></span>2 ca thi
          </div>
          <div className="col" style={{ gap: 'var(--s-3)' }}>
            {ordered.map((slot, i) => (
              <SlotCard key={slot.slotId} slot={slot} index={i + 1} />
            ))}
            {!sp && booking.speakingSlotId && (
              <div className="bk-slot">
                <div className="num" style={{ background: 'var(--danger-50)', color: 'var(--danger-600)' }}>!</div>
                <div className="body">
                  <div className="type-lbl" style={{ color: 'var(--danger-600)' }}>Speaking</div>
                  <div className="when" style={{ color: 'var(--danger-600)', fontSize: 'var(--fs-sm)' }}>
                    {booking.speakingSlotId} — slot đã bị xóa, liên hệ BTC
                  </div>
                </div>
              </div>
            )}
            {!sk && booking.skillsSlotId && (
              <div className="bk-slot">
                <div className="num" style={{ background: 'var(--danger-50)', color: 'var(--danger-600)' }}>!</div>
                <div className="body">
                  <div className="type-lbl" style={{ color: 'var(--danger-600)' }}>3 Skills</div>
                  <div className="when" style={{ color: 'var(--danger-600)', fontSize: 'var(--fs-sm)' }}>
                    {booking.skillsSlotId} — slot đã bị xóa, liên hệ BTC
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="card-ft">
          {booking.createdAt && (
            <span>
              Đăng ký:{' '}
              <b style={{ color: 'var(--ink-700)' }}>
                {new Date(booking.createdAt).toLocaleString('vi-VN')}
              </b>
            </span>
          )}
          <span>
            Còn <b style={{ color: 'var(--ink-900)' }}>{changesLeft}/{maxChanges}</b> lần đổi ca
          </span>
        </div>
      </div>

      {!deadlinePassed && (
        <div className="bk-actions">
          <button
            className={`btn ${changesLeft <= 0 ? 'disabled' : ''}`}
            onClick={onEdit}
            disabled={busy || changesLeft <= 0}
            title={changesLeft <= 0 ? 'Bạn đã hết lượt đổi ca' : undefined}
          >
            ↻ Đổi ca thi
          </button>
          <div className="menu-wrap" ref={menuRef}>
            <button
              className="btn ghost"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="true"
              aria-expanded={menuOpen}
              disabled={busy}
            >
              ⋮ Tùy chọn
            </button>
            {menuOpen && (
              <div className="menu" role="menu">
                <button
                  className="menu-item danger"
                  role="menuitem"
                  onClick={handleCancel}
                  disabled={busy}
                >
                  🗑 Hủy đăng ký
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Slot Card ────────────────────────────────────────────────────────────

function SlotCard({ slot, index }: { slot: Slot; index: number }) {
  const isSp = slot.type === 'Speaking';
  const { label: dateLabel } = dayHeader(slot.date);
  return (
    <div className={`bk-slot ${isSp ? '' : 'sk'}`}>
      <div className="num">{index}</div>
      <div className="body">
        <div className="type-lbl">{isSp ? 'Speaking · 60 phút' : '3 Skills · 150 phút'}</div>
        <div className="when">
          {dateLabel} · {minToHHmm(slot.startMin)}–{minToHHmm(slot.endMin)}
        </div>
        {slot.location && <div className="where">📍 {slot.location}</div>}
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────

function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  maxWidth = 480,
}: {
  title?: string;
  subtitle?: string;
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && onClose) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth }} onClick={(e) => e.stopPropagation()}>
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

// ─── Toast Stack ──────────────────────────────────────────────────────────

function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ─── Error Boundary ───────────────────────────────────────────────────────

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App crashed:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app">
          <div className="error-screen">
            <div className="error-icon">💥</div>
            <h2>Ứng dụng gặp lỗi</h2>
            <p>{this.state.error.message || 'Lỗi không xác định.'}</p>
            <button className="btn" onClick={() => window.location.reload()}>
              Tải lại
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

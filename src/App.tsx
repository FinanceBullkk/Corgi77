import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDateVi, minToHHmm, type InitResult } from './lib/types';
import { initDb, bookDb } from './lib/db';
import { fetchAdminEmails, isAdmin } from './lib/admin';
import { AdminPanel } from './AdminPanel';
import { onAuth, signInWithGoogle, signOutUser } from './lib/firebase';
import type { User } from 'firebase/auth';
import { ConfirmProvider, useConfirm, useToast } from './confirm-toast-provider';
import { ErrorBoundary } from './components/error-boundary';
import { computeDeadline, type FlowState, type Step1Data, type Selection } from './booking/booking-utils';
import { Topbar } from './booking/booking-chrome';
import { Step1Form } from './booking/step1-form';
import { CalendarStep } from './booking/calendar-step';
import { ConfirmModal } from './booking/confirm-modal';
import { SuccessScreen } from './booking/success-screen';
import { BookingDisplay } from './booking/booking-display';

// ─── App ──────────────────────────────────────────────────────────────────

export function App() {
  return (
    <ErrorBoundary>
      <ConfirmProvider>
        <AppInner />
      </ConfirmProvider>
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

  const pushToast = useToast();
  const confirm = useConfirm();

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
    const ok = await confirm({
      title: 'Đăng xuất?',
      message: 'Đăng xuất sẽ thoát phiên đăng nhập hiện tại. Tiếp tục?',
      confirmText: 'Đăng xuất',
    });
    if (!ok) return;
    try { await signOutUser(); } catch { /* ignore */ }
  }, [confirm]);

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
      </div>
    );
  }

  return null;
}

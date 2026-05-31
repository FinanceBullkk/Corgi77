import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { InitResult } from './lib/types';
import { initDb } from './lib/db';
import { fetchAdminEmails, isAdmin } from './lib/admin';
import { onAuth, signInWithGoogle, signOutUser } from './lib/firebase';
import type { User } from 'firebase/auth';
import { ConfirmProvider, useConfirm, useToast } from './confirm-toast-provider';
import { captureError, friendlyFirestoreError } from './lib/monitoring';
import { ErrorBoundary } from './components/error-boundary';
import { BookingFlow } from './booking/booking-flow';

// Lazy-loaded so the admin bundle is code-split out of the booking critical path.
const AdminPanel = lazy(() => import('./AdminPanel').then((m) => ({ default: m.AdminPanel })));

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
        skewRef.current = new Date(d.clientNow).getTime() - Date.now();
        setData(d);
      })
      .catch((e: Error) => {
        captureError(e, { operation: 'initDb.onMount' });
        setLoadErr(friendlyFirestoreError(e) || 'Không tải được dữ liệu.');
      });
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
    return (
      <Suspense fallback={<div className="loading"><span className="spinner" /> Đang tải…</div>}>
        <AdminPanel adminEmail={data.email} onExit={() => setAdminOpen(false)} />
      </Suspense>
    );
  }

  return (
    <BookingFlow
      data={data}
      setData={setData}
      canAdmin={canAdmin}
      skew={skewRef.current}
      onOpenAdmin={openAdmin}
      onSignOut={handleSignOut}
    />
  );
}

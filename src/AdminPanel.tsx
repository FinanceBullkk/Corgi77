import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  backfillEmpCodeClaims,
  listIneligibility,
  listRegistrationsPage,
  listSlots,
  type RegistrationPageCursor,
  type IneligibilityEntry,
  type Registration,
} from './lib/adminDb';
import { type Slot } from './lib/types';
import { loadConfig, initials, NAV, HEADER, type Tab, type ConfigState } from './admin/admin-utils';
import { captureError } from './lib/monitoring';
import { NavIcon } from './admin/admin-icons';
import { Overview } from './admin/overview-tab';
import { RegistrationsTab, type ClaimSyncState } from './admin/registrations-tab';
import { SlotsTab } from './admin/slots-tab';
import { IneligibilityTab } from './admin/ineligibility-tab';
import { ConfigTab } from './admin/config-tab';
import { AuditTab } from './admin/audit-tab';

// ── Main ─────────────────────────────────────────────────────────────────────

export function AdminPanel({ adminEmail, onExit }: { adminEmail: string; onExit: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [regs, setRegs] = useState<Registration[] | null>(null);
  const [regsTotal, setRegsTotal] = useState<number | null>(null);
  const [regsCursor, setRegsCursor] = useState<RegistrationPageCursor | null>(null);
  const [regsLoadingMore, setRegsLoadingMore] = useState(false);
  const [cfg, setCfg] = useState<ConfigState | null>(null);
  const [inelig, setInelig] = useState<IneligibilityEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [claimSync, setClaimSync] = useState<ClaimSyncState>({ status: 'idle' });
  const didBackfill = useRef(false);

  // Full reload of all collections — used on mount, manual "Tải lại", and error retry.
  useEffect(() => {
    let cancelled = false;
    setErr(null);
    Promise.all([listSlots(), listRegistrationsPage(), loadConfig(), listIneligibility()])
      .then(([s, regPage, c, i]) => {
        if (cancelled) return;
        setSlots(s); setRegs(regPage.items); setRegsTotal(regPage.total); setRegsCursor(regPage.nextCursor); setCfg(c); setInelig(i);
        // EmpCode-claim backfill is a server callable (repairEmpCodeClaimsNow):
        // run it ONCE per admin session (not on every reload) to avoid redundant
        // Cloud Function invocations.
        if (didBackfill.current) return;
        didBackfill.current = true;
        if (regPage.total === 0) { setClaimSync({ status: 'idle' }); return; }
        setClaimSync({ status: 'running' });
        backfillEmpCodeClaims(adminEmail)
          .then((result) => {
            if (cancelled) return;
            const needsAttention = result.skippedDuplicates.length > 0 || result.conflicts.length > 0;
            setClaimSync({ status: needsAttention ? 'attention' : 'ok', result });
          })
          .catch((e: Error) => {
            if (!cancelled) setClaimSync({ status: 'error', error: e.message || String(e) });
          });
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message);
      });
    return () => { cancelled = true; };
  }, [adminEmail, reloadKey]);

  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  // Targeted refetchers — a mutation in one tab only re-reads the affected
  // collection(s) instead of reloading all four (cuts Firestore read cost).
  const reloadSlots = useCallback(async () => {
    try { setSlots(await listSlots()); }
    catch (e) { captureError(e, { operation: 'admin.reloadSlots' }); }
  }, []);
  const reloadRegs = useCallback(async () => {
    try {
      const page = await listRegistrationsPage();
      setRegs(page.items);
      setRegsTotal(page.total);
      setRegsCursor(page.nextCursor);
    }
    catch (e) { captureError(e, { operation: 'admin.reloadRegs' }); }
  }, []);
  const loadMoreRegs = useCallback(async () => {
    if (!regsCursor || regsLoadingMore) return;
    setRegsLoadingMore(true);
    try {
      const page = await listRegistrationsPage(regsCursor);
      setRegs((prev) => [...(prev ?? []), ...page.items]);
      setRegsTotal(page.total);
      setRegsCursor(page.nextCursor);
    } catch (e) {
      captureError(e, { operation: 'admin.loadMoreRegs' });
    } finally {
      setRegsLoadingMore(false);
    }
  }, [regsCursor, regsLoadingMore]);
  const reloadConfig = useCallback(async () => {
    try { setCfg(await loadConfig()); }
    catch (e) { captureError(e, { operation: 'admin.reloadConfig' }); }
  }, []);
  const reloadInelig = useCallback(async () => {
    try { setInelig(await listIneligibility()); }
    catch (e) { captureError(e, { operation: 'admin.reloadInelig' }); }
  }, []);
  // Cancelling a registration also restores slot.remaining → refresh both.
  const reloadRegsAndSlots = useCallback(() => {
    void reloadRegs(); void reloadSlots();
  }, [reloadRegs, reloadSlots]);

  const counts: Partial<Record<Tab, number>> = {
    registrations: regsTotal ?? regs?.length,
    slots: slots?.length,
    ineligibility: inelig?.length,
  };

  let content: ReactNode;
  if (err) {
    content = (
      <div className="error-screen">
        <h2>Lỗi tải dữ liệu admin</h2>
        <p>{err}</p>
        <button className="btn" onClick={reload}>Thử lại</button>
      </div>
    );
  } else if (!slots || !regs || !cfg || !inelig) {
    content = <div className="loading"><span className="spinner" /> Đang tải…</div>;
  } else {
    switch (tab) {
      case 'overview': content = <Overview slots={slots} regTotal={regsTotal ?? regs.length} allowEnrollment={cfg.allowEnrollment} />; break;
      case 'registrations': content = <RegistrationsTab adminEmail={adminEmail} slots={slots} regs={regs} regsTotal={regsTotal ?? regs.length} hasMoreRegs={Boolean(regsCursor)} regsLoadingMore={regsLoadingMore} onLoadMore={loadMoreRegs} onReload={reloadRegsAndSlots} claimSync={claimSync} />; break;
      case 'slots': content = <SlotsTab adminEmail={adminEmail} slots={slots} allowEnrollment={cfg.allowEnrollment} onReload={reloadSlots} />; break;
      case 'ineligibility': content = <IneligibilityTab adminEmail={adminEmail} inelig={inelig} onReload={reloadInelig} />; break;
      case 'config': content = <ConfigTab adminEmail={adminEmail} cfg={cfg} onReload={reloadConfig} />; break;
      case 'audit': content = <AuditTab slots={slots} />; break;
    }
  }

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="side-brand">
          <span className="mark">C7</span>
          <span className="wm"><span className="t">Corgi7 Admin</span><span className="s">Assessment Q2 2026</span></span>
        </div>
        <div className="side-section">Quản trị</div>
        <nav className="side-nav">
          {NAV.map((n) => (
            <button key={n.id} type="button" className={`nav-item ${tab === n.id ? 'active' : ''}`} onClick={() => setTab(n.id)}>
              <NavIcon tab={n.id} />
              <span className="ni-label">{n.label}</span>
              {counts[n.id] != null && <span className="ni-count">{counts[n.id]}</span>}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <button type="button" className="side-back" onClick={onExit}><span>← Về trang User</span></button>
          <div className="side-user">
            <span className="av">{initials(adminEmail)}</span>
            <span className="uu"><span className="n">{adminEmail.split('@')[0]}</span><span className="r">Admin</span></span>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="main-hd">
          <div className="titles"><h1>{HEADER[tab].t}</h1><div className="sub">{HEADER[tab].s}</div></div>
          <div className="acts">
            <button type="button" className="btn ghost sm" onClick={reload}>↻ Tải lại</button>
          </div>
        </header>
        <div className="content">{content}</div>
      </div>
    </div>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { listIneligibility, listRegistrations, listSlots, type IneligibilityEntry, type Registration } from './lib/adminDb';
import { type Slot } from './lib/types';
import { loadConfig, initials, NAV, HEADER, type Tab, type ConfigState } from './admin/admin-utils';
import { NavIcon } from './admin/admin-icons';
import { Overview } from './admin/overview-tab';
import { RegistrationsTab } from './admin/registrations-tab';
import { SlotsTab } from './admin/slots-tab';
import { IneligibilityTab } from './admin/ineligibility-tab';
import { ConfigTab } from './admin/config-tab';
import { AuditTab } from './admin/audit-tab';

// ── Main ─────────────────────────────────────────────────────────────────────

export function AdminPanel({ adminEmail, onExit }: { adminEmail: string; onExit: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [regs, setRegs] = useState<Registration[] | null>(null);
  const [cfg, setCfg] = useState<ConfigState | null>(null);
  const [inelig, setInelig] = useState<IneligibilityEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setErr(null);
    Promise.all([listSlots(), listRegistrations(), loadConfig(), listIneligibility()])
      .then(([s, r, c, i]) => { setSlots(s); setRegs(r); setCfg(c); setInelig(i); })
      .catch((e: Error) => setErr(e.message));
  }, [reloadKey]);

  const reload = () => setReloadKey((n) => n + 1);

  const counts: Partial<Record<Tab, number>> = {
    registrations: regs?.length,
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
      case 'overview': content = <Overview slots={slots} regs={regs} allowEnrollment={cfg.allowEnrollment} />; break;
      case 'registrations': content = <RegistrationsTab adminEmail={adminEmail} slots={slots} regs={regs} onReload={reload} />; break;
      case 'slots': content = <SlotsTab adminEmail={adminEmail} slots={slots} regs={regs} allowEnrollment={cfg.allowEnrollment} onReload={reload} />; break;
      case 'ineligibility': content = <IneligibilityTab adminEmail={adminEmail} inelig={inelig} onReload={reload} />; break;
      case 'config': content = <ConfigTab adminEmail={adminEmail} cfg={cfg} onReload={reload} />; break;
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

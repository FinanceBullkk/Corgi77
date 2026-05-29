import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from './lib/firebase';
import {
  adminCreateSlot,
  adminDeleteRegistration,
  adminDeleteSlot,
  deleteIneligibility,
  downloadRegistrationsCsv,
  generateSlotId,
  INELIGIBILITY_REASON_PRESETS,
  listIneligibility,
  listRegistrations,
  listRegistrationsForSlot,
  listSlots,
  updateConfig,
  updateSlot,
  upsertIneligibility,
  type IneligibilityEntry,
  type Registration,
} from './lib/adminDb';
import { listAuditLogs, type AuditEntry } from './lib/audit';
import { formatDateVi, minToHHmm, type Slot, type SlotType } from './lib/types';

type Tab = 'overview' | 'registrations' | 'slots' | 'ineligibility' | 'config' | 'audit';

const NAV: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'registrations', label: 'Đăng ký' },
  { id: 'slots', label: 'Ca thi' },
  { id: 'ineligibility', label: 'Danh sách chặn' },
  { id: 'config', label: 'Cấu hình' },
  { id: 'audit', label: 'Audit' },
];

const HEADER: Record<Tab, { t: string; s: string }> = {
  overview: { t: 'Tổng quan', s: 'Tình hình đăng ký · Assessment Q2 2026' },
  registrations: { t: 'Đăng ký', s: 'Danh sách nhân viên đã đăng ký ca thi' },
  slots: { t: 'Ca thi', s: 'Quản lý ca · phòng · sức chứa' },
  ineligibility: { t: 'Danh sách chặn', s: 'Nhân viên không đủ điều kiện đăng ký' },
  config: { t: 'Cấu hình', s: 'Đăng ký · thông báo · phân quyền' },
  audit: { t: 'Audit log', s: 'Lịch sử thao tác · immutable' },
};

interface ConfigState {
  allowEnrollment: boolean;
  maxChanges: number;
  deadline: Date | null;
  emailConfirm: boolean;
  adminEmails: string[];
}

async function loadConfig(): Promise<ConfigState> {
  const snap = await getDoc(doc(db, 'config', 'main'));
  const d = snap.exists() ? snap.data() : {};
  return {
    allowEnrollment: d.allowEnrollment !== false,
    maxChanges: typeof d.maxChanges === 'number' ? d.maxChanges : 3,
    deadline: d.deadline ? (d.deadline as Timestamp).toDate() : null,
    emailConfirm: d.emailConfirm === true,
    adminEmails: Array.isArray(d.adminEmails) ? d.adminEmails : [],
  };
}

// ── Shared helpers ──────────────────────────────────────────────────────────

const VI_DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
function dowVi(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  return isNaN(d.getTime()) ? '' : VI_DOW[d.getDay()];
}

function typClass(type: SlotType): 'sp' | 'sk' {
  return type === 'Speaking' ? 'sp' : 'sk';
}

type SlotStatus = 'ok' | 'warn' | 'full' | 'closed';
function slotStatus(s: Slot, allowEnrollment: boolean): SlotStatus {
  if (!allowEnrollment) return 'closed';
  if (s.remaining <= 0) return 'full';
  if (s.capacity > 0 && s.remaining / s.capacity <= 0.25) return 'warn';
  return 'ok';
}
const STATUS_LABEL: Record<SlotStatus, string> = { ok: 'Còn chỗ', warn: 'Sắp đầy', full: 'Đã đầy', closed: 'Đã đóng' };

function slotLabel(slotMap: Map<string, Slot>, id: string | null): string {
  if (!id) return '—';
  const s = slotMap.get(id);
  if (s) return `${formatDateVi(s.date)} · ${minToHHmm(s.startMin)}–${minToHHmm(s.endMin)}`;
  const m = /^(?:SP|3S)-(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(id);
  if (m) return `${m[1]}/${m[2]} · ${m[3]}:${m[4]}`;
  return id;
}

function addMin(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function initials(email: string): string {
  const name = email.split('@')[0] ?? '';
  const parts = name.split(/[._-]/).filter(Boolean);
  const s = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return (s || name.slice(0, 2)).toUpperCase();
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function NavIcon({ tab }: { tab: Tab }) {
  const c = 'currentColor';
  switch (tab) {
    case 'overview':
      return <svg className="ni-ic" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5" /><rect x="11" y="3" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5" /><rect x="3" y="11" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5" /><rect x="11" y="11" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5" /></svg>;
    case 'registrations':
      return <svg className="ni-ic" viewBox="0 0 20 20" fill="none"><path d="M3 5.5h14M3 10h14M3 14.5h9" stroke={c} strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case 'slots':
      return <svg className="ni-ic" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="13" rx="2" stroke={c} strokeWidth="1.5" /><path d="M3 8h14M7 2.5v3M13 2.5v3" stroke={c} strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case 'ineligibility':
      return <svg className="ni-ic" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke={c} strokeWidth="1.5" /><path d="m5.5 5.5 9 9" stroke={c} strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case 'config':
      return <svg className="ni-ic" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="2.5" stroke={c} strokeWidth="1.5" /><path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7" stroke={c} strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case 'audit':
      return <svg className="ni-ic" viewBox="0 0 20 20" fill="none"><path d="M10 5v5l3 2" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><circle cx="10" cy="10" r="7" stroke={c} strokeWidth="1.5" /></svg>;
  }
}

function SearchIcon() {
  return <svg viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" /><path d="m11 11 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
}
function DotsIcon() {
  return <svg viewBox="0 0 18 18" fill="currentColor" width="18" height="18"><circle cx="9" cy="4" r="1.5" /><circle cx="9" cy="9" r="1.5" /><circle cx="9" cy="14" r="1.5" /></svg>;
}

// ── Row menu ────────────────────────────────────────────────────────────────

type MenuItem = { label: string; onClick: () => void; danger?: boolean } | 'div';

function RowMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div className="rowmenu-wrap" ref={ref}>
      <button type="button" className="icon-act" aria-label="Tác vụ" onClick={() => setOpen((o) => !o)}>
        <DotsIcon />
      </button>
      {open && (
        <div className="rowmenu">
          {items.map((it, i) =>
            it === 'div' ? (
              <div key={i} className="div" />
            ) : (
              <button key={i} type="button" className={it.danger ? 'danger' : ''} onClick={() => { setOpen(false); it.onClick(); }}>
                {it.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ── Generic drawer chrome ─────────────────────────────────────────────────────

function Drawer({
  title, sub, cta, busy, onClose, onSave, children,
}: {
  title: string; sub?: string; cta: string; busy?: boolean; onClose: () => void; onSave: () => void; children: ReactNode;
}) {
  return (
    <div className="drawer-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer">
        <div className="drawer-hd">
          <div>
            <div className="dt">{title}</div>
            {sub && <div className="ds">{sub}</div>}
          </div>
          <button type="button" className="drawer-x" aria-label="Đóng" onClick={onClose}>×</button>
        </div>
        <div className="drawer-bd">{children}</div>
        <div className="drawer-ft">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Đóng</button>
          <button type="button" className="btn" onClick={onSave} disabled={busy}>{busy ? 'Đang lưu…' : cta}</button>
        </div>
      </div>
    </div>
  );
}

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

// ── Overview ──────────────────────────────────────────────────────────────────

function Overview({ slots, regs, allowEnrollment }: { slots: Slot[]; regs: Registration[]; allowEnrollment: boolean }) {
  const sp = slots.filter((s) => s.type === 'Speaking');
  const sk = slots.filter((s) => s.type === '3 Skills');
  const sum = (arr: Slot[], k: 'capacity' | 'remaining') => arr.reduce((a, s) => a + s[k], 0);
  const spCap = sum(sp, 'capacity'), skCap = sum(sk, 'capacity');
  const spBooked = spCap - sum(sp, 'remaining'), skBooked = skCap - sum(sk, 'remaining');
  const spPct = spCap ? Math.round((spBooked / spCap) * 100) : 0;
  const skPct = skCap ? Math.round((skBooked / skCap) * 100) : 0;
  const freeSp = spCap - spBooked, freeSk = skCap - skBooked;

  const days = [...new Set(slots.map((s) => s.date))].sort();
  const byDay = days.map((d) => {
    const ds = slots.filter((s) => s.date === d);
    const cap = sum(ds, 'capacity');
    const booked = cap - sum(ds, 'remaining');
    return { d, dow: dowVi(d), cap, booked, pct: cap ? Math.round((booked / cap) * 100) : 0 };
  });

  return (
    <>
      <div className="statbar">
        <div className="stat"><div className="k">Tổng đăng ký</div><div className="v">{regs.length}</div><div className="ctx">trên {spCap + skCap} suất khả dụng</div></div>
        <div className="stat"><div className="k">Lấp đầy Speaking</div><div className="v">{spPct}<small>%</small></div><div className="ctx"><span className="mini-bar"><span className="mini-fill" style={{ width: `${spPct}%` }} /></span>{spBooked}/{spCap}</div></div>
        <div className="stat accent"><div className="k">Lấp đầy 3 Skills</div><div className="v">{skPct}<small>%</small></div><div className="ctx"><span className="mini-bar"><span className="mini-fill" style={{ width: `${skPct}%` }} /></span>{skBooked}/{skCap}</div></div>
        <div className="stat"><div className="k">Suất còn trống</div><div className="v">{freeSp + freeSk}</div><div className="ctx">{freeSp} Speaking · {freeSk} 3 Skills</div></div>
      </div>
      <div className="panel">
        <div className="panel-hd"><span className="pt">Lấp đầy theo ngày</span><span className="text-sm text-muted">{days.length} ngày thi</span></div>
        <div style={{ padding: 'var(--s-2) var(--s-5) var(--s-4)' }}>
          {byDay.length === 0 && <div className="empty-state"><div className="es-title">Chưa có ca thi nào</div></div>}
          {byDay.map((b) => (
            <div key={b.d} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)', padding: 'var(--s-3) 0', borderBottom: '1px solid var(--ink-100)' }}>
              <div style={{ width: 110, flexShrink: 0 }}><span className="strong">{b.dow}</span> <span className="text-sm text-muted">{formatDateVi(b.d)}</span></div>
              <div className="cap-track" style={{ maxWidth: 'none', flex: 1, height: 9 }}><span className={`cap-fill${b.pct >= 100 ? ' full' : b.pct >= 75 ? ' warn' : ''}`} style={{ width: `${b.pct}%` }} /></div>
              <div className="cap-num" style={{ width: 110, textAlign: 'right' }}><b>{b.booked}</b>/{b.cap} <span className="text-muted">({b.pct}%)</span></div>
            </div>
          ))}
        </div>
      </div>
      {!allowEnrollment && (
        <div className="banner warn" style={{ marginTop: 'var(--s-5)' }}><div>Đăng ký đang <b>tắt</b> — tất cả ca hiển thị trạng thái "Đã đóng" với user.</div></div>
      )}
    </>
  );
}

// ── Registrations (Đăng ký) ───────────────────────────────────────────────────

function RegistrationsTab({
  adminEmail, slots, regs, onReload,
}: { adminEmail: string; slots: Slot[]; regs: Registration[]; onReload: () => void }) {
  const [q, setQ] = useState('');
  const [bu, setBu] = useState('all');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const slotMap = useMemo(() => new Map(slots.map((s) => [s.slotId, s])), [slots]);
  const bus = useMemo(() => ['all', ...Array.from(new Set(regs.map((r) => r.bu).filter(Boolean)))], [regs]);

  const fmtSlot = (id: string | null) => {
    if (!id) return <span className="empty-dash">—</span>;
    if (!slotMap.has(id)) return <span style={{ color: 'var(--danger)' }}>{slotLabel(slotMap, id)} (đã xoá)</span>;
    return <span className="tnum">{slotLabel(slotMap, id)}</span>;
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return regs.filter((r) => {
      if (bu !== 'all' && r.bu !== bu) return false;
      if (!needle) return true;
      return (
        r.email.toLowerCase().includes(needle) ||
        r.empCode.toLowerCase().includes(needle) ||
        r.fullName.toLowerCase().includes(needle) ||
        r.bu.toLowerCase().includes(needle)
      );
    });
  }, [regs, q, bu]);

  const allSel = filtered.length > 0 && filtered.every((r) => sel.has(r.email));
  const toggleAll = () => {
    setSel((prev) => {
      const next = new Set(prev);
      if (allSel) filtered.forEach((r) => next.delete(r.email));
      else filtered.forEach((r) => next.add(r.email));
      return next;
    });
  };
  const toggleRow = (email: string) => {
    setSel((prev) => { const next = new Set(prev); next.has(email) ? next.delete(email) : next.add(email); return next; });
  };

  const deleteOne = async (email: string) => {
    if (!confirm(`Huỷ đăng ký của "${email}"?\n(Các ca đã đặt sẽ được trả về.)`)) return;
    setBusy(true);
    try { await adminDeleteRegistration(adminEmail, email); onReload(); }
    catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  };

  const bulkCancel = async () => {
    const emails = Array.from(sel);
    if (!confirm(`Huỷ ${emails.length} đăng ký đã chọn?\n(Các ca đã đặt sẽ được trả về.)`)) return;
    setBusy(true);
    try {
      await Promise.all(emails.map((e) => adminDeleteRegistration(adminEmail, e)));
      setSel(new Set());
      onReload();
    } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  };

  const bulkExport = () => {
    const chosen = regs.filter((r) => sel.has(r.email));
    downloadRegistrationsCsv(chosen, slots);
  };

  return (
    <div className="panel">
      {sel.size > 0 ? (
        <div className="bulkbar">
          <span className="bcount">{sel.size} đã chọn</span>
          <button type="button" className="blink" onClick={() => setSel(new Set())}>Bỏ chọn</button>
          <div className="spacer" />
          <button type="button" className="bbtn" onClick={bulkExport}>Xuất CSV</button>
          <button type="button" className="bbtn danger" disabled={busy} onClick={bulkCancel}>Huỷ đăng ký</button>
        </div>
      ) : (
        <div className="toolbar">
          <div className="search"><SearchIcon /><input type="text" placeholder="Tìm tên, mã NV, email…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="select" value={bu} onChange={(e) => setBu(e.target.value)}>
            {bus.map((b) => <option key={b} value={b}>{b === 'all' ? 'Tất cả BU' : b}</option>)}
          </select>
          <div className="spacer" />
          <span className="text-sm text-muted">{filtered.length} đăng ký</span>
          <button type="button" className="btn sm" onClick={() => downloadRegistrationsCsv(regs, slots)}>⬇ Xuất CSV ({regs.length})</button>
        </div>
      )}
      <table className="dgrid">
        <thead>
          <tr>
            <th className="cbx-cell"><input type="checkbox" className="cbx" checked={allSel} onChange={toggleAll} aria-label="Chọn tất cả" /></th>
            <th>Nhân viên</th><th>BU</th><th>Speaking</th><th>3 Skills</th><th className="center">Đổi</th><th>Đăng ký lúc</th><th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.email} className={sel.has(r.email) ? 'selected' : ''}>
              <td className="cbx-cell"><input type="checkbox" className="cbx" checked={sel.has(r.email)} onChange={() => toggleRow(r.email)} aria-label={`Chọn ${r.email}`} /></td>
              <td><div className="id-cell"><span className="nm">{r.fullName || '—'}</span><span className="mt">{r.empCode} · {r.email}</span></div></td>
              <td>{r.bu ? <span className="pill">{r.bu}</span> : <span className="empty-dash">—</span>}</td>
              <td>{fmtSlot(r.speakingSlotId)}</td>
              <td>{fmtSlot(r.skillsSlotId)}</td>
              <td className="center"><span className="tnum">{r.changeCount}</span></td>
              <td className="text-muted tnum">{r.createdAt ? new Date(r.createdAt).toLocaleString('vi-VN') : '—'}</td>
              <td className="num"><div className="row-acts"><RowMenu items={[{ label: 'Huỷ đăng ký', danger: true, onClick: () => deleteOne(r.email) }]} /></div></td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <div className="empty-state"><div className="es-title">Chưa có đăng ký nào khớp bộ lọc</div></div>}
    </div>
  );
}

// ── Slots (Ca thi) ─────────────────────────────────────────────────────────────

function SlotsTab({
  adminEmail, slots, regs, allowEnrollment, onReload,
}: { adminEmail: string; slots: Slot[]; regs: Registration[]; allowEnrollment: boolean; onReload: () => void }) {
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'Speaking' | '3 Skills'>('all');
  const [dayFilter, setDayFilter] = useState('all');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState<{ slot: Slot | null } | null>(null);
  const [regsDrawer, setRegsDrawer] = useState<Slot | null>(null);

  const days = useMemo(() => ['all', ...Array.from(new Set(slots.map((s) => s.date))).sort()], [slots]);

  const usage = useMemo(() => {
    const map = new Map<string, number>();
    regs.forEach((r) => {
      if (r.speakingSlotId) map.set(r.speakingSlotId, (map.get(r.speakingSlotId) ?? 0) + 1);
      if (r.skillsSlotId) map.set(r.skillsSlotId, (map.get(r.skillsSlotId) ?? 0) + 1);
    });
    return map;
  }, [regs]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return slots.filter((s) => {
      if (typeFilter !== 'all' && s.type !== typeFilter) return false;
      if (dayFilter !== 'all' && s.date !== dayFilter) return false;
      if (!needle) return true;
      return (`${s.location} ${minToHHmm(s.startMin)} ${minToHHmm(s.endMin)} ${s.slotId} ${s.type}`).toLowerCase().includes(needle);
    });
  }, [slots, q, typeFilter, dayFilter]);

  const allSel = filtered.length > 0 && filtered.every((s) => sel.has(s.slotId));
  const toggleAll = () => {
    setSel((prev) => {
      const next = new Set(prev);
      if (allSel) filtered.forEach((s) => next.delete(s.slotId));
      else filtered.forEach((s) => next.add(s.slotId));
      return next;
    });
  };
  const toggleRow = (id: string) => setSel((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const deleteOne = async (s: Slot) => {
    const used = usage.get(s.slotId) ?? 0;
    const msg = used > 0
      ? `Ca này có ${used} người đã đăng ký. Xoá sẽ khiến các đăng ký đó bị mồ côi (orphan).\nVẫn xoá?`
      : `Xoá ca "${s.slotId}" (${formatDateVi(s.date)} ${minToHHmm(s.startMin)}–${minToHHmm(s.endMin)})?`;
    if (!confirm(msg)) return;
    setBusy(true);
    try { await adminDeleteSlot(adminEmail, s.slotId); onReload(); }
    catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  };

  const bulkDelete = async () => {
    const ids = Array.from(sel);
    const withUsers = ids.filter((id) => (usage.get(id) ?? 0) > 0).length;
    const warn = withUsers > 0 ? `\n${withUsers} ca đang có người đăng ký — sẽ thành orphan.` : '';
    if (!confirm(`Xoá ${ids.length} ca đã chọn?${warn}`)) return;
    setBusy(true);
    try {
      await Promise.all(ids.map((id) => adminDeleteSlot(adminEmail, id)));
      setSel(new Set());
      onReload();
    } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="panel">
      {sel.size > 0 ? (
        <div className="bulkbar">
          <span className="bcount">{sel.size} đã chọn</span>
          <button type="button" className="blink" onClick={() => setSel(new Set())}>Bỏ chọn</button>
          <div className="spacer" />
          <button type="button" className="bbtn danger" disabled={busy} onClick={bulkDelete}>Xoá</button>
        </div>
      ) : (
        <div className="toolbar">
          <div className="filter-chips">
            {([['all', 'Tất cả'], ['Speaking', 'Speaking'], ['3 Skills', '3 Skills']] as const).map(([v, l]) => (
              <button key={v} type="button" className={typeFilter === v ? 'active' : ''} onClick={() => setTypeFilter(v)}>{l}</button>
            ))}
          </div>
          <select className="select" value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}>
            {days.map((d) => <option key={d} value={d}>{d === 'all' ? 'Tất cả ngày' : formatDateVi(d)}</option>)}
          </select>
          <div className="search"><SearchIcon /><input type="text" placeholder="Tìm phòng, giờ, mã ca…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="spacer" />
          <span className="text-sm text-muted">{filtered.length} ca</span>
          <button type="button" className="btn sm" onClick={() => setDrawer({ slot: null })}>+ Thêm ca</button>
        </div>
      )}
      <table className="dgrid">
        <thead>
          <tr>
            <th className="cbx-cell"><input type="checkbox" className="cbx" checked={allSel} onChange={toggleAll} aria-label="Chọn tất cả" /></th>
            <th>Loại</th><th>Ngày / Giờ</th><th>Phòng</th><th>Sức chứa</th><th>Trạng thái</th><th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((s) => {
            const used = usage.get(s.slotId) ?? 0;
            const pct = s.capacity ? Math.round((used / s.capacity) * 100) : 0;
            const st = slotStatus(s, allowEnrollment);
            const fillCls = st === 'full' ? 'full' : st === 'warn' ? 'warn' : typClass(s.type) === 'sk' ? 'sk' : '';
            return (
              <tr key={s.slotId} className={sel.has(s.slotId) ? 'selected' : ''}>
                <td className="cbx-cell"><input type="checkbox" className="cbx" checked={sel.has(s.slotId)} onChange={() => toggleRow(s.slotId)} aria-label={`Chọn ${s.slotId}`} /></td>
                <td><span className={`typ ${typClass(s.type)}`}>{s.type}</span></td>
                <td><span className="strong">{formatDateVi(s.date)}</span> <span className="text-muted">{dowVi(s.date)}</span> · <span className="tnum">{minToHHmm(s.startMin)}–{minToHHmm(s.endMin)}</span></td>
                <td>{s.location ? s.location : <span className="empty-dash">—</span>}</td>
                <td><div className="cap"><span className="cap-track"><span className={`cap-fill ${fillCls}`} style={{ width: `${pct}%` }} /></span><span className="cap-num"><b>{used}</b>/{s.capacity}</span></div></td>
                <td><span className={`stat-pill ${st}`}>{STATUS_LABEL[st]}</span></td>
                <td className="num"><div className="row-acts"><RowMenu items={[
                  { label: 'Sửa ca', onClick: () => setDrawer({ slot: s }) },
                  { label: 'Xem người đăng ký', onClick: () => setRegsDrawer(s) },
                  'div',
                  { label: 'Xoá ca', danger: true, onClick: () => deleteOne(s) },
                ]} /></div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {filtered.length === 0 && <div className="empty-state"><div className="es-title">Không có ca thi nào khớp bộ lọc</div></div>}

      {drawer && (
        <SlotDrawer
          adminEmail={adminEmail}
          slot={drawer.slot}
          used={drawer.slot ? usage.get(drawer.slot.slotId) ?? 0 : 0}
          onClose={() => setDrawer(null)}
          onSaved={() => { setDrawer(null); onReload(); }}
        />
      )}
      {regsDrawer && <SlotRegsDrawer slot={regsDrawer} onClose={() => setRegsDrawer(null)} />}
    </div>
  );
}

function SlotDrawer({
  adminEmail, slot, used, onClose, onSaved,
}: { adminEmail: string; slot: Slot | null; used: number; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!slot;
  // type/date/time encode the slotId, so they can only change when the slot
  // has no registrations (we recreate under a new id + delete the old one).
  const locked = isEdit && used > 0;
  const [type, setType] = useState<SlotType>(slot?.type ?? 'Speaking');
  const [date, setDate] = useState(slot?.date ?? '');
  const [session, setSession] = useState(slot?.session ?? '');
  const [start, setStart] = useState(slot ? minToHHmm(slot.startMin) : '09:00');
  const [end, setEnd] = useState(slot ? minToHHmm(slot.endMin) : '10:00');
  const [capacity, setCapacity] = useState(String(slot?.capacity ?? 8));
  const [location, setLocation] = useState(slot?.location ?? '');
  const [busy, setBusy] = useState(false);

  const onType = (t: SlotType) => {
    setType(t);
    setEnd(addMin(start, t === 'Speaking' ? 60 : 150));
    setCapacity(t === 'Speaking' ? '8' : '14');
  };
  const onStart = (v: string) => { setStart(v); setEnd(addMin(v, type === 'Speaking' ? 60 : 150)); };

  const newId = date && start ? generateSlotId(type, date, parseTime(start)) : '';
  const rekeying = isEdit && !locked && !!newId && newId !== slot!.slotId;

  const save = async () => {
    const cap = parseInt(capacity, 10);
    if (!cap || cap <= 0) { alert('Sức chứa phải > 0'); return; }
    const startMin = parseTime(start), endMin = parseTime(end);
    setBusy(true);
    try {
      if (locked) {
        // Has registrations → only capacity/room can change.
        if (cap < used) { alert(`Không thể giảm xuống ${cap} vì đã có ${used} người đăng ký.`); setBusy(false); return; }
        await updateSlot(adminEmail, slot!.slotId, { capacity: cap, remaining: cap - used, location: location.trim() });
      } else {
        if (!date) { alert('Chọn ngày'); setBusy(false); return; }
        if (startMin >= endMin) { alert('Giờ bắt đầu phải trước giờ kết thúc'); setBusy(false); return; }
        if (isEdit && !rekeying) {
          // Same type/date/time → in-place update of capacity/room.
          await updateSlot(adminEmail, slot!.slotId, { capacity: cap, remaining: cap, location: location.trim() });
        } else {
          // New slot, or a 0-registration slot whose type/date/time changed:
          // create under the new id (ignoring self-overlap) then drop the old one.
          await adminCreateSlot(
            adminEmail,
            { type, date, session: session.trim(), startMin, endMin, capacity: cap, location: location.trim() },
            isEdit ? slot!.slotId : undefined,
          );
          if (isEdit) await adminDeleteSlot(adminEmail, slot!.slotId);
        }
      }
      onSaved();
    } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Drawer
      title={isEdit ? 'Sửa ca thi' : 'Thêm ca thi'}
      sub={isEdit ? (locked ? 'Đổi sức chứa · phòng' : 'Đổi mọi trường (chưa có đăng ký)') : 'Tạo ca mới cho kỳ thi'}
      cta={isEdit ? 'Lưu thay đổi' : 'Tạo ca'}
      busy={busy}
      onClose={onClose}
      onSave={save}
    >
      <div className="field">
        <label className="label">Loại ca</label>
        {locked ? (
          <div><span className={`typ ${typClass(type)}`}>{type}</span></div>
        ) : (
          <div className="filter-chips" style={{ display: 'inline-flex' }}>
            <button type="button" className={type === 'Speaking' ? 'active' : ''} onClick={() => onType('Speaking')}>Speaking · 60′</button>
            <button type="button" className={type === '3 Skills' ? 'active' : ''} onClick={() => onType('3 Skills')}>3 Skills · 150′</button>
          </div>
        )}
      </div>
      <div className="field">
        <label className="label">Ngày thi</label>
        {locked ? (
          <div className="help">{dowVi(date)} · {formatDateVi(date)} <span className="text-muted">(không đổi được)</span></div>
        ) : (
          <>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            {date && <div className="help">{dowVi(date)} · {formatDateVi(date)}</div>}
          </>
        )}
      </div>
      <div className="row" style={{ gap: 'var(--s-3)' }}>
        <div className="field" style={{ flex: 1 }}>
          <label className="label">Giờ bắt đầu</label>
          {locked ? <div className="help tnum">{start}</div> : <input className="input" type="time" value={start} onChange={(e) => onStart(e.target.value)} />}
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label className="label">Giờ kết thúc</label>
          {locked ? <div className="help tnum">{end}</div> : <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />}
        </div>
      </div>
      <div className="row" style={{ gap: 'var(--s-3)' }}>
        <div className="field" style={{ flex: 2 }}>
          <label className="label">Phòng</label>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="VD: Phòng A12" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label className="label">Sức chứa</label>
          <input className="input" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </div>
      </div>
      {!locked && !session && (
        <div className="field">
          <label className="label">Session <span className="opt">(tuỳ chọn)</span></label>
          <input className="input" value={session} onChange={(e) => setSession(e.target.value)} placeholder="AM / PM" />
        </div>
      )}
      {!isEdit && newId && <div className="banner info"><div>Mã ca sẽ là <b>{newId}</b></div></div>}
      {locked && <div className="banner info"><div>Mã ca <b>{slot!.slotId}</b> · đang có <b>{used}</b> đăng ký. Vì đã có người đăng ký, không thể đổi loại/ngày/giờ.</div></div>}
      {isEdit && !locked && (
        <div className="banner info"><div>
          {rekeying
            ? <>Đổi loại/ngày/giờ sẽ tạo mã ca mới <b>{newId}</b> và xoá <b>{slot!.slotId}</b>.</>
            : <>Mã ca <b>{slot!.slotId}</b> · chưa có đăng ký, có thể đổi mọi trường.</>}
        </div></div>
      )}
    </Drawer>
  );
}

function SlotRegsDrawer({ slot, onClose }: { slot: Slot; onClose: () => void }) {
  const [list, setList] = useState<Registration[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    listRegistrationsForSlot(slot.slotId).then(setList).catch((e: Error) => setErr(e.message));
  }, [slot.slotId]);
  return (
    <div className="drawer-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer">
        <div className="drawer-hd">
          <div>
            <div className="dt">Người đăng ký ca</div>
            <div className="ds">{slot.type} · {formatDateVi(slot.date)} · {minToHHmm(slot.startMin)}–{minToHHmm(slot.endMin)}</div>
          </div>
          <button type="button" className="drawer-x" aria-label="Đóng" onClick={onClose}>×</button>
        </div>
        <div className="drawer-bd">
          {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
          {!list && !err && <div className="loading"><span className="spinner" /> Đang tải…</div>}
          {list && list.length === 0 && <div className="empty-state"><div className="es-title">Chưa có ai đặt ca này</div></div>}
          {list && list.length > 0 && (
            <table className="dgrid">
              <thead><tr><th>Nhân viên</th><th>BU</th></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.email}>
                    <td><div className="id-cell"><span className="nm">{r.fullName || '—'}</span><span className="mt">{r.empCode} · {r.email}</span></div></td>
                    <td>{r.bu ? <span className="pill">{r.bu}</span> : <span className="empty-dash">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="drawer-ft"><button type="button" className="btn ghost" onClick={onClose}>Đóng</button></div>
      </div>
    </div>
  );
}

// ── Ineligibility (Danh sách chặn) ────────────────────────────────────────────

function splitReason(reason: string): { vn: string; en: string } {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(reason.trim());
  if (m && m[2]) return { vn: m[1].trim(), en: m[2].trim() };
  return { vn: reason, en: '' };
}

function IneligibilityTab({
  adminEmail, inelig, onReload,
}: { adminEmail: string; inelig: IneligibilityEntry[]; onReload: () => void }) {
  const [q, setQ] = useState('');
  const [drawer, setDrawer] = useState<{ editing: IneligibilityEntry | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return inelig;
    return inelig.filter((e) =>
      e.empCode.toLowerCase().includes(needle) ||
      e.reason.toLowerCase().includes(needle) ||
      (e.email ?? '').toLowerCase().includes(needle) ||
      (e.fullName ?? '').toLowerCase().includes(needle)
    );
  }, [inelig, q]);

  const unblock = async (empCode: string) => {
    if (!confirm(`Gỡ mã NV "${empCode}" khỏi danh sách chặn?\n(Người này sẽ được phép đăng ký lại.)`)) return;
    setBusy(empCode);
    try { await deleteIneligibility(adminEmail, empCode); onReload(); }
    catch (e) { alert((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <>
      <div className="banner info" style={{ marginBottom: 'var(--s-5)' }}>
        <div>Nhân viên trong danh sách này <b>không đăng ký được</b> kỳ thi. Khi họ nhập mã NV ở Bước 1, hệ thống chặn và hiển thị lý do. Danh sách rỗng = không ai bị chặn.</div>
      </div>
      <div className="panel">
        <div className="toolbar">
          <div className="search"><SearchIcon /><input type="text" placeholder="Tìm mã NV, lý do, email…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="spacer" />
          <span className="text-sm text-muted">{filtered.length} mã bị chặn</span>
          <button type="button" className="btn sm" onClick={() => setDrawer({ editing: null })}>+ Thêm empCode</button>
        </div>
        <table className="dgrid">
          <thead><tr><th>Mã NV</th><th>Lý do</th><th>Email</th><th>Họ tên</th><th></th></tr></thead>
          <tbody>
            {filtered.map((e) => {
              const r = splitReason(e.reason);
              return (
                <tr key={e.empCode}>
                  <td><span className="strong tnum" style={{ fontSize: 'var(--fs-md)' }}>{e.empCode}</span></td>
                  <td><div className="reason"><div className="vn">{r.vn}</div>{r.en && <div className="en">{r.en}</div>}</div></td>
                  <td>{e.email ?? <span className="empty-dash">—</span>}</td>
                  <td>{e.fullName ?? <span className="empty-dash">—</span>}</td>
                  <td className="num"><div className="row-acts"><RowMenu items={[
                    { label: 'Sửa lý do', onClick: () => setDrawer({ editing: e }) },
                    'div',
                    { label: busy === e.empCode ? 'Đang gỡ…' : 'Gỡ chặn', danger: true, onClick: () => unblock(e.empCode) },
                  ]} /></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty-state"><div className="es-title">Không có mã NV nào bị chặn</div></div>}
      </div>

      {drawer && (
        <BlockDrawer
          adminEmail={adminEmail}
          editing={drawer.editing}
          onClose={() => setDrawer(null)}
          onSaved={() => { setDrawer(null); onReload(); }}
        />
      )}
    </>
  );
}

function BlockDrawer({
  adminEmail, editing, onClose, onSaved,
}: { adminEmail: string; editing: IneligibilityEntry | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!editing;
  const [empCode, setEmpCode] = useState(editing?.empCode ?? '');
  const [reasonPreset, setReasonPreset] = useState<string>(() => {
    if (!editing) return INELIGIBILITY_REASON_PRESETS[0];
    return INELIGIBILITY_REASON_PRESETS.includes(editing.reason) ? editing.reason : '__custom__';
  });
  const [reasonCustom, setReasonCustom] = useState(editing && !INELIGIBILITY_REASON_PRESETS.includes(editing.reason) ? editing.reason : '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [fullName, setFullName] = useState(editing?.fullName ?? '');
  const [busy, setBusy] = useState(false);

  const empCodeValid = /^\d{6}$/.test(empCode.trim());
  const effectiveReason = reasonPreset === '__custom__' ? reasonCustom.trim() : reasonPreset;

  const save = async () => {
    if (!empCodeValid) { alert('Mã NV phải là 6 chữ số.'); return; }
    if (!effectiveReason) { alert('Vui lòng chọn hoặc nhập lý do.'); return; }
    setBusy(true);
    try {
      await upsertIneligibility(adminEmail, empCode.trim(), {
        reason: effectiveReason,
        email: email.trim() || undefined,
        fullName: fullName.trim() || undefined,
      });
      onSaved();
    } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Drawer
      title={isEdit ? `Sửa ${editing!.empCode}` : 'Thêm vào danh sách chặn'}
      sub="Chặn theo mã nhân viên"
      cta={isEdit ? 'Cập nhật' : 'Thêm chặn'}
      busy={busy}
      onClose={onClose}
      onSave={save}
    >
      <div className="field">
        <label className="label">Mã nhân viên (6 chữ số)</label>
        <input
          className="input"
          value={empCode}
          onChange={(e) => setEmpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="VD: 262010"
          inputMode="numeric"
          maxLength={6}
          disabled={isEdit}
        />
        {empCode.length > 0 && !empCodeValid && <div className="help error">Mã NV phải là 6 chữ số.</div>}
      </div>
      <div className="field">
        <label className="label">Lý do (hiển thị cho nhân viên)</label>
        <select className="input" value={reasonPreset} onChange={(e) => setReasonPreset(e.target.value)}>
          {INELIGIBILITY_REASON_PRESETS.map((r) => <option key={r} value={r}>{splitReason(r).vn}</option>)}
          <option value="__custom__">Khác (gõ tự do)…</option>
        </select>
        {reasonPreset === '__custom__' && (
          <textarea className="input textarea" value={reasonCustom} onChange={(e) => setReasonCustom(e.target.value)} placeholder="Nhập lý do…" rows={3} style={{ marginTop: 'var(--s-2)' }} />
        )}
      </div>
      <div className="field">
        <label className="label">Email <span className="opt">(tuỳ chọn)</span></label>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@cyberlogitec.com" />
      </div>
      <div className="field">
        <label className="label">Họ tên <span className="opt">(tuỳ chọn)</span></label>
        <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
    </Drawer>
  );
}

// ── Config (unchanged) ──────────────────────────────────────────────────────

function ConfigTab({
  adminEmail, cfg, onReload,
}: { adminEmail: string; cfg: ConfigState; onReload: () => void }) {
  const [allowEnrollment, setAllowEnrollment] = useState(cfg.allowEnrollment);
  const [maxChanges, setMaxChanges] = useState(cfg.maxChanges);
  const [deadline, setDeadline] = useState(cfg.deadline ? toLocalInputValue(cfg.deadline) : '');
  const [emailConfirm, setEmailConfirm] = useState(cfg.emailConfirm);
  const [adminEmails, setAdminEmails] = useState(cfg.adminEmails.join('\n'));
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Sync local state when cfg prop changes (after onReload fetches fresh config)
  useEffect(() => {
    setAllowEnrollment(cfg.allowEnrollment);
    setMaxChanges(cfg.maxChanges);
    setDeadline(cfg.deadline ? toLocalInputValue(cfg.deadline) : '');
    setEmailConfirm(cfg.emailConfirm);
    setAdminEmails(cfg.adminEmails.join('\n'));
    setDirty(false);
  }, [cfg]);

  const markDirty = () => setDirty(true);

  const clearDeadline = () => { setDeadline(''); setDirty(true); };

  const stepMaxChanges = (delta: number) => {
    const v = Math.max(0, Math.min(99, maxChanges + delta));
    setMaxChanges(v);
    setDirty(true);
  };

  const save = async () => {
    const mc = maxChanges;
    if (isNaN(mc) || mc < 0) { alert('Số lần đổi phải là số ≥ 0'); return; }
    const extraAdmins = adminEmails.split(/[\n,]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    setBusy(true);
    try {
      await updateConfig(adminEmail, {
        allowEnrollment,
        maxChanges: mc,
        deadline: deadline ? new Date(deadline) : null,
        emailConfirm,
        adminEmails: extraAdmins,
      });
      setSavedAt(new Date().toLocaleTimeString('vi-VN'));
      setDirty(false);
      onReload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-hd">
        <h1>Cấu hình hệ thống</h1>
        <p className="sub">Điều khiển đăng ký, thông báo và phân quyền cho kỳ Assessment Q2 2026.</p>
      </div>

      {/* Group 1 · Đăng ký & Đổi ca */}
      <section className="card set-group">
        <div className="set-group-hd">
          <span className="gi" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h9A1.5 1.5 0 0 1 14 4.5v7A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7Z" stroke="currentColor" strokeWidth="1.3"/><path d="M2 6.5h12M5 3v2M11 3v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
          </span>
          <div>
            <div className="gt">Đăng ký & Đổi ca</div>
            <div className="gs">Quy tắc cho phép nhân viên đăng ký và thay đổi ca thi.</div>
          </div>
        </div>

        <div className="set-row">
          <div className="set-info">
            <div className="set-label">Cho phép đăng ký mới / sửa ca</div>
            <div className="set-desc">Khi tắt, user không thể đăng ký hoặc đổi ca nữa nhưng vẫn xem được booking đã có.</div>
          </div>
          <div className="set-control">
            <label className="switch">
              <input type="checkbox" checked={allowEnrollment} onChange={(e) => { setAllowEnrollment(e.target.checked); markDirty(); }} />
              <span className="track"></span>
              <span className="state-txt">{allowEnrollment ? 'Bật' : 'Tắt'}</span>
            </label>
          </div>
        </div>

        <div className="set-row">
          <div className="set-info">
            <div className="set-label">Số lần được đổi ca</div>
            <div className="set-desc">Mỗi user được đổi ca tối đa bấy nhiêu lần sau khi đã đăng ký.</div>
          </div>
          <div className="set-control">
            <div className="stepper-num">
              <button type="button" onClick={() => stepMaxChanges(-1)} aria-label="Giảm">−</button>
              <input type="text" inputMode="numeric" value={maxChanges} onChange={(e) => { const v = parseInt(e.target.value.replace(/\D/g, '').slice(0, 2), 10) || 0; setMaxChanges(v); markDirty(); }} />
              <button type="button" onClick={() => stepMaxChanges(1)} aria-label="Tăng">+</button>
            </div>
            <span className="text-sm text-muted">lần / user</span>
          </div>
        </div>

        <div className="set-row">
          <div className="set-info">
            <div className="set-label">Hạn đăng ký (deadline)</div>
            <div className="set-desc">Theo múi giờ thiết bị của bạn. Để trống = không giới hạn thời gian đăng ký.</div>
          </div>
          <div className="set-control">
            <input className="input dt" type="datetime-local" value={deadline} onChange={(e) => { setDeadline(e.target.value); markDirty(); }} />
            <button className="btn-link" type="button" onClick={clearDeadline}>Xoá</button>
          </div>
        </div>
      </section>

      {/* Group 2 · Email & Thông báo */}
      <section className="card set-group">
        <div className="set-group-hd">
          <span className="gi" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h9A1.5 1.5 0 0 1 14 4.5v7A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7Z" stroke="currentColor" strokeWidth="1.3"/><path d="m2.5 4.5 5.5 4 5.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <div>
            <div className="gt">Email & Thông báo</div>
            <div className="gs">Email tự động gửi cho nhân viên sau khi thao tác.</div>
          </div>
        </div>

        <div className="set-row">
          <div className="set-info">
            <div className="set-label">Gửi email xác nhận sau khi đăng ký</div>
            <div className="set-desc">Cần cài extension <code>firestore-send-email</code> trong Firebase. Email được ghi vào collection <code>/mail</code>.</div>
          </div>
          <div className="set-control">
            <label className="switch">
              <input type="checkbox" checked={emailConfirm} onChange={(e) => { setEmailConfirm(e.target.checked); markDirty(); }} />
              <span className="track"></span>
              <span className="state-txt">{emailConfirm ? 'Bật' : 'Tắt'}</span>
            </label>
          </div>
        </div>
      </section>

      {/* Group 3 · Phân quyền Admin */}
      <section className="card set-group">
        <div className="set-group-hd">
          <span className="gi" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2 3 4v3.5c0 3 2.1 5.2 5 6.5 2.9-1.3 5-3.5 5-6.5V4L8 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="m6 8 1.5 1.5L10.5 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <div>
            <div className="gt">Phân quyền Admin</div>
            <div className="gs">Cấp quyền admin không cần deploy lại.</div>
          </div>
        </div>

        <div className="set-row stacked">
          <div className="set-info">
            <div className="set-label">Admin email bổ sung</div>
            <div className="set-desc">Mỗi dòng 1 email. Những tài khoản này sẽ có toàn quyền admin.</div>
          </div>
          <textarea
            className="input textarea"
            value={adminEmails}
            onChange={(e) => { setAdminEmails(e.target.value); markDirty(); }}
            spellCheck={false}
            placeholder="admin1@cyberlogitec.com&#10;admin2@cyberlogitec.com"
          />
        </div>

        <div className="set-row stacked" style={{ paddingTop: 0 }}>
          <div className="set-info">
            <div className="set-label" style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-600)' }}>Admin mặc định (hardcoded)</div>
            <div className="set-desc">Luôn có quyền, không thể gỡ ở đây.</div>
            <div className="admin-chips">
              <span className="admin-chip"><span className="dot">H</span>hao.nha <span className="lock">🔒</span></span>
              <span className="admin-chip"><span className="dot">P</span>phuc.lnk <span className="lock">🔒</span></span>
              <span className="admin-chip"><span className="dot">A</span>anhhao.dl108 <span className="lock">🔒</span></span>
            </div>
          </div>
        </div>
      </section>

      {/* Sticky save bar */}
      <div className="save-bar">
        <div className="save-bar-inner">
          <div className={`save-status${dirty ? ' dirty' : ''}`}>
            <span className="sdot"></span>
            <span>{dirty ? 'Có thay đổi chưa lưu' : savedAt ? `Đã lưu · cập nhật gần nhất ${savedAt}` : 'Chưa có thay đổi'}</span>
          </div>
          <div className="row" style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" type="button" disabled={!dirty} onClick={() => { setAllowEnrollment(cfg.allowEnrollment); setMaxChanges(cfg.maxChanges); setDeadline(cfg.deadline ? toLocalInputValue(cfg.deadline) : ''); setEmailConfirm(cfg.emailConfirm); setAdminEmails(cfg.adminEmails.join('\n')); setDirty(false); }}>Hoàn tác</button>
            <button className="btn" type="button" onClick={save} disabled={busy || !dirty}>
              {busy ? <><span className="spinner" /> Đang lưu…</> : 'Lưu cấu hình'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Audit Log (human-readable) ────────────────────────────────────────────────

type AuditEvClass = 'create' | 'update' | 'cancel' | 'block' | 'config';

interface AuditView {
  evClass: AuditEvClass;
  evLabel: string;
  subject: string;
  meta?: string;
  diffs: { k: string; from?: string | null; to?: string | null }[];
  note?: string;
}

function buildAuditView(l: AuditEntry, slotMap: Map<string, Slot>): AuditView {
  const d = l.detail as Record<string, any>;
  const sl = (id: any) => slotLabel(slotMap, typeof id === 'string' ? id : null);
  switch (l.event) {
    case 'book.create':
      return {
        evClass: 'create', evLabel: 'Tạo đăng ký',
        subject: d.fullName || d.empCode || '',
        diffs: [
          ...(d.speakingSlotId ? [{ k: 'Speaking', to: sl(d.speakingSlotId) }] : []),
          ...(d.skillsSlotId ? [{ k: '3 Skills', to: sl(d.skillsSlotId) }] : []),
        ],
      };
    case 'book.update': {
      const diffs: AuditView['diffs'] = [];
      if (d.prevSpeakingSlotId !== d.speakingSlotId) diffs.push({ k: 'Speaking', from: sl(d.prevSpeakingSlotId), to: sl(d.speakingSlotId) });
      if (d.prevSkillsSlotId !== d.skillsSlotId) diffs.push({ k: '3 Skills', from: sl(d.prevSkillsSlotId), to: sl(d.skillsSlotId) });
      return {
        evClass: 'update', evLabel: 'Sửa đăng ký',
        subject: d.fullName || d.empCode || '',
        meta: d.changeCount != null ? `Lần đổi #${d.changeCount}` : undefined,
        diffs,
      };
    }
    case 'book.cancel':
      return { evClass: 'cancel', evLabel: 'Huỷ đăng ký', subject: d.fullName || d.empCode || l.email, diffs: [] };
    case 'book.rejected.blocked':
      return { evClass: 'block', evLabel: 'Bị chặn (không đủ điều kiện)', subject: d.empCode || l.email, diffs: [], note: d.reason };
    case 'admin.createSlot':
      return { evClass: 'create', evLabel: 'Tạo ca thi', subject: d.slotId || '', diffs: [] };
    case 'admin.deleteSlot':
      return { evClass: 'cancel', evLabel: 'Xoá ca thi', subject: d.slotId || '', diffs: [] };
    case 'admin.updateSlot':
      return {
        evClass: 'update', evLabel: 'Sửa ca thi', subject: d.slotId || '',
        diffs: d.updates ? Object.entries(d.updates).map(([k, v]) => ({ k, to: String(v) })) : [],
      };
    case 'admin.deleteRegistration':
      return { evClass: 'cancel', evLabel: 'Xoá đăng ký (admin)', subject: d.fullName || d.targetEmail || '', diffs: [] };
    case 'admin.upsertIneligibility':
      return { evClass: 'block', evLabel: 'Thêm vào danh sách chặn', subject: d.empCode || '', diffs: [], note: d.reason };
    case 'admin.deleteIneligibility':
      return { evClass: 'cancel', evLabel: 'Gỡ khỏi danh sách chặn', subject: d.empCode || '', diffs: [] };
    case 'admin.updateConfig':
      return { evClass: 'config', evLabel: 'Cập nhật cấu hình', subject: '', diffs: [] };
    default:
      return { evClass: 'config', evLabel: l.event, subject: '', diffs: Object.keys(d).length ? [{ k: 'detail', to: JSON.stringify(d) }] : [] };
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const dd = Math.floor(h / 24);
  return `${dd} ngày trước`;
}

function AuditTab({ slots }: { slots: Slot[] }) {
  const [logs, setLogs] = useState<AuditEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | AuditEvClass>('all');

  const slotMap = useMemo(() => new Map(slots.map((s) => [s.slotId, s])), [slots]);

  useEffect(() => {
    listAuditLogs(500).then(setLogs).catch((e: Error) => setErr(e.message));
  }, []);

  const rows = useMemo(() => {
    if (!logs) return [];
    const needle = q.trim().toLowerCase();
    return logs
      .map((l) => ({ l, v: buildAuditView(l, slotMap) }))
      .filter(({ l, v }) => {
        if (filter !== 'all' && v.evClass !== filter) return false;
        if (!needle) return true;
        return (`${l.email} ${v.subject} ${v.evLabel} ${v.note ?? ''}`).toLowerCase().includes(needle);
      });
  }, [logs, slotMap, q, filter]);

  if (err) return <div className="panel"><p style={{ color: 'var(--danger)', padding: 'var(--s-5)' }}>{err}</p></div>;
  if (!logs) return <div className="panel"><div className="loading" style={{ padding: 'var(--s-6)' }}><span className="spinner" /> Đang tải…</div></div>;

  const FILTERS: [('all' | AuditEvClass), string][] = [['all', 'Tất cả'], ['create', 'Tạo'], ['update', 'Sửa'], ['cancel', 'Huỷ'], ['block', 'Chặn']];

  return (
    <div className="panel">
      <div className="toolbar">
        <div className="filter-chips">
          {FILTERS.map(([v, l]) => <button key={v} type="button" className={filter === v ? 'active' : ''} onClick={() => setFilter(v)}>{l}</button>)}
        </div>
        <div className="search"><SearchIcon /><input type="text" placeholder="Tìm email, mã NV, tên…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="spacer" />
        <span className="text-sm text-muted">{rows.length} thao tác</span>
      </div>
      <div className="aud-list">
        {rows.map(({ l, v }) => (
          <div className="aud-row" key={l.id}>
            <div className="aud-when">
              {l.timestamp ? new Date(l.timestamp).toLocaleString('vi-VN') : '—'}
              <span className="ago">{timeAgo(l.timestamp)}</span>
            </div>
            <div className="aud-main">
              <div className="aud-head">
                <span className={`aud-ev ${v.evClass}`}>{v.evLabel}</span>
                {v.subject && <span className="aud-subject">{v.subject}</span>}
                <span className="aud-actor">· bởi {l.email}</span>
                {v.meta && <span className="aud-actor">· {v.meta}</span>}
              </div>
              {v.diffs.length > 0 && (
                <div className="aud-diffs">
                  {v.diffs.map((diff, i) => (
                    <div className="aud-diff" key={i}>
                      <span className="dk">{diff.k}</span>
                      {diff.from && <><span className="from tnum">{diff.from}</span><span className="arrow">→</span></>}
                      <span className="to tnum">{diff.to}</span>
                    </div>
                  ))}
                </div>
              )}
              {v.note && <div className="aud-note">{v.note}</div>}
            </div>
          </div>
        ))}
      </div>
      {rows.length === 0 && <div className="empty-state"><div className="es-title">Không có thao tác nào</div></div>}
    </div>
  );
}

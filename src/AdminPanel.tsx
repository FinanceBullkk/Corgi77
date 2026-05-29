import { Fragment, useEffect, useMemo, useState } from 'react';
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
import { formatDateVi, minToHHmm, type Slot } from './lib/types';

type Tab = 'overview' | 'registrations' | 'slots' | 'ineligibility' | 'config' | 'audit';

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

  if (err) return (
    <div className="app">
      <AdminHeader onExit={onExit} />
      <div className="error-screen">
        <h2>Lỗi tải dữ liệu admin</h2>
        <p>{err}</p>
        <button className="primary" onClick={reload}>Thử lại</button>
      </div>
    </div>
  );

  if (!slots || !regs || !cfg || !inelig) {
    return (
      <div className="app">
        <AdminHeader onExit={onExit} />
        <div className="loading"><span className="spinner" /> Đang tải…</div>
      </div>
    );
  }

  return (
    <div className="app">
      <AdminHeader onExit={onExit} onReload={reload} />
      <nav className="tabbar">
        <div className="tabbar-inner">
          <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')}>Tổng quan</TabBtn>
          <TabBtn active={tab === 'registrations'} onClick={() => setTab('registrations')}>
            Đăng ký <span className="count">{regs.length}</span>
          </TabBtn>
          <TabBtn active={tab === 'slots'} onClick={() => setTab('slots')}>
            Ca thi <span className="count">{slots.length}</span>
          </TabBtn>
          <TabBtn active={tab === 'ineligibility'} onClick={() => setTab('ineligibility')}>
            Danh sách chặn <span className="count">{inelig.length}</span>
          </TabBtn>
          <TabBtn active={tab === 'config'} onClick={() => setTab('config')}>Cấu hình</TabBtn>
          <TabBtn active={tab === 'audit'} onClick={() => setTab('audit')}>Audit</TabBtn>
        </div>
      </nav>

      <main className="container wide" style={{ flex: 1 }}>
        {tab === 'overview' && <Overview slots={slots} regs={regs} />}
        {tab === 'registrations' && (
          <RegistrationsTab adminEmail={adminEmail} slots={slots} regs={regs} onReload={reload} />
        )}
        {tab === 'slots' && (
          <SlotsTab adminEmail={adminEmail} slots={slots} regs={regs} onReload={reload} />
        )}
        {tab === 'ineligibility' && (
          <IneligibilityTab adminEmail={adminEmail} inelig={inelig} onReload={reload} />
        )}
        {tab === 'config' && <ConfigTab adminEmail={adminEmail} cfg={cfg} onReload={reload} />}
        {tab === 'audit' && <AuditTab />}
      </main>
    </div>
  );
}

function AdminHeader({ onExit, onReload }: { onExit: () => void; onReload?: () => void }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <span className="logo"><span className="logo-mark">C7</span></span>
          <div className="topbar-title">
            <span className="t">Admin Panel <span className="badge-admin">Admin</span></span>
            <span className="s">Quản trị đăng ký · Assessment Q2 2026</span>
          </div>
        </div>
        <div className="topbar-right">
          {onReload && <button className="btn ghost sm" type="button" onClick={onReload}>↻ Tải lại</button>}
          <button className="btn ghost sm" type="button" onClick={onExit}>← Về trang User</button>
        </div>
      </div>
    </header>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`tab ${active ? 'active' : ''}`} onClick={onClick}>{children}</button>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────

function Overview({ slots, regs }: { slots: Slot[]; regs: Registration[] }) {
  const sp = slots.filter((s) => s.type === 'Speaking');
  const sk = slots.filter((s) => s.type === '3 Skills');
  const totalSpCap = sp.reduce((a, s) => a + s.capacity, 0);
  const totalSkCap = sk.reduce((a, s) => a + s.capacity, 0);
  const totalSpRem = sp.reduce((a, s) => a + s.remaining, 0);
  const totalSkRem = sk.reduce((a, s) => a + s.remaining, 0);

  return (
    <div className="card">
      <h2>Tổng quan</h2>
      <div className="stat-grid">
        <Stat label="Tổng đăng ký" value={regs.length} />
        <Stat label="Speaking (đã đặt / tổng)" value={`${totalSpCap - totalSpRem} / ${totalSpCap}`} />
        <Stat label="3 Skills (đã đặt / tổng)" value={`${totalSkCap - totalSkRem} / ${totalSkCap}`} />
        <Stat label="Tổng số ca" value={slots.length} />
      </div>

      <h3 style={{ marginTop: 20 }}>Chi tiết theo ca</h3>
      <table className="admin-table">
        <thead>
          <tr><th>Loại</th><th>Ngày</th><th>Giờ</th><th>Đã đặt</th><th>Còn</th><th>Sức chứa</th></tr>
        </thead>
        <tbody>
          {slots.map((s) => (
            <tr key={s.slotId}>
              <td>{s.type}</td>
              <td>{formatDateVi(s.date)}</td>
              <td>{minToHHmm(s.startMin)}–{minToHHmm(s.endMin)}</td>
              <td>{s.capacity - s.remaining}</td>
              <td className={s.remaining === 0 ? 'cell-danger' : s.remaining <= 2 ? 'cell-warn' : ''}>{s.remaining}</td>
              <td>{s.capacity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-box">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

// ── Registrations ─────────────────────────────────────────────────────────────

function RegistrationsTab({
  adminEmail, slots, regs, onReload,
}: { adminEmail: string; slots: Slot[]; regs: Registration[]; onReload: () => void }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const slotMap = useMemo(() => new Map(slots.map((s) => [s.slotId, s])), [slots]);

  const fmtSlot = (id: string | null) => {
    if (!id) return '—';
    const s = slotMap.get(id);
    if (!s) return <span style={{ color: 'var(--danger)' }}>{id} (đã xoá)</span>;
    return `${formatDateVi(s.date)} · ${minToHHmm(s.startMin)}–${minToHHmm(s.endMin)}`;
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return regs;
    return regs.filter((r) =>
      r.email.toLowerCase().includes(needle)
      || r.empCode.toLowerCase().includes(needle)
      || r.fullName.toLowerCase().includes(needle)
      || r.bu.toLowerCase().includes(needle)
    );
  }, [regs, q]);

  // Reset to page 1 when search changes
  useEffect(() => { setPage(1); }, [q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDelete = async (regEmail: string) => {
    if (!confirm(`Xoá đăng ký của "${regEmail}"?\n(Các slot đã đặt sẽ được trả về.)`)) return;
    setBusy(regEmail);
    try {
      await adminDeleteRegistration(adminEmail, regEmail);
      onReload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          placeholder="Tìm theo email, mã NV, tên, BU…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)' }}
        />
        <button className="primary" onClick={() => downloadRegistrationsCsv(regs, slots)}>
          ⬇ Xuất CSV ({regs.length})
        </button>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Email</th><th>Mã NV</th><th>Họ tên</th><th>BU</th>
            <th>Speaking</th><th>3 Skills</th><th>Đổi</th><th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Chưa có đăng ký nào.</td></tr>
          )}
          {paged.map((r) => (
            <tr key={r.email}>
              <td>{r.email}</td>
              <td>{r.empCode}</td>
              <td>{r.fullName}</td>
              <td>{r.bu}</td>
              <td>{fmtSlot(r.speakingSlotId)}</td>
              <td>{fmtSlot(r.skillsSlotId)}</td>
              <td>{r.changeCount}</td>
              <td>
                <button className="danger small" onClick={() => handleDelete(r.email)} disabled={busy === r.email}>
                  {busy === r.email ? '…' : 'Xoá'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="pagination" role="navigation" aria-label="Phân trang danh sách đăng ký">
          <button className="ghost small" disabled={page <= 1} onClick={() => setPage(1)} aria-label="Trang đầu">⏮</button>
          <button className="ghost small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Trang trước">◀</button>
          <span className="pagination-info">Trang {page} / {totalPages} ({filtered.length} kết quả)</span>
          <button className="ghost small" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Trang sau">▶</button>
          <button className="ghost small" disabled={page >= totalPages} onClick={() => setPage(totalPages)} aria-label="Trang cuối">⏭</button>
        </div>
      )}
    </div>
  );
}

// ── Slots (with Add/Delete/Drill-down) ────────────────────────────────────────

function SlotsTab({ adminEmail, slots, regs, onReload }: {
  adminEmail: string; slots: Slot[]; regs: Registration[]; onReload: () => void;
}) {
  const [edit, setEdit] = useState<string | null>(null);
  const [cap, setCap] = useState('');
  const [loc, setLoc] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedRegs, setExpandedRegs] = useState<Map<string, Registration[]>>(new Map());
  const [showAdd, setShowAdd] = useState(false);

  const usage = useMemo(() => {
    const map = new Map<string, number>();
    regs.forEach((r) => {
      if (r.speakingSlotId) map.set(r.speakingSlotId, (map.get(r.speakingSlotId) ?? 0) + 1);
      if (r.skillsSlotId) map.set(r.skillsSlotId, (map.get(r.skillsSlotId) ?? 0) + 1);
    });
    return map;
  }, [regs]);

  const startEdit = (s: Slot) => {
    setEdit(s.slotId);
    setCap(String(s.capacity));
    setLoc(s.location);
  };

  const save = async (s: Slot) => {
    const newCap = parseInt(cap, 10);
    if (isNaN(newCap) || newCap < 0) { alert('Sức chứa phải là số ≥ 0'); return; }
    const used = usage.get(s.slotId) ?? 0;
    if (newCap < used) { alert(`Không thể giảm xuống ${newCap} vì đã có ${used} người đăng ký.`); return; }
    setBusy(true);
    try {
      await updateSlot(adminEmail, s.slotId, { capacity: newCap, remaining: newCap - used, location: loc });
      setEdit(null);
      onReload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleExpand = async (slotId: string) => {
    if (expanded === slotId) { setExpanded(null); return; }
    setExpanded(slotId);
    if (!expandedRegs.has(slotId)) {
      try {
        const list = await listRegistrationsForSlot(slotId);
        setExpandedRegs((m) => new Map(m).set(slotId, list));
      } catch (e) {
        alert((e as Error).message);
      }
    }
  };

  const handleDelete = async (s: Slot) => {
    const used = usage.get(s.slotId) ?? 0;
    const msg = used > 0
      ? `Ca này có ${used} người đã đăng ký. Xoá sẽ khiến các đăng ký đó bị mồ côi (orphan).\nVẫn xoá?`
      : `Xoá ca "${s.slotId}" (${formatDateVi(s.date)} ${minToHHmm(s.startMin)}–${minToHHmm(s.endMin)})?`;
    if (!confirm(msg)) return;
    try {
      await adminDeleteSlot(adminEmail, s.slotId);
      onReload();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Quản lý ca thi</h2>
        <button className="primary small" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? '× Đóng' : '+ Thêm ca'}
        </button>
      </div>

      {showAdd && (
        <AddSlotForm
          adminEmail={adminEmail}
          onCreated={() => { setShowAdd(false); onReload(); }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      <table className="admin-table" style={{ marginTop: 12 }}>
        <thead>
          <tr><th></th><th>Loại</th><th>Ngày/Giờ</th><th>Đã đặt</th><th>Sức chứa</th><th>Địa điểm</th><th></th></tr>
        </thead>
        <tbody>
          {slots.map((s) => {
            const editing = edit === s.slotId;
            const used = usage.get(s.slotId) ?? 0;
            const isExpanded = expanded === s.slotId;
            const regsHere = expandedRegs.get(s.slotId) ?? [];
            return (
              <Fragment key={s.slotId}>
                <tr>
                  <td>
                    <button className="ghost small" onClick={() => toggleExpand(s.slotId)} title="Xem chi tiết">
                      {isExpanded ? '▾' : '▸'}
                    </button>
                  </td>
                  <td>{s.type}</td>
                  <td>{formatDateVi(s.date)} · {minToHHmm(s.startMin)}–{minToHHmm(s.endMin)}</td>
                  <td>{used}</td>
                  <td>
                    {editing
                      ? <input type="number" value={cap} onChange={(e) => setCap(e.target.value)} style={{ width: 70 }} />
                      : s.capacity}
                  </td>
                  <td>
                    {editing
                      ? <input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Phòng…" style={{ width: 140 }} />
                      : s.location || '—'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {editing ? (
                      <>
                        <button className="primary small" onClick={() => save(s)} disabled={busy}>Lưu</button>
                        <button className="ghost small" onClick={() => setEdit(null)} disabled={busy}>Huỷ</button>
                      </>
                    ) : (
                      <>
                        <button className="ghost small" onClick={() => startEdit(s)}>Sửa</button>
                        <button className="danger small" onClick={() => handleDelete(s)}>Xoá</button>
                      </>
                    )}
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={7} style={{ background: 'var(--bg)', padding: 12 }}>
                      <strong>Người đã đặt ca này ({regsHere.length}):</strong>
                      {regsHere.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', margin: '8px 0 0' }}>Chưa có ai đặt ca này.</p>
                      ) : (
                        <table className="admin-table" style={{ marginTop: 8 }}>
                          <thead><tr><th>Email</th><th>Mã NV</th><th>Họ tên</th><th>BU</th></tr></thead>
                          <tbody>
                            {regsHere.map((r) => (
                              <tr key={r.email}>
                                <td>{r.email}</td>
                                <td>{r.empCode}</td>
                                <td>{r.fullName}</td>
                                <td>{r.bu}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AddSlotForm({
  adminEmail, onCreated, onCancel,
}: { adminEmail: string; onCreated: () => void; onCancel: () => void }) {
  const [type, setType] = useState<'Speaking' | '3 Skills'>('Speaking');
  const [date, setDate] = useState('');
  const [session, setSession] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [capacity, setCapacity] = useState('8');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);

  const parseTime = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const startMin = parseTime(start);
    const endMin = parseTime(end);
    const cap = parseInt(capacity, 10);
    if (!date) { alert('Chọn ngày'); return; }
    if (startMin >= endMin) { alert('Giờ bắt đầu phải trước giờ kết thúc'); return; }
    if (!cap || cap <= 0) { alert('Sức chứa phải > 0'); return; }
    setBusy(true);
    try {
      const id = await adminCreateSlot(adminEmail, {
        type, date, session: session.trim(), startMin, endMin, capacity: cap, location: location.trim(),
      });
      alert(`Đã tạo ca: ${id}`);
      onCreated();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const previewId = date && start ? generateSlotId(type, date, parseTime(start)) : '';

  return (
    <form onSubmit={handleSubmit} className="add-slot-form">
      <h3 style={{ margin: '12px 0 8px' }}>Thêm ca thi</h3>
      <fieldset style={{ border: '1px solid var(--ink-150)', borderRadius: 'var(--r-md)', padding: 'var(--s-3) var(--s-4)', marginBottom: 'var(--s-3)' }}>
        <legend style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--ink-700)', padding: '0 var(--s-1)' }}>Thông tin ca thi</legend>
        <div className="row">
          <label className="field">
            <span>Loại</span>
            <select value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="Speaking">Speaking</option>
              <option value="3 Skills">3 Skills</option>
            </select>
          </label>
          <label className="field">
            <span>Ngày</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="field">
            <span>Session (tuỳ chọn)</span>
            <input value={session} onChange={(e) => setSession(e.target.value)} placeholder="AM / PM" />
          </label>
        </div>
      </fieldset>
      <fieldset style={{ border: '1px solid var(--ink-150)', borderRadius: 'var(--r-md)', padding: 'var(--s-3) var(--s-4)', marginBottom: 'var(--s-3)' }}>
        <legend style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--ink-700)', padding: '0 var(--s-1)' }}>Thời gian & Sức chứa</legend>
        <div className="row">
          <label className="field">
            <span>Giờ bắt đầu</span>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label className="field">
            <span>Giờ kết thúc</span>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </label>
          <label className="field">
            <span>Sức chứa</span>
            <input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} required />
          </label>
        </div>
      </fieldset>
      <fieldset style={{ border: '1px solid var(--ink-150)', borderRadius: 'var(--r-md)', padding: 'var(--s-3) var(--s-4)', marginBottom: 'var(--s-3)' }}>
        <legend style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--ink-700)', padding: '0 var(--s-1)' }}>Địa điểm</legend>
        <div className="row">
          <label className="field" style={{ flex: 1 }}>
            <span>Địa điểm</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="VD: Phòng họp A" />
          </label>
        </div>
      </fieldset>
      {previewId && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 12px' }}>
          ID ca sẽ là: <code>{previewId}</code>
        </p>
      )}
      <div className="actions">
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo ca'}</button>
        <button className="ghost" type="button" onClick={onCancel} disabled={busy}>Huỷ</button>
      </div>
    </form>
  );
}

// ── Ineligibility (blocklist by empCode + reason) ─────────────────────────────

function IneligibilityTab({
  adminEmail, inelig, onReload,
}: { adminEmail: string; inelig: IneligibilityEntry[]; onReload: () => void }) {
  const [q, setQ] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<IneligibilityEntry | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return inelig;
    return inelig.filter((e) =>
      e.empCode.toLowerCase().includes(needle)
      || e.reason.toLowerCase().includes(needle)
      || (e.email ?? '').toLowerCase().includes(needle)
      || (e.fullName ?? '').toLowerCase().includes(needle)
    );
  }, [inelig, q]);

  const handleDelete = async (empCode: string) => {
    if (!confirm(`Xoá empCode "${empCode}" khỏi danh sách chặn?\n(Người này sẽ được phép đăng ký lại.)`)) return;
    setBusy(empCode);
    try {
      await deleteIneligibility(adminEmail, empCode);
      onReload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Danh sách chặn ({inelig.length})</h2>
        <button className="primary small" onClick={() => { setShowAdd((v) => !v); setEditing(null); }}>
          {showAdd ? '× Đóng' : '+ Thêm empCode'}
        </button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
        Người có empCode trong danh sách này <b>không được đăng ký</b> kỳ thi. Khi họ điền empCode ở Bước 1,
        hệ thống sẽ chặn và hiển thị lý do (<code>reason</code>) cho họ thấy. Danh sách rỗng = không ai bị chặn.
      </p>

      {(showAdd || editing) && (
        <AddIneligibilityForm
          adminEmail={adminEmail}
          editing={editing}
          onSaved={() => { setShowAdd(false); setEditing(null); onReload(); }}
          onCancel={() => { setShowAdd(false); setEditing(null); }}
        />
      )}

      <input
        placeholder="Tìm theo empCode, reason, email, tên…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', marginTop: 12 }}
      />

      <table className="admin-table" style={{ marginTop: 8 }}>
        <thead>
          <tr><th>empCode</th><th>Reason</th><th>Email</th><th>Họ tên</th><th></th></tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Chưa có dữ liệu.</td></tr>
          )}
          {filtered.map((e) => (
            <tr key={e.empCode}>
              <td><code>{e.empCode}</code></td>
              <td style={{ maxWidth: 360, fontSize: 13 }}>{e.reason}</td>
              <td>{e.email ?? '—'}</td>
              <td>{e.fullName ?? '—'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="ghost small" onClick={() => { setEditing(e); setShowAdd(false); }}>Sửa</button>
                <button className="danger small" disabled={busy === e.empCode} onClick={() => handleDelete(e.empCode)}>
                  {busy === e.empCode ? '…' : 'Xoá'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddIneligibilityForm({
  adminEmail, editing, onSaved, onCancel,
}: {
  adminEmail: string;
  editing: IneligibilityEntry | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [empCode, setEmpCode] = useState(editing?.empCode ?? '');
  const [reasonPreset, setReasonPreset] = useState<string>(() => {
    if (!editing) return INELIGIBILITY_REASON_PRESETS[0];
    return INELIGIBILITY_REASON_PRESETS.includes(editing.reason) ? editing.reason : '__custom__';
  });
  const [reasonCustom, setReasonCustom] = useState(editing && !INELIGIBILITY_REASON_PRESETS.includes(editing.reason) ? editing.reason : '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [fullName, setFullName] = useState(editing?.fullName ?? '');
  const [busy, setBusy] = useState(false);

  const isEditing = !!editing;
  const empCodeValid = /^\d{6}$/.test(empCode.trim());

  const effectiveReason = reasonPreset === '__custom__' ? reasonCustom.trim() : reasonPreset;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ marginTop: 12, padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
      <h3 style={{ margin: '0 0 8px' }}>{isEditing ? `Sửa ${editing!.empCode}` : 'Thêm empCode bị chặn'}</h3>
      <div className="row">
        <label className="field">
          <span>Mã NV (6 chữ số)</span>
          <input
            value={empCode}
            onChange={(e) => setEmpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="VD: 262010"
            inputMode="numeric"
            required
            maxLength={6}
            disabled={isEditing}
          />
          {empCode.length > 0 && !empCodeValid && (
            <small style={{ color: 'var(--danger)' }}>Mã NV phải là 6 chữ số.</small>
          )}
        </label>
        <label className="field" style={{ flex: 2 }}>
          <span>Email (tuỳ chọn)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@cyberlogitec.com" />
        </label>
        <label className="field" style={{ flex: 2 }}>
          <span>Họ tên (tuỳ chọn)</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
      </div>
      <div className="config-row">
        <div className="config-label">Lý do hiển thị cho user</div>
        <select value={reasonPreset} onChange={(e) => setReasonPreset(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
          {INELIGIBILITY_REASON_PRESETS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
          <option value="__custom__">Khác (gõ tự do)…</option>
        </select>
        {reasonPreset === '__custom__' && (
          <textarea
            value={reasonCustom}
            onChange={(e) => setReasonCustom(e.target.value)}
            placeholder="Nhập lý do…"
            rows={3}
            style={{ width: '100%', marginTop: 8, padding: 8, borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
          />
        )}
      </div>
      <div className="actions">
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Đang lưu…' : (isEditing ? 'Cập nhật' : 'Thêm')}</button>
        <button className="ghost" type="button" onClick={onCancel} disabled={busy}>Huỷ</button>
      </div>
    </form>
  );
}

// ── Config ────────────────────────────────────────────────────────────────────

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

// ── Audit Log ─────────────────────────────────────────────────────────────────

function AuditTab() {
  const [logs, setLogs] = useState<AuditEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    listAuditLogs(500)
      .then(setLogs)
      .catch((e: Error) => setErr(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!logs) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return logs;
    return logs.filter((l) =>
      l.email.toLowerCase().includes(needle)
      || l.event.toLowerCase().includes(needle)
      || JSON.stringify(l.detail).toLowerCase().includes(needle)
    );
  }, [logs, q]);

  if (err) return <div className="card"><p style={{ color: 'var(--danger)' }}>{err}</p></div>;
  if (!logs) return <div className="card"><span className="spinner" /> Đang tải…</div>;

  return (
    <div className="card">
      <h2>Audit Log ({logs.length})</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        Lịch sử thao tác (mới nhất trước). Tối đa 500 dòng. Tất cả immutable — không thể sửa/xoá.
      </p>
      <input
        placeholder="Tìm email, event, hoặc nội dung detail…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', marginBottom: 12 }}
      />
      <table className="admin-table">
        <thead>
          <tr><th>Thời gian</th><th>Email</th><th>Event</th><th>Chi tiết</th></tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Không có log.</td></tr>
          )}
          {filtered.map((l) => (
            <tr key={l.id}>
              <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                {l.timestamp ? new Date(l.timestamp).toLocaleString('vi-VN') : '—'}
              </td>
              <td style={{ fontSize: 12 }}>{l.email}</td>
              <td style={{ fontSize: 12 }}><code>{l.event}</code></td>
              <td style={{ fontSize: 11, fontFamily: 'monospace', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {Object.keys(l.detail).length > 0 ? JSON.stringify(l.detail) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

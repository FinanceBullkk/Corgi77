import { useMemo, useState } from 'react';
import { formatDateVi, minToHHmm, type Slot } from '../lib/types';
import { adminDeleteSlot, type Registration } from '../lib/adminDb';
import { useConfirm, useToast } from '../confirm-toast-provider';
import { slotStatus, STATUS_LABEL, typClass, dowVi } from './admin-utils';
import { SearchIcon } from './admin-icons';
import { RowMenu } from './admin-chrome';
import { SlotDrawer, SlotRegsDrawer } from './slot-drawer';

// ── Slots (Ca thi) ─────────────────────────────────────────────────────────────

export function SlotsTab({
  adminEmail, slots, regs, allowEnrollment, onReload,
}: { adminEmail: string; slots: Slot[]; regs: Registration[]; allowEnrollment: boolean; onReload: () => void }) {
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'Speaking' | '3 Skills'>('all');
  const [dayFilter, setDayFilter] = useState('all');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState<{ slot: Slot | null } | null>(null);
  const [regsDrawer, setRegsDrawer] = useState<Slot | null>(null);
  const confirm = useConfirm();
  const toast = useToast();

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
    const ok = await confirm({ title: 'Xoá ca thi?', message: msg, confirmText: 'Xoá', danger: true });
    if (!ok) return;
    setBusy(true);
    try { await adminDeleteSlot(adminEmail, s.slotId); toast('success', `Đã xoá ca ${s.slotId}.`); onReload(); }
    catch (e) { toast('error', (e as Error).message); } finally { setBusy(false); }
  };

  const bulkDelete = async () => {
    const ids = Array.from(sel);
    const withUsers = ids.filter((id) => (usage.get(id) ?? 0) > 0).length;
    const warn = withUsers > 0 ? `\n${withUsers} ca đang có người đăng ký — sẽ thành orphan.` : '';
    const ok = await confirm({
      title: `Xoá ${ids.length} ca thi?`,
      message: `Xoá ${ids.length} ca đã chọn?${warn}`,
      confirmText: 'Xoá tất cả',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const results = await Promise.allSettled(ids.map((id) => adminDeleteSlot(adminEmail, id)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    const done = ids.length - failed;
    setSel(new Set());
    onReload();
    setBusy(false);
    if (failed === 0) toast('success', `Đã xoá ${done} ca thi.`);
    else toast('error', `Đã xoá ${done}/${ids.length} ca · ${failed} lỗi.`);
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

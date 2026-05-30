import { useMemo, useState } from 'react';
import { type Slot } from '../lib/types';
import {
  adminDeleteRegistration,
  downloadRegistrationsCsv,
  type BackfillEmpCodeClaimsResult,
  type Registration,
} from '../lib/adminDb';
import { useConfirm, useToast } from '../confirm-toast-provider';
import { slotLabel } from './admin-utils';
import { SearchIcon } from './admin-icons';
import { RowMenu } from './admin-chrome';

// ── Registrations (Đăng ký) ───────────────────────────────────────────────────

export type ClaimSyncState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'ok'; result: BackfillEmpCodeClaimsResult }
  | { status: 'attention'; result: BackfillEmpCodeClaimsResult }
  | { status: 'error'; error: string };

export function RegistrationsTab({
  adminEmail, slots, regs, regsTotal, hasMoreRegs, regsLoadingMore, onLoadMore, onReload, claimSync,
}: {
  adminEmail: string;
  slots: Slot[];
  regs: Registration[];
  regsTotal: number;
  hasMoreRegs: boolean;
  regsLoadingMore: boolean;
  onLoadMore: () => void;
  onReload: () => void;
  claimSync: ClaimSyncState;
}) {
  const [q, setQ] = useState('');
  const [bu, setBu] = useState('all');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

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
    const ok = await confirm({
      title: 'Huỷ đăng ký?',
      message: `Huỷ đăng ký của "${email}"?\n(Các ca đã đặt sẽ được trả về.)`,
      confirmText: 'Huỷ đăng ký',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try { await adminDeleteRegistration(adminEmail, email); toast('success', `Đã huỷ đăng ký của ${email}.`); onReload(); }
    catch (e) { toast('error', (e as Error).message); } finally { setBusy(false); }
  };

  const bulkCancel = async () => {
    const emails = Array.from(sel);
    const ok = await confirm({
      title: `Huỷ ${emails.length} đăng ký?`,
      message: `Huỷ ${emails.length} đăng ký đã chọn?\n(Các ca đã đặt sẽ được trả về.)`,
      confirmText: 'Huỷ tất cả',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const results = await Promise.allSettled(
      emails.map((e) => adminDeleteRegistration(adminEmail, e)),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    const done = emails.length - failed;
    setSel(new Set());
    onReload();
    setBusy(false);
    if (failed === 0) toast('success', `Đã huỷ ${done} đăng ký.`);
    else toast('error', `Đã huỷ ${done}/${emails.length} đăng ký · ${failed} lỗi.`);
  };

  const bulkExport = () => {
    const chosen = regs.filter((r) => sel.has(r.email));
    downloadRegistrationsCsv(chosen, slots);
  };

  const claimSyncBanner = (() => {
    if (claimSync.status === 'running') {
      return <div className="banner info mb-4"><div>Đang tự đồng bộ khóa mã NV...</div></div>;
    }
    if (claimSync.status === 'error') {
      return <div className="banner danger mb-4"><div>Tự đồng bộ mã NV thất bại: {claimSync.error}</div></div>;
    }
    if (claimSync.status === 'attention') {
      const { result } = claimSync;
      const dupes = result.skippedDuplicates.map((d) => `${d.empCode} (${d.emails.join(', ')})`).join('; ');
      return (
        <div className="banner warn mb-4">
          <div>
            Đã tự đồng bộ mã NV: tạo {result.created}, giữ {result.kept}. Còn {result.skippedDuplicates.length} mã trùng cần xóa bớt registration trước khi hệ thống tạo khóa: {dupes || 'không có'}.
          </div>
        </div>
      );
    }
    return null;
  })();

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
          <span className="text-sm text-muted">{filtered.length}/{regsTotal} đăng ký</span>
          {claimSync.status === 'ok' && <span className="text-sm text-muted">Mã NV đã tự đồng bộ</span>}
          <button type="button" className="btn sm" onClick={() => downloadRegistrationsCsv(regs, slots)}>⬇ Xuất CSV ({regs.length})</button>
        </div>
      )}
      {claimSyncBanner}
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
      {hasMoreRegs && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--s-4)' }}>
          <button type="button" className="btn sm" disabled={regsLoadingMore} onClick={onLoadMore}>
            {regsLoadingMore ? 'Đang tải...' : `Tải thêm (${regs.length}/${regsTotal})`}
          </button>
        </div>
      )}
    </div>
  );
}

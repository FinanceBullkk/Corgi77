import { useMemo, useState } from 'react';
import { deleteIneligibility, INELIGIBILITY_REASON_PRESETS, upsertIneligibility, type IneligibilityEntry } from '../lib/adminDb';
import { useConfirm, useToast } from '../confirm-toast-provider';
import { SearchIcon } from './admin-icons';
import { RowMenu, Drawer } from './admin-chrome';

// ── Ineligibility (Danh sách chặn) ────────────────────────────────────────────

function splitReason(reason: string): { vn: string; en: string } {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(reason.trim());
  if (m && m[2]) return { vn: m[1].trim(), en: m[2].trim() };
  return { vn: reason, en: '' };
}

export function IneligibilityTab({
  adminEmail, inelig, onReload,
}: { adminEmail: string; inelig: IneligibilityEntry[]; onReload: () => void }) {
  const [q, setQ] = useState('');
  const [drawer, setDrawer] = useState<{ editing: IneligibilityEntry | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const confirm = useConfirm();
  const toast = useToast();

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
    const ok = await confirm({
      title: 'Gỡ khỏi danh sách chặn?',
      message: `Gỡ mã NV "${empCode}" khỏi danh sách chặn?\n(Người này sẽ được phép đăng ký lại.)`,
      confirmText: 'Gỡ chặn',
    });
    if (!ok) return;
    setBusy(empCode);
    try { await deleteIneligibility(adminEmail, empCode); toast('success', `Đã gỡ chặn ${empCode}.`); onReload(); }
    catch (e) { toast('error', (e as Error).message); } finally { setBusy(null); }
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
  const toast = useToast();

  const empCodeValid = /^\d{6}$/.test(empCode.trim());
  const effectiveReason = reasonPreset === '__custom__' ? reasonCustom.trim() : reasonPreset;

  const save = async () => {
    if (!empCodeValid) { toast('error', 'Mã NV phải là 6 chữ số.'); return; }
    if (!effectiveReason) { toast('error', 'Vui lòng chọn hoặc nhập lý do.'); return; }
    setBusy(true);
    try {
      await upsertIneligibility(adminEmail, empCode.trim(), {
        reason: effectiveReason,
        email: email.trim() || undefined,
        fullName: fullName.trim() || undefined,
      });
      toast('success', isEdit ? `Đã cập nhật ${empCode.trim()}.` : `Đã chặn ${empCode.trim()}.`);
      onSaved();
    } catch (e) { toast('error', (e as Error).message); } finally { setBusy(false); }
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

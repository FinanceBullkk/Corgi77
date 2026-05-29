import { useEffect, useState } from 'react';
import { formatDateVi, minToHHmm, type Slot, type SlotType } from '../lib/types';
import { adminCreateSlot, adminDeleteSlot, generateSlotId, listRegistrationsForSlot, updateSlot, type Registration } from '../lib/adminDb';
import { useToast } from '../confirm-toast-provider';
import { typClass, dowVi, addMin, parseTime } from './admin-utils';
import { Drawer } from './admin-chrome';

export function SlotDrawer({
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
  const toast = useToast();

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
    if (!cap || cap <= 0) { toast('error', 'Sức chứa phải > 0'); return; }
    const startMin = parseTime(start), endMin = parseTime(end);
    setBusy(true);
    try {
      if (locked) {
        // Has registrations → only capacity/room can change.
        if (cap < used) { toast('error', `Không thể giảm xuống ${cap} vì đã có ${used} người đăng ký.`); setBusy(false); return; }
        await updateSlot(adminEmail, slot!.slotId, { capacity: cap, remaining: cap - used, location: location.trim() });
      } else {
        if (!date) { toast('error', 'Chọn ngày'); setBusy(false); return; }
        if (startMin >= endMin) { toast('error', 'Giờ bắt đầu phải trước giờ kết thúc'); setBusy(false); return; }
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
      toast('success', isEdit ? 'Đã lưu thay đổi ca thi.' : 'Đã tạo ca thi mới.');
      onSaved();
    } catch (e) { toast('error', (e as Error).message); } finally { setBusy(false); }
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

export function SlotRegsDrawer({ slot, onClose }: { slot: Slot; onClose: () => void }) {
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

import { useEffect, useRef, useState } from 'react';
import { SlotCard } from './slot-card';
import { dayHeader, daysUntil } from './booking-utils';
import { minToHHmm, type Slot, type MyBooking, type InitResult } from '../lib/types';
import { useConfirm } from '../confirm-toast-provider';
import { cancelDb } from '../lib/db';

// ─── Booking Display ──────────────────────────────────────────────────────

export function BookingDisplay({
  email,
  booking,
  slots,
  deadlinePassed,
  allowEnrollment,
  maxChanges,
  onEdit,
  onCancelled,
  onError,
}: {
  email: string;
  booking: MyBooking;
  slots: Slot[];
  deadlinePassed: boolean;
  allowEnrollment: boolean;
  maxChanges: number;
  onEdit: () => void;
  onCancelled: (state: InitResult) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();

  const sp = slots.find((s) => s.slotId === booking.speakingSlotId);
  const sk = slots.find((s) => s.slotId === booking.skillsSlotId);
  const ordered = ([sp, sk].filter(Boolean) as Slot[]).sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.startMin - b.startMin,
  );
  const first = ordered[0];
  const countdown = first ? daysUntil(first.date) : 0;
  const changesLeft = Math.max(0, maxChanges - booking.changeCount);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  async function handleCancel() {
    const ok = await confirm({
      title: 'Hủy đăng ký?',
      message: 'Hủy đăng ký 2 ca thi của bạn? Bạn có thể đăng ký lại trước hạn.',
      confirmText: 'Hủy đăng ký',
      cancelText: 'Giữ lại',
      danger: true,
    });
    if (!ok) return;
    setMenuOpen(false);
    setBusy(true);
    try {
      const res = await cancelDb(email);
      if (!res.ok) onError(res.error || 'Hủy thất bại.');
      else if (res.state) onCancelled(res.state);
      else onError('Đã hủy nhưng không nhận được state mới. Vui lòng tải lại.');
    } catch (e) {
      onError((e as Error).message || 'Hủy thất bại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 'var(--s-4)',
        }}
      >
        <h1 style={{ fontSize: 'var(--fs-xl)' }}>Lịch thi của bạn</h1>
        <span className="pill success">✓ Đã đăng ký</span>
      </div>

      {first && (
        <div className="countdown mb-4">
          <div className="meta">
            <div className="lbl">Còn đến ca thi gần nhất</div>
            <div className="when">
              {first.type === 'Speaking' ? 'Speaking' : '3 Skills'} ·{' '}
              {dayHeader(first.date).label} · {minToHHmm(first.startMin)}
            </div>
          </div>
          <div className="big">
            <div className="n">{countdown}</div>
            <div className="u">ngày</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-hd">
          <div className="sec-title" style={{ marginBottom: 'var(--s-1)' }}>
            <span className="dot"><svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><circle cx="5" cy="3.2" r="2"/><path d="M1 9c0-2.2 1.8-3.8 4-3.8s4 1.6 4 3.8"/></svg></span>Học viên
          </div>
          <div className="text-sm">
            <b>{booking.fullName}</b> · {booking.empCode} · {booking.bu}
          </div>
        </div>
        <div className="card-bd">
          <div className="sec-title">
            <span className="dot accent"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><rect x="1" y="1.5" width="8" height="7.5" rx="1.2"/><line x1="3" y1="0.5" x2="3" y2="2.5"/><line x1="7" y1="0.5" x2="7" y2="2.5"/><line x1="1" y1="4" x2="9" y2="4"/></svg></span>2 ca thi
          </div>
          <div className="col" style={{ gap: 'var(--s-3)' }}>
            {ordered.map((slot, i) => (
              <SlotCard key={slot.slotId} slot={slot} index={i + 1} />
            ))}
            {!sp && booking.speakingSlotId && (
              <div className="bk-slot">
                <div className="num" style={{ background: 'var(--danger-50)', color: 'var(--danger-600)' }}>!</div>
                <div className="body">
                  <div className="type-lbl" style={{ color: 'var(--danger-600)' }}>Speaking</div>
                  <div className="when" style={{ color: 'var(--danger-600)', fontSize: 'var(--fs-sm)' }}>
                    {booking.speakingSlotId} — slot đã bị xóa, liên hệ BTC
                  </div>
                </div>
              </div>
            )}
            {!sk && booking.skillsSlotId && (
              <div className="bk-slot">
                <div className="num" style={{ background: 'var(--danger-50)', color: 'var(--danger-600)' }}>!</div>
                <div className="body">
                  <div className="type-lbl" style={{ color: 'var(--danger-600)' }}>3 Skills</div>
                  <div className="when" style={{ color: 'var(--danger-600)', fontSize: 'var(--fs-sm)' }}>
                    {booking.skillsSlotId} — slot đã bị xóa, liên hệ BTC
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="card-ft">
          {booking.createdAt && (
            <span>
              Đăng ký:{' '}
              <b style={{ color: 'var(--ink-700)' }}>
                {new Date(booking.createdAt).toLocaleString('vi-VN')}
              </b>
            </span>
          )}
          <span>
            Còn <b style={{ color: 'var(--ink-900)' }}>{changesLeft}/{maxChanges}</b> lần đổi ca
          </span>
        </div>
      </div>

      {!deadlinePassed && allowEnrollment && (
        <div className="bk-actions">
          <button
            className={`btn ${changesLeft <= 0 ? 'disabled' : ''}`}
            onClick={onEdit}
            disabled={busy || changesLeft <= 0}
            title={changesLeft <= 0 ? 'Bạn đã hết lượt đổi ca' : undefined}
          >
            ↻ Đổi ca thi
          </button>
          <div className="menu-wrap" ref={menuRef}>
            <button
              className="btn ghost"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="true"
              aria-expanded={menuOpen}
              disabled={busy}
            >
              ⋮ Tùy chọn
            </button>
            {menuOpen && (
              <div className="menu" role="menu">
                <button
                  className="menu-item danger"
                  role="menuitem"
                  onClick={handleCancel}
                  disabled={busy}
                >
                  🗑 Hủy đăng ký
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

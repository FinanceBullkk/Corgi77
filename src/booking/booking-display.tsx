import { useEffect, useRef, useState } from 'react';
import { daysUntil } from './booking-utils';
import { type Slot, type MyBooking, type InitResult } from '../lib/types';
import { useConfirm } from '../confirm-toast-provider';
import { cancelDb } from '../lib/db';
import { addBookingToGoogleCalendar } from '../lib/google-calendar';
import { DeletedSlotRow, SessionRow } from './session-row';

export function BookingDisplay({
  email,
  booking,
  slots,
  deadlinePassed,
  allowEnrollment,
  maxChanges,
  assessmentName,
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
  assessmentName: string;
  onEdit: () => void;
  onCancelled: (state: InitResult) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);
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
  const canManage = !deadlinePassed && allowEnrollment;

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

  async function handleAddToGoogleCalendar() {
    if (!sp || !sk) return;
    setCalendarBusy(true);
    setCalendarStatus(null);
    try {
      await addBookingToGoogleCalendar({
        empCode: booking.empCode,
        sp,
        sk,
        sequence: booking.changeCount,
        assessmentName,
      });
      setCalendarStatus({ kind: 'success', text: 'Đã thêm/cập nhật 2 ca thi trong Google Calendar.' });
    } catch (err) {
      setCalendarStatus({
        kind: 'danger',
        text: (err as Error).message || 'Không thêm được vào Google Calendar. Vui lòng thử lại.',
      });
    } finally {
      setCalendarBusy(false);
    }
  }

  return (
    <>
      <div className="r-head">
        <div>
          <h1>Lịch thi của bạn</h1>
          <p>Xem thông tin đăng ký, đổi ca hoặc hủy đăng ký trước hạn.</p>
        </div>
        <span className="pill success">✓ Đã đăng ký</span>
      </div>

      <div className="r-id">
        <span className="r-av">{email.split('@')[0].slice(0, 2).toUpperCase()}</span>
        <div className="r-id-main">
          <div className="r-id-name">
            {booking.fullName} <span className="muted">· {booking.empCode} · {booking.bu}</span>
          </div>
          <div className="r-id-sub">
            {email}
            {booking.createdAt && (
              <>&nbsp;&nbsp;·&nbsp;&nbsp;Đăng ký {new Date(booking.createdAt).toLocaleString('vi-VN')}</>
            )}
          </div>
        </div>
      </div>

      <div className="r-sessions">
        <div className="r-sess-head">
          <span className="t">Ca thi đã đăng ký</span>
          <span className="c">· {ordered.length} ca</span>
        </div>
        <div className="r-list">
          {ordered.map((slot) => (
            <SessionRow
              key={slot.slotId}
              slot={slot}
              isNext={slot.slotId === first?.slotId}
              countdown={countdown}
            />
          ))}
          {!sp && booking.speakingSlotId && <DeletedSlotRow label="Speaking" slotId={booking.speakingSlotId} />}
          {!sk && booking.skillsSlotId && <DeletedSlotRow label="3 Skills" slotId={booking.skillsSlotId} />}
        </div>
      </div>

      <div className="r-actions">
        <span className="r-note">
          {canManage
            ? changesLeft > 0
              ? <>Còn <b>{changesLeft}/{maxChanges}</b> lần đổi ca trước hạn</>
              : 'Bạn đã hết lượt đổi ca'
            : deadlinePassed
              ? 'Đã đóng đăng ký'
              : ''}
        </span>
        <div className="r-act-btns">
          {sp && sk && (
            <button
              className="btn subtle"
              onClick={handleAddToGoogleCalendar}
              disabled={calendarBusy}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {calendarBusy ? 'Đang thêm...' : 'Thêm vào Google Calendar'}
            </button>
          )}
          {canManage && (
            <>
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
                  className="btn ghost icon"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-haspopup="true"
                  aria-expanded={menuOpen}
                  aria-label="Tùy chọn"
                  disabled={busy}
                >
                  ⋮
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
            </>
          )}
        </div>
      </div>

      {calendarStatus && (
        <div className={`banner ${calendarStatus.kind} mt-4`} role="status" aria-live="polite">
          <span className="banner-icon">{calendarStatus.kind === 'success' ? '✓' : '!'}</span>
          <div>{calendarStatus.text}</div>
        </div>
      )}
    </>
  );
}

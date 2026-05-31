import { useState } from 'react';
import { daysUntil, type Step1Data, type Selection } from './booking-utils';
import { type Slot } from '../lib/types';
import { addBookingToGoogleCalendar } from '../lib/google-calendar';
import { SessionRow } from './session-row';

export function SuccessScreen({
  email,
  emailSent,
  step1,
  slots,
  selection,
  maxChanges,
  changeCount,
  assessmentName,
  onViewDetail,
}: {
  email: string;
  emailSent: boolean;
  step1: Step1Data;
  slots: Slot[];
  selection: Selection;
  maxChanges: number;
  changeCount: number;
  assessmentName: string;
  onViewDetail: () => void;
}) {
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);
  const sp = slots.find((s) => s.slotId === selection.speakingId);
  const sk = slots.find((s) => s.slotId === selection.skillsId);
  const ordered = ([sp, sk].filter(Boolean) as Slot[]).sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.startMin - b.startMin,
  );
  const first = ordered[0];
  const countdown = first ? daysUntil(first.date) : 0;
  const changesLeft = Math.max(0, maxChanges - changeCount);

  async function handleAddToGoogleCalendar() {
    if (!sp || !sk) return;
    setCalendarBusy(true);
    setCalendarStatus(null);
    try {
      await addBookingToGoogleCalendar({
        empCode: step1.empCode,
        sp,
        sk,
        sequence: changeCount,
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
      <div className="success-hero">
        <div className="success-check">✓</div>
        <h1 className="success-title">Đăng ký thành công!</h1>
        <p className="success-sub">
          {step1.fullName} · {step1.empCode}
        </p>
      </div>

      {emailSent && (
        <div className="banner info mb-5" role="status" aria-live="polite">
          <span className="banner-icon">✉</span>
          <div>Email xác nhận đang được gửi đến <b>{email}</b>.</div>
        </div>
      )}

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
        </div>
      </div>

      <div className="r-actions">
        <span className="r-note">
          Còn <b>{changesLeft}/{maxChanges}</b> lần đổi ca trước hạn
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
          <button className="btn" onClick={onViewDetail}>
            Quản lý đăng ký →
          </button>
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

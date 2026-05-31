import { SlotCard } from './slot-card';
import { dayHeader, daysUntil, type Step1Data, type Selection } from './booking-utils';
import { minToHHmm, type Slot } from '../lib/types';
import { downloadBookingIcs } from '../lib/ics';

// ─── Success Screen ───────────────────────────────────────────────────────

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
  const sp = slots.find((s) => s.slotId === selection.speakingId);
  const sk = slots.find((s) => s.slotId === selection.skillsId);
  const ordered = ([sp, sk].filter(Boolean) as Slot[]).sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.startMin - b.startMin,
  );
  const first = ordered[0];
  const countdown = first ? daysUntil(first.date) : 0;
  const changesLeft = Math.max(0, maxChanges - changeCount);

  return (
    <>
      <div className="success-hero">
        <div className="success-check">✓</div>
        <h1 className="success-title">Đăng ký thành công!</h1>
        <p className="success-sub">
          {step1.fullName} · {step1.empCode}
        </p>
      </div>

      {first && (
        <div className="countdown">
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
          <div className="card-title">Lịch thi của bạn</div>
          {emailSent && (
            <div className="card-sub">
              Email xác nhận đang được gửi đến <b>{email}</b>.
            </div>
          )}
        </div>
        <div className="card-bd">
          <div className="col" style={{ gap: 'var(--s-3)' }}>
            {ordered.map((slot, i) => (
              <SlotCard key={slot.slotId} slot={slot} index={i + 1} />
            ))}
          </div>
        </div>
        <div className="card-ft">
          <span>
            Còn <b style={{ color: 'var(--ink-900)' }}>{changesLeft}/{maxChanges}</b> lần đổi ca
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {sp && sk && (
              <button
                className="btn sm"
                onClick={() => downloadBookingIcs({
                  empCode: step1.empCode,
                  sp,
                  sk,
                  sequence: changeCount,
                  assessmentName,
                })}
              >
                📅 Thêm 2 ca thi vào lịch
              </button>
            )}
            <button className="btn ghost sm" onClick={onViewDetail}>
              Xem chi tiết →
            </button>
          </div>
        </div>
      </div>

      <div className="banner info mt-4">
        <span className="banner-icon">📨</span>
        <div>
          <b>Lưu ý:</b> Mang theo CCCD/Thẻ NV khi tới phòng thi. Reminder sẽ gửi trước ngày thi 7
          / 3 / 1 ngày.
        </div>
      </div>
    </>
  );
}

import { dayHeader } from './booking-utils';
import { minToHHmm, type Slot } from '../lib/types';

function railParts(date: string) {
  const { abbr, label } = dayHeader(date);
  const [day, mm] = label.split('/');
  return { dow: abbr, day, mon: `Th ${parseInt(mm, 10)}` };
}

export function SessionRow({
  slot,
  isNext = false,
  countdown = 0,
}: {
  slot: Slot;
  isNext?: boolean;
  countdown?: number;
}) {
  const isSp = slot.type === 'Speaking';
  const { dow, day, mon } = railParts(slot.date);

  return (
    <div className={`r-sess ${isSp ? 'sp' : 'sk'}`}>
      <div className="r-rail">
        <div className="dow">{dow}</div>
        <div className="num">{day}</div>
        <div className="mon">{mon}</div>
      </div>
      <div className="r-body">
        <div className="r-body-top">
          <span className="r-type">{isSp ? 'Speaking' : '3 Skills'}</span>
          <span className="r-dur">· {isSp ? '60' : '150'} phút</span>
          {isNext && countdown > 0 && (
            <span className="r-next"><span className="d">Còn {countdown} ngày</span></span>
          )}
        </div>
        <div className="r-time">
          {minToHHmm(slot.startMin)}<span className="dash">-</span>{minToHHmm(slot.endMin)}
        </div>
        {slot.location && <div className="r-where">📍 {slot.location}</div>}
      </div>
    </div>
  );
}

export function DeletedSlotRow({ label, slotId }: { label: string; slotId: string }) {
  return (
    <div className="bk-slot">
      <div className="num" style={{ background: 'var(--danger-50)', color: 'var(--danger-600)' }}>!</div>
      <div className="body">
        <div className="type-lbl" style={{ color: 'var(--danger-600)' }}>{label}</div>
        <div className="when" style={{ color: 'var(--danger-600)', fontSize: 'var(--fs-sm)' }}>
          {slotId} - slot đã bị xóa, liên hệ BTC
        </div>
      </div>
    </div>
  );
}

import { minToHHmm, type Slot } from '../lib/types';
import { dayHeader } from './booking-utils';

export function SlotCard({ slot, index }: { slot: Slot; index: number }) {
  const isSp = slot.type === 'Speaking';
  const { label: dateLabel } = dayHeader(slot.date);
  return (
    <div className={`bk-slot ${isSp ? '' : 'sk'}`}>
      <div className="num">{index}</div>
      <div className="body">
        <div className="type-lbl">{isSp ? 'Speaking · 60 phút' : '3 Skills · 150 phút'}</div>
        <div className="when">
          {dateLabel} · {minToHHmm(slot.startMin)}–{minToHHmm(slot.endMin)}
        </div>
        {slot.location && <div className="where">📍 {slot.location}</div>}
      </div>
    </div>
  );
}

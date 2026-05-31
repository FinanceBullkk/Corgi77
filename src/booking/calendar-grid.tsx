import type { Dispatch, SetStateAction } from 'react';
import { minToHHmm, type Slot } from '../lib/types';
import {
  dayHeader,
  ROW_H,
  slotAriaLabel,
  slotSt,
  weekRangeLabel,
} from './booking-utils';

interface CalendarGridProps {
  activeType: Slot['type'];
  setActiveType: Dispatch<SetStateAction<Slot['type']>>;
  tone: 'sp' | 'sk';
  dates: string[];
  hours: number[];
  firstHour: number;
  activeSlots: Slot[];
  activeAvail: number;
  lockedOther: Slot | null;
  byDate: Record<string, Slot[]>;
  spSel: Slot | null;
  skSel: Slot | null;
  curSpId: string | null;
  curSkId: string | null;
  deadlinePassed: boolean;
  onClickSlot: (slot: Slot) => void;
}

export function CalendarGrid({
  activeType,
  setActiveType,
  tone,
  dates,
  hours,
  firstHour,
  activeSlots,
  activeAvail,
  lockedOther,
  byDate,
  spSel,
  skSel,
  curSpId,
  curSkId,
  deadlinePassed,
  onClickSlot,
}: CalendarGridProps) {
  return (
    <>
      <div className={`cal-wrap tone-${tone}`} role="region" aria-label={`Lịch ca ${activeType}`}>
        <div className="cal-toolbar">
          <div className="week-nav">
            <button className="iconbtn" disabled aria-label="Tuần trước">‹</button>
            <span className="week-label">{weekRangeLabel(dates)}</span>
            <button className="iconbtn" disabled aria-label="Tuần sau">›</button>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="text-xs text-muted">
              Đang xem{' '}
              <b style={{ color: activeType === 'Speaking' ? 'var(--brand-700)' : 'var(--accent-700)' }}>{activeType}</b>{' '}
              · {activeAvail} ca còn chỗ · {activeSlots.length} tổng
            </span>
            {lockedOther && (
              <span className="locked-chip">
                ✓ {lockedOther.type} đã chọn: {dayHeader(lockedOther.date).label} · {minToHHmm(lockedOther.startMin)}
              </span>
            )}
          </div>
        </div>

        {dates.length === 0 ? (
          <div className="cal-empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <p className="ces-title">Chưa có ca thi nào</p>
            <p className="ces-body">Lịch thi chưa được mở. Vui lòng liên hệ Ban tổ chức hoặc thử tải lại.</p>
            <button className="btn ghost" style={{ marginTop: 'var(--s-4)' }} onClick={() => window.location.reload()}>
              ↺ Tải lại
            </button>
          </div>
        ) : (
          <div className="cal">
            <div
              className="cal-header"
              style={{ gridTemplateColumns: `var(--gutter) repeat(${dates.length}, 1fr)` }}
            >
              <div className="cal-corner" />
              {dates.map((date) => {
                const { abbr, label } = dayHeader(date);
                return (
                  <div key={date} className="cal-dayhead">
                    <span className="dh-day">{abbr}</span>
                    <span className="dh-date">{label}</span>
                  </div>
                );
              })}
            </div>

            {activeSlots.length === 0 ? (
              <div className="cal-type-empty">
                <p>Không có ca <b>{activeType}</b> nào trong lịch thi.</p>
                <button
                  className="btn-link"
                  onClick={() => setActiveType(activeType === 'Speaking' ? '3 Skills' : 'Speaking')}
                >
                  Chuyển sang tab <b>{activeType === 'Speaking' ? '3 Skills' : 'Speaking'}</b> →
                </button>
              </div>
            ) : (
              <div
                className="cal-body"
                style={{
                  gridTemplateColumns: `var(--gutter) repeat(${dates.length}, 1fr)`,
                  height: hours.length * ROW_H,
                }}
              >
                <div className="cal-gutter">
                  {hours.map((h, i) => (
                    <span
                      key={h}
                      className={`cal-hourlabel${i === 0 ? ' first' : ''}`}
                      style={{ top: i * ROW_H }}
                    >
                      {String(h).padStart(2, '0')}:00
                    </span>
                  ))}
                </div>

                {dates.map((date) => (
                  <DayColumn
                    key={date}
                    date={date}
                    firstHour={firstHour}
                    lockedOther={lockedOther}
                    slots={byDate[date] ?? []}
                    spSel={spSel}
                    skSel={skSel}
                    curSpId={curSpId}
                    curSkId={curSkId}
                    deadlinePassed={deadlinePassed}
                    onClickSlot={onClickSlot}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-muted mt-3">
        💡 <b>Mẹo:</b> Chọn xong một ca sẽ tự nhảy sang tab còn lại. Block nét đứt là ca bạn đã chọn ở
        tab kia; block gạch chéo là trùng giờ.
      </p>
    </>
  );
}

function DayColumn({
  date,
  firstHour,
  lockedOther,
  slots,
  spSel,
  skSel,
  curSpId,
  curSkId,
  deadlinePassed,
  onClickSlot,
}: {
  date: string;
  firstHour: number;
  lockedOther: Slot | null;
  slots: Slot[];
  spSel: Slot | null;
  skSel: Slot | null;
  curSpId: string | null;
  curSkId: string | null;
  deadlinePassed: boolean;
  onClickSlot: (slot: Slot) => void;
}) {
  const showLocked = !!lockedOther && lockedOther.date === date;
  return (
    <div className="cal-col">
      {showLocked && lockedOther && (
        <div
          className={`ev ghost ${lockedOther.type === 'Speaking' ? 'sp' : 'sk'}`}
          style={{
            top: ((lockedOther.startMin - firstHour * 60) / 60) * ROW_H + 2,
            height: ((lockedOther.endMin - lockedOther.startMin) / 60) * ROW_H - 4,
          }}
          aria-hidden="true"
        >
          <div className="ev-time">
            {minToHHmm(lockedOther.startMin)}–{minToHHmm(lockedOther.endMin)}
          </div>
          <div className="ev-meta">
            <span className="ev-room">{lockedOther.type} · đã chọn</span>
          </div>
        </div>
      )}
      {slots.map((slot) => (
        <SlotButton
          key={slot.slotId}
          slot={slot}
          firstHour={firstHour}
          spSel={spSel}
          skSel={skSel}
          curSpId={curSpId}
          curSkId={curSkId}
          deadlinePassed={deadlinePassed}
          onClickSlot={onClickSlot}
        />
      ))}
    </div>
  );
}

function SlotButton({
  slot,
  firstHour,
  spSel,
  skSel,
  curSpId,
  curSkId,
  deadlinePassed,
  onClickSlot,
}: {
  slot: Slot;
  firstHour: number;
  spSel: Slot | null;
  skSel: Slot | null;
  curSpId: string | null;
  curSkId: string | null;
  deadlinePassed: boolean;
  onClickSlot: (slot: Slot) => void;
}) {
  const st = slotSt(slot, spSel, skSel, curSpId, curSkId);
  const topPx = ((slot.startMin - firstHour * 60) / 60) * ROW_H + 2;
  const heightPx = ((slot.endMin - slot.startMin) / 60) * ROW_H - 4;
  const isSp = slot.type === 'Speaking';
  const low = st === 'ok' && slot.capacity > 0 && slot.remaining / slot.capacity <= 0.3;

  return (
    <button
      className={['ev', isSp ? 'sp' : 'sk', st === 'sel' ? 'sel' : '', st === 'full' ? 'full' : '', st === 'conflict' ? 'conflict' : '']
        .filter(Boolean)
        .join(' ')}
      style={{ top: topPx, height: heightPx }}
      onClick={() => onClickSlot(slot)}
      disabled={st === 'full' || st === 'conflict' || deadlinePassed}
      aria-label={slotAriaLabel(slot, st, deadlinePassed)}
    >
      <div className="ev-time">
        {minToHHmm(slot.startMin)}–{minToHHmm(slot.endMin)}
      </div>
      <div className="ev-meta">
        <span className="ev-room">{slot.location.split(' · ')[0]}</span>
        {st === 'conflict' ? (
          <span className="ev-rem">Trùng giờ</span>
        ) : st === 'full' ? (
          <span className="ev-rem">Hết chỗ</span>
        ) : (
          <span className={`ev-rem ${low ? 'warn' : ''}`}>Còn {slot.remaining}</span>
        )}
      </div>
    </button>
  );
}

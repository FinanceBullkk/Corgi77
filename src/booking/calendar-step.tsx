import { useMemo, useRef, useState } from 'react';
import { Stepper } from './booking-chrome';
import { TypeTab } from './type-tab';
import { minToHHmm, type Slot } from '../lib/types';
import {
  uniqueSortedDates,
  slotSt,
  slotAriaLabel,
  dayHeader,
  weekRangeLabel,
  ROW_H,
  type Step1Data,
  type Selection,
} from './booking-utils';

// ─── Step 2 · Calendar ────────────────────────────────────────────────────

export function CalendarStep({
  step1,
  slots,
  selection,
  setSelection,
  curSpId,
  curSkId,
  deadlinePassed,
  onBack,
}: {
  step1: Step1Data;
  slots: Slot[];
  selection: Selection;
  setSelection: React.Dispatch<React.SetStateAction<Selection>>;
  curSpId: string | null;
  curSkId: string | null;
  deadlinePassed: boolean;
  onBack: () => void;
}) {
  const dates = useMemo(() => uniqueSortedDates(slots), [slots]);
  const spSel = slots.find((s) => s.slotId === selection.speakingId) ?? null;
  const skSel = slots.find((s) => s.slotId === selection.skillsId) ?? null;

  // Which type is the user currently picking? Default to whichever is still unfilled.
  const [activeType, setActiveType] = useState<Slot['type']>(() =>
    selection.speakingId && !selection.skillsId ? '3 Skills' : 'Speaking',
  );
  const [flashMsg, setFlashMsg] = useState<string | null>(null);
  const [flashPulse, setFlashPulse] = useState<'sp' | 'sk' | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const tone = activeType === 'Speaking' ? 'sp' : 'sk';
  // The OTHER type's selection — drawn as a dashed "locked" ghost on the active calendar.
  const lockedOther = activeType === 'Speaking' ? skSel : spSel;

  // Hour range spans ALL slots so the grid height stays stable when switching tabs.
  const startMins = slots.map((s) => s.startMin);
  const endMins = slots.map((s) => s.endMin);
  const firstHour = startMins.length ? Math.floor(Math.min(...startMins) / 60) : 8;
  const lastHour = endMins.length ? Math.ceil(Math.max(...endMins) / 60) : 18;
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);

  const byDate = useMemo(() => {
    const m: Record<string, Slot[]> = {};
    dates.forEach((d) => { m[d] = slots.filter((s) => s.date === d && s.type === activeType); });
    return m;
  }, [slots, dates, activeType]);

  function onClickSlot(slot: Slot) {
    const st = slotSt(slot, spSel, skSel, curSpId, curSkId);
    if (st === 'full' || st === 'conflict' || deadlinePassed) return;
    const isPicking =
      (slot.type === 'Speaking' ? selection.speakingId : selection.skillsId) !== slot.slotId;
    if (slot.type === 'Speaking') {
      setSelection((sel) => ({ ...sel, speakingId: sel.speakingId === slot.slotId ? null : slot.slotId }));
    } else {
      setSelection((sel) => ({ ...sel, skillsId: sel.skillsId === slot.slotId ? null : slot.slotId }));
    }
    // After picking a type, auto-switch to the other tab if it is still empty.
    if (isPicking) {
      const otherPicked = slot.type === 'Speaking' ? !!selection.skillsId : !!selection.speakingId;
      if (!otherPicked) {
        const doneLabel = slot.type === 'Speaking' ? 'Speaking' : '3 Skills';
        const nextLabel = slot.type === 'Speaking' ? '3 Skills' : 'Speaking';
        const pulseSide: 'sp' | 'sk' = slot.type === 'Speaking' ? 'sp' : 'sk';
        // Show flash message and pulse on completed tab
        setFlashMsg(`Đã chọn ${doneLabel} ✓ — giờ chọn ${nextLabel}`);
        setFlashPulse(pulseSide);
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = setTimeout(() => { setFlashMsg(null); setFlashPulse(null); }, 2500);
        setTimeout(() => setActiveType(slot.type === 'Speaking' ? '3 Skills' : 'Speaking'), 300);
      }
    }
  }

  const initials = step1.fullName.trim().slice(0, 2).toUpperCase() || '??';
  const activeSlots = slots.filter((s) => s.type === activeType);
  const activeAvail = activeSlots.filter((s) => s.remaining > 0).length;

  return (
    <>
      <Stepper current={2} />

      <div className="profile-row">
        <div className="info">
          <span className="avatar">{initials}</span>
          <b>{step1.fullName}</b>
          <span className="info-sep" />
          <span>Mã NV: <b>{step1.empCode}</b></span>
          <span className="info-sep" />
          <span>BU: <b>{step1.bu}</b></span>
        </div>
        <button className="btn-link" onClick={onBack}>← Sửa thông tin</button>
      </div>

      <div className="mb-3">
        <h1 style={{ fontSize: 'var(--fs-xl)', letterSpacing: '-.02em' }}>Chọn 2 ca thi của bạn</h1>
        <p className="text-sm text-muted mt-1">
          Chọn lần lượt <b style={{ color: 'var(--brand-700)' }}>1 ca Speaking</b> và{' '}
          <b style={{ color: 'var(--accent-700)' }}>1 ca 3 Skills</b>. Hệ thống tự khoá ca trùng giờ với lựa chọn của bạn.
        </p>
      </div>

      {flashMsg && (
        <div className="flash-msg" role="status" aria-live="polite">
          {flashMsg}
        </div>
      )}
      <div className="type-tabs">
        <TypeTab
          tone="sp"
          num="1"
          active={activeType === 'Speaking'}
          picked={!!spSel}
          label="Speaking"
          duration="60 phút"
          statusText={spSel ? `${dayHeader(spSel.date).label} · ${minToHHmm(spSel.startMin)}–${minToHHmm(spSel.endMin)}` : 'Click chọn ca'}
          onClick={() => setActiveType('Speaking')}
          pulse={flashPulse === 'sp'}
        />
        <TypeTab
          tone="sk"
          num="2"
          active={activeType === '3 Skills'}
          picked={!!skSel}
          label="3 Skills"
          duration="150 phút"
          statusText={skSel ? `${dayHeader(skSel.date).label} · ${minToHHmm(skSel.startMin)}–${minToHHmm(skSel.endMin)}` : 'Click chọn ca'}
          onClick={() => setActiveType('3 Skills')}
          pulse={flashPulse === 'sk'}
        />
      </div>

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

        {/* F16 — No slots at all */}
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
            {/* Header · sticky day labels */}
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

            {/* F16 — No slots of active type (other type may have slots) */}
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
              /* Body · gutter + full-height day columns (blocks positioned by minute) */
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

                {dates.map((date) => {
                  const showLocked = !!lockedOther && lockedOther.date === date;
                  return (
                    <div key={date} className="cal-col">
                      {showLocked && lockedOther && (
                        /* F17 — ghost is purely decorative; screen readers skip it */
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
                      {(byDate[date] ?? []).map((slot) => {
                        const st = slotSt(slot, spSel, skSel, curSpId, curSkId);
                        const topPx = ((slot.startMin - firstHour * 60) / 60) * ROW_H + 2;
                        const heightPx = ((slot.endMin - slot.startMin) / 60) * ROW_H - 4;
                        const isSp = slot.type === 'Speaking';
                        const low =
                          st === 'ok' && slot.capacity > 0 && slot.remaining / slot.capacity <= 0.3;
                        return (
                          <button
                            key={slot.slotId}
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
                      })}
                    </div>
                  );
                })}
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

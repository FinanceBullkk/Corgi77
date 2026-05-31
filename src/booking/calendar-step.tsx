import { useMemo, useRef, useState } from 'react';
import { Stepper } from './booking-chrome';
import { CalendarGrid } from './calendar-grid';
import { TypeTab } from './type-tab';
import { minToHHmm, type Slot } from '../lib/types';
import {
  uniqueSortedDates,
  slotSt,
  dayHeader,
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

      <CalendarGrid
        activeType={activeType}
        setActiveType={setActiveType}
        tone={tone}
        dates={dates}
        hours={hours}
        firstHour={firstHour}
        activeSlots={activeSlots}
        activeAvail={activeAvail}
        lockedOther={lockedOther}
        byDate={byDate}
        spSel={spSel}
        skSel={skSel}
        curSpId={curSpId}
        curSkId={curSkId}
        deadlinePassed={deadlinePassed}
        onClickSlot={onClickSlot}
      />
    </>
  );
}

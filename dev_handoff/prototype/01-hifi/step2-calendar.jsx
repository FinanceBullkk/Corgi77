// ─────────────────────────────────────────────────────────────────────────
// Step 2 · Calendar Week View — Tabbed (Option A)
// One type at a time · full-width blocks · ghost shows OTHER type's selection
// ─────────────────────────────────────────────────────────────────────────

const ROW_H = 56;          // px per hour row · keep in sync with CSS --row-h
const FIRST_HOUR = 9;      // grid starts at 09:00

function CalendarStep({ user, deadline, selection, setSelection, onBack, onContinue, onLogout, onHome }) {
  const spSel = selection.spId ? slotById(selection.spId) : null;
  const skSel = selection.skId ? slotById(selection.skId) : null;

  // Which type is the user currently picking? Default to whichever is unfilled.
  const [activeType, setActiveType] = useState(() =>
    selection.spId && !selection.skId ? 'sk' : 'sp'
  );

  // The OTHER type's selection (if any) — rendered as a "locked" ghost on the calendar
  const lockedOther = activeType === 'sp' ? skSel : spSel;

  function status(s) {
    if (s.id === selection.spId || s.id === selection.skId) return 'sel';
    if (s.full) return 'full';
    if (lockedOther && conflicts(s, lockedOther)) return 'conflict';
    return 'ok';
  }

  function onClickSlot(s) {
    const st = status(s);
    if (st === 'full' || st === 'conflict') return;
    const isPicking = (s.type === 'sp' ? selection.spId : selection.skId) !== s.id;

    if (s.type === 'sp') {
      setSelection(sel => ({ ...sel, spId: sel.spId === s.id ? null : s.id }));
    } else {
      setSelection(sel => ({ ...sel, skId: sel.skId === s.id ? null : s.id }));
    }

    // Auto-switch to the other tab if user just picked this type and the other is still empty
    if (isPicking) {
      const otherPicked = s.type === 'sp' ? !!selection.skId : !!selection.spId;
      if (!otherPicked) {
        setTimeout(() => setActiveType(s.type === 'sp' ? 'sk' : 'sp'), 220);
      }
    }
  }

  // Group active-type slots by day
  const slotsByDay = useMemo(() => {
    const m = {};
    DAYS.forEach(d => {
      m[d.id] = SLOTS.filter(s => s.dayId === d.id && s.type === activeType);
    });
    return m;
  }, [activeType]);

  const canSubmit = !!(selection.spId && selection.skId);

  // Count for current tab
  const activeSlots = SLOTS.filter(s => s.type === activeType);
  const activeAvail = activeSlots.filter(s => !s.full).length;

  const typeLabel = (t) => t === 'sp' ? 'Speaking' : '3 Skills';
  const typeDur = (t) => t === 'sp' ? '60 phút' : '120 phút';

  return (
    <div className="app">
      <Topbar user={user} deadline={deadline} onLogout={onLogout} onHome={onHome} />

      <main className="container wide" style={{ paddingBottom: 24 }}>
        <Stepper current={2} />

        {/* Profile summary */}
        <div className="profile-row">
          <div className="info">
            <span className="avatar">{user.initials}</span>
            <span><b>{user.name}</b></span>
            <span className="info-sep"></span>
            <span>Mã NV: <b>{user.empCode}</b></span>
            <span className="info-sep"></span>
            <span>BU: <b>{user.bu}</b></span>
          </div>
          <button className="btn-link" onClick={onBack}>← Sửa thông tin</button>
        </div>

        {/* Heading */}
        <div className="mb-3">
          <h1 style={{ fontSize: 'var(--fs-xl)', letterSpacing: '-0.02em' }}>Chọn 2 ca thi của bạn</h1>
          <p className="text-sm text-muted mt-1">
            Pick lần lượt <b style={{ color: 'var(--brand-700)' }}>1 ca Speaking</b> và <b style={{ color: 'var(--accent-700)' }}>1 ca 3 Skills</b>. Hệ thống tự khoá ca trùng giờ với lựa chọn của bạn.
          </p>
        </div>

        {/* Type tabs · pick which type to view */}
        <div className="type-tabs">
          <TypeTab
            type="sp"
            num="1"
            active={activeType === 'sp'}
            picked={!!spSel}
            label="Speaking"
            duration="60 phút"
            statusText={spSel ? `${dayOf(spSel.dayId).label} · ${spSel.startLabel}–${spSel.endLabel}` : 'Click chọn ca'}
            onClick={() => setActiveType('sp')}
          />
          <TypeTab
            type="sk"
            num="2"
            active={activeType === 'sk'}
            picked={!!skSel}
            label="3 Skills"
            duration="120 phút"
            statusText={skSel ? `${dayOf(skSel.dayId).label} · ${skSel.startLabel}–${skSel.endLabel}` : 'Click chọn ca'}
            onClick={() => setActiveType('sk')}
          />
        </div>

        {/* Calendar */}
        <div className={`cal-wrap tone-${activeType}`}>
          <div className="cal-toolbar">
            <div className="week-nav">
              <button className="iconbtn" disabled aria-label="Tuần trước">‹</button>
              <span className="week-label">Tuần 22/06 – 26/06/2026</span>
              <button className="iconbtn" disabled aria-label="Tuần sau">›</button>
            </div>
            <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="text-xs text-muted">
                Đang xem <b style={{ color: activeType === 'sp' ? 'var(--brand-700)' : 'var(--accent-700)' }}>{typeLabel(activeType)}</b> · {activeAvail} ca còn chỗ · {activeSlots.length} tổng
              </div>
              {lockedOther && (
                <span className="locked-chip">
                  {typeLabel(lockedOther.type)} đã chọn: {dayOf(lockedOther.dayId).date} {lockedOther.startLabel}
                </span>
              )}
            </div>
          </div>

          <div className="cal">
            {/* Header row */}
            <div className="cal-head gutter"></div>
            {DAYS.map(d => (
              <div key={d.id} className="cal-head">
                <div className="day">{d.day}</div>
                <div className="date">{d.date}</div>
              </div>
            ))}

            {/* Time rows */}
            {HOURS.map(h => (
              <div key={h} style={{ display: 'contents' }}>
                <div className="cal-time">{String(h).padStart(2, '0')}:00</div>
                {DAYS.map(d => {
                  const blocks = slotsByDay[d.id].filter(s => Math.floor(s.start / 60) === h);
                  // Render the OTHER type's locked selection as a ghost in this cell if it starts here
                  const showLocked = lockedOther
                    && lockedOther.dayId === d.id
                    && Math.floor(lockedOther.start / 60) === h;

                  return (
                    <div key={d.id + h} className="cal-cell">
                      {showLocked && (
                        <div
                          className={`cal-block locked ${lockedOther.type}`}
                          style={{
                            top: ((lockedOther.start - h * 60) / 60) * ROW_H + 2,
                            height: ((lockedOther.end - lockedOther.start) / 60) * ROW_H - 4,
                          }}
                          title={`Ca ${typeLabel(lockedOther.type)} đã chọn · không thể đổi tại đây — switch tab để sửa`}
                        >
                          <div className="b-time">{lockedOther.startLabel}–{lockedOther.endLabel}</div>
                          <div className="b-meta">
                            <span className="b-loc">{typeLabel(lockedOther.type)} đã chọn</span>
                          </div>
                        </div>
                      )}
                      {blocks.map(s => {
                        const st = status(s);
                        const topPx = ((s.start - h * 60) / 60) * ROW_H;
                        const heightPx = ((s.end - s.start) / 60) * ROW_H - 4;
                        return (
                          <button
                            key={s.id}
                            className={`cal-block ${s.type} ${st === 'sel' ? 'sel' : ''} ${st === 'full' ? 'full' : ''} ${st === 'conflict' ? 'conflict' : ''}`}
                            style={{ top: topPx + 2, height: heightPx }}
                            onClick={() => onClickSlot(s)}
                            disabled={st === 'full' || st === 'conflict'}
                            title={st === 'conflict' ? `Trùng giờ với ca ${typeLabel(lockedOther.type)} đã chọn` : st === 'full' ? 'Đã hết chỗ' : `${s.startLabel}–${s.endLabel} · ${s.room} · Còn ${s.remaining}/${s.capacity}`}
                          >
                            <div className="b-time">{s.startLabel}–{s.endLabel}</div>
                            <div className="b-meta">
                              <span className="b-loc">{s.room.split(' · ')[0]}</span>
                              {st === 'conflict'
                                ? <span className="b-conflict-tag">Trùng</span>
                                : st === 'full'
                                ? <span className="b-rem">Hết</span>
                                : <span className="b-rem">{s.remaining}/{s.capacity}</span>
                              }
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Helper info */}
        <div className="row mt-3" style={{ gap: 12, flexWrap: 'wrap' }}>
          <span className="text-xs text-muted">Mẹo: Pick xong ca này → tự nhảy sang tab kia. Block dạng dashed là ca đã chọn ở tab kia.</span>
        </div>
      </main>

      {/* Sticky summary */}
      <div className="sticky-summary">
        <div className="sticky-summary-inner">
          <div className="summary-items">
            <div className={`summary-item ${spSel ? 'filled' : ''}`}>
              <div className="badge">1</div>
              <div>
                <div className="lbl">Speaking</div>
                <div className={`val ${spSel ? '' : 'empty'}`}>{spSel ? fmtSlot(spSel) : 'Chưa chọn ca'}</div>
              </div>
            </div>
            <div className={`summary-item ${skSel ? 'filled' : ''}`}>
              <div className="badge">2</div>
              <div>
                <div className="lbl">3 Skills</div>
                <div className={`val ${skSel ? '' : 'empty'}`}>{skSel ? fmtSlot(skSel) : 'Chưa chọn ca'}</div>
              </div>
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost" onClick={onBack}>← Quay lại</button>
            <button
              className={`btn ${canSubmit ? '' : 'disabled'}`}
              disabled={!canSubmit}
              onClick={onContinue}
            >
              Tiếp tục →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TypeTab · large segmented pill at top of calendar ─────────────────
function TypeTab({ type, num, active, picked, label, duration, statusText, onClick }) {
  return (
    <button
      className={`type-tab ${type} ${active ? 'active' : ''} ${picked ? 'picked' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <div className="tt-num">{picked ? '✓' : num}</div>
      <div className="tt-body">
        <div className="tt-label">
          {label}
          <span className="tt-dur"> · {duration}</span>
        </div>
        <div className={`tt-status ${picked ? 'picked' : ''}`}>{statusText}</div>
      </div>
      {active && <div className="tt-indicator" aria-hidden></div>}
    </button>
  );
}

Object.assign(window, { CalendarStep });

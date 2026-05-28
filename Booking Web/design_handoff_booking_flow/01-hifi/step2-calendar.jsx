// ─────────────────────────────────────────────────────────────────────────
// Step 2 · Calendar Week View (Variation C)
// Time-grid · slot blocks positioned by time · interactive picker
// ─────────────────────────────────────────────────────────────────────────

const ROW_H = 56;          // px per hour row · keep in sync with CSS --row-h
const FIRST_HOUR = 9;      // grid starts at 09:00

function CalendarStep({ user, deadline, selection, setSelection, onBack, onContinue, onLogout, onHome }) {
  // Compute conflict map: for each slot, is it blocked by the OTHER selection?
  const spSel = selection.spId ? slotById(selection.spId) : null;
  const skSel = selection.skId ? slotById(selection.skId) : null;

  function status(s) {
    if (s.id === selection.spId || s.id === selection.skId) return 'sel';
    if (s.full) return 'full';
    // Check conflict against the OTHER type's current selection
    const other = s.type === 'sp' ? skSel : spSel;
    if (other && conflicts(s, other)) return 'conflict';
    return 'ok';
  }

  function onClickSlot(s) {
    const st = status(s);
    if (st === 'full' || st === 'conflict') return;
    if (s.type === 'sp') {
      setSelection(sel => ({ ...sel, spId: sel.spId === s.id ? null : s.id }));
    } else {
      setSelection(sel => ({ ...sel, skId: sel.skId === s.id ? null : s.id }));
    }
  }

  // Group slots by day
  const slotsByDay = useMemo(() => {
    const m = {};
    DAYS.forEach(d => { m[d.id] = SLOTS.filter(s => s.dayId === d.id); });
    return m;
  }, []);

  const canSubmit = !!(selection.spId && selection.skId);

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
        <div className="row between mb-3" style={{ alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 'var(--fs-xl)', letterSpacing: '-0.02em' }}>Chọn 2 ca thi của bạn</h1>
            <p className="text-sm text-muted mt-1">
              Chọn <b style={{ color: 'var(--brand-700)' }}>1 ca Speaking</b> và <b style={{ color: 'var(--accent-700)' }}>1 ca 3 Skills</b>. Hệ thống sẽ tự khoá ca trùng giờ.
            </p>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <div className="cal-legend">
              <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--brand-100)', border: '1px solid var(--brand-300)' }}></span>Speaking</span>
              <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--accent-100)', border: '1px solid var(--accent-300)' }}></span>3 Skills</span>
              <span className="legend-item"><span className="legend-swatch" style={{ background: 'repeating-linear-gradient(135deg, var(--ink-100) 0 4px, var(--ink-50) 4px 8px)', border: '1px solid var(--ink-200)' }}></span>Hết</span>
            </div>
          </div>
        </div>

        {/* Calendar */}
        <div className="cal-wrap">
          <div className="cal-toolbar">
            <div className="week-nav">
              <button className="iconbtn" disabled aria-label="Tuần trước">‹</button>
              <span className="week-label">Tuần 22/06 – 26/06/2026</span>
              <button className="iconbtn" disabled aria-label="Tuần sau">›</button>
            </div>
            <div className="text-xs text-muted">
              {SLOTS.filter(s => !s.full).length} ca còn chỗ · {SLOTS.length} ca tổng
            </div>
          </div>

          <div className="cal">
            {/* Header row */}
            <div className="cal-head gutter"></div>
            {DAYS.map(d => (
              <div key={d.id} className={`cal-head ${d.id === 'mon-22' ? '' : ''}`}>
                <div className="day">{d.day}</div>
                <div className="date">{d.date}</div>
              </div>
            ))}

            {/* Time rows */}
            {HOURS.map(h => (
              <Fragment key={h}>
                <div className="cal-time">{String(h).padStart(2, '0')}:00</div>
                {DAYS.map(d => {
                  const blocks = slotsByDay[d.id].filter(s => Math.floor(s.start / 60) === h);
                  return (
                    <div key={d.id + h} className="cal-cell">
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
                            title={st === 'conflict' ? `Trùng với ca đã chọn` : st === 'full' ? 'Đã hết chỗ' : `${s.startLabel}–${s.endLabel} · ${s.room} · Còn ${s.remaining}/${s.capacity}`}
                          >
                            <div className="b-time">{s.startLabel}–{s.endLabel}</div>
                            <div className="b-meta">
                              <span className="b-loc">{s.room.split(' · ')[0]}</span>
                              {st === 'conflict'
                                ? <span className="b-conflict-tag">⚠ Trùng</span>
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
              </Fragment>
            ))}
          </div>
        </div>

        {/* Helper info */}
        <div className="row mt-3" style={{ gap: 12, flexWrap: 'wrap' }}>
          <span className="text-xs text-muted">💡 <b>Mẹo:</b> Click vào block để chọn / bỏ chọn. Block bị mờ + gạch chéo là trùng giờ với ca bạn vừa chọn.</span>
        </div>
      </main>

      {/* Sticky summary */}
      <div className="sticky-summary">
        <div className="sticky-summary-inner">
          <div className="summary-items">
            <div className={`summary-item ${spSel ? 'filled' : ''}`}>
              <div className="badge">①</div>
              <div>
                <div className="lbl">Speaking</div>
                <div className={`val ${spSel ? '' : 'empty'}`}>{spSel ? fmtSlot(spSel) : 'Chưa chọn ca'}</div>
              </div>
            </div>
            <div className={`summary-item ${skSel ? 'filled' : ''}`}>
              <div className="badge">②</div>
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

Object.assign(window, { CalendarStep });

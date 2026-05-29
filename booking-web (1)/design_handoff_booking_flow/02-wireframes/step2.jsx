// ─────────────────────────────────────────────────────────────────────────
// Step 2 — Chọn ca thi · 3 Variations
//   A · Timeline 2-column (Speaking | 3 Skills side-by-side)
//   B · Stacked by Date + Filter chips
//   C · Calendar Week View
//
// Lo-fi monochrome with sticky summary bar at the bottom of each.
// ─────────────────────────────────────────────────────────────────────────

// ─── Shared sub-component: profile summary row + step 2 header ────────────

const Step2Header = () => (
  <>
    <WHeader />
    <div style={{ padding: '14px 24px 0' }}>
      <WStepper current={2} />
      <div className="wf-profile-line">
        <div className="info">
          <b>Nguyễn Văn An</b> · 262010 · ITS-PHX
        </div>
        <span className="wf-btn ghost small">← Sửa thông tin</span>
      </div>
    </div>
  </>
);

const StickySummary = ({ speaking, skills, canSubmit }) => (
  <div className="wf-sticky-summary">
    <div style={{ display: 'flex', gap: 24 }}>
      <div className="wf-sticky-item">
        <span className="label">① Speaking</span>
        <span className={`val ${speaking ? '' : 'empty'}`}>{speaking || 'Chưa chọn'}</span>
      </div>
      <div className="wf-sticky-item">
        <span className="label">② 3 Skills</span>
        <span className={`val ${skills ? '' : 'empty'}`}>{skills || 'Chưa chọn'}</span>
      </div>
    </div>
    <button className={`wf-btn ${canSubmit ? '' : 'disabled'}`} style={{ background: canSubmit ? 'white' : 'rgba(255,255,255,0.15)', color: canSubmit ? 'var(--wf-text)' : 'rgba(255,255,255,0.5)', borderColor: canSubmit ? 'white' : 'rgba(255,255,255,0.2)' }}>
      Tiếp tục → Xác nhận
    </button>
  </div>
);

// ─── Variation A · Timeline 2-column ─────────────────────────────────────
// Speaking left | 3 Skills right · chronological vertical timeline
// Conflicting Skills slots show diagonal hatching + "trùng giờ" badge
// when a Speaking slot is selected.

const Step2VariationA = () => (
  <div className="wf wf-app" style={{ position: 'relative', paddingBottom: 64 }}>
    <Step2Header />
    <div style={{ padding: '0 24px 24px', position: 'relative' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <h2 style={{ fontSize: 15 }}>Chọn 2 ca thi của bạn</h2>
        <span style={{ fontSize: 11, color: 'var(--wf-text-muted)' }}>1 ca Speaking · 1 ca 3 Skills · không trùng giờ</span>
      </div>

      <div className="wf-grid-2" style={{ gap: 12, position: 'relative' }}>
        {/* SPEAKING COLUMN */}
        <div>
          <div className="wf-section-h" style={{ background: 'var(--wf-bg)', position: 'sticky', top: 0 }}>
            ① Speaking · chọn 1
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Date group */}
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--wf-text-muted)', letterSpacing: '0.06em', marginTop: 4 }}>THỨ 2 · 22/06</div>
            <div className="wf-slot selected">
              <div className="wf-slot-row">
                <div className="wf-slot-time">13:30 – 14:30</div>
                <span className="wf-slot-remaining">Còn 5/8</span>
              </div>
              <div className="wf-slot-loc">📍 Phòng A</div>
            </div>
            <div className="wf-slot">
              <div className="wf-slot-row">
                <div className="wf-slot-time">15:00 – 16:00</div>
                <span className="wf-slot-remaining warn">Còn 2/8</span>
              </div>
              <div className="wf-slot-loc">📍 Phòng A</div>
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--wf-text-muted)', letterSpacing: '0.06em', marginTop: 6 }}>THỨ 3 · 23/06</div>
            <div className="wf-slot">
              <div className="wf-slot-row">
                <div className="wf-slot-time">09:00 – 10:00</div>
                <span className="wf-slot-remaining">Còn 6/8</span>
              </div>
              <div className="wf-slot-loc">📍 Phòng A</div>
            </div>
            <div className="wf-slot full">
              <div className="wf-slot-row">
                <div className="wf-slot-time">10:30 – 11:30</div>
                <span className="wf-slot-remaining full">Hết chỗ</span>
              </div>
              <div className="wf-slot-loc">📍 Phòng A</div>
            </div>
          </div>
        </div>

        {/* 3 SKILLS COLUMN */}
        <div>
          <div className="wf-section-h" style={{ background: 'var(--wf-bg)', position: 'sticky', top: 0 }}>
            ② 3 Skills · chọn 1
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--wf-text-muted)', letterSpacing: '0.06em', marginTop: 4 }}>THỨ 2 · 22/06</div>
            <div className="wf-slot conflict">
              <div className="wf-slot-row">
                <div className="wf-slot-time">13:00 – 15:00</div>
                <span className="wf-conflict-tag">⚠ Trùng Speaking</span>
              </div>
              <div className="wf-slot-loc">📍 Phòng B</div>
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--wf-text-muted)', letterSpacing: '0.06em', marginTop: 6 }}>THỨ 4 · 24/06</div>
            <div className="wf-slot">
              <div className="wf-slot-row">
                <div className="wf-slot-time">09:00 – 11:00</div>
                <span className="wf-slot-remaining">Còn 7/10</span>
              </div>
              <div className="wf-slot-loc">📍 Phòng B</div>
            </div>
            <div className="wf-slot">
              <div className="wf-slot-row">
                <div className="wf-slot-time">14:00 – 16:00</div>
                <span className="wf-slot-remaining warn">Còn 3/10</span>
              </div>
              <div className="wf-slot-loc">📍 Phòng B</div>
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--wf-text-muted)', letterSpacing: '0.06em', marginTop: 6 }}>THỨ 5 · 25/06</div>
            <div className="wf-slot">
              <div className="wf-slot-row">
                <div className="wf-slot-time">09:00 – 11:00</div>
                <span className="wf-slot-remaining">Còn 8/10</span>
              </div>
              <div className="wf-slot-loc">📍 Phòng B</div>
            </div>
          </div>
        </div>
      </div>

      <div className="wf-anno arrow-down" style={{ top: 90, left: 20, maxWidth: 180 }}>
        <b>2-col layout</b> giảm scroll. User scan 2 trục thời gian song song → thấy trùng giờ trực quan.
      </div>
      <div className="wf-anno arrow-left" style={{ top: 220, left: '52%', maxWidth: 160 }}>
        Slot trùng giờ <b>diagonal-hatched</b> + label <b>"⚠ Trùng Speaking"</b> ngay trong card → user hiểu lý do bị disabled.
      </div>
      <div className="wf-anno arrow-up" style={{ top: 290, left: 20, maxWidth: 160 }}>
        Date label nhỏ làm <b>group separator</b> — không tốn 1 card riêng cho mỗi ngày.
      </div>
    </div>

    <StickySummary speaking="22/06 · 13:30–14:30 · Phòng A" skills={null} canSubmit={false} />

    <div className="wf-anno arrow-up" style={{ bottom: 76, right: 24, maxWidth: 180 }}>
      <b>Sticky summary bar</b> luôn visible → user thấy "đã chọn gì / còn thiếu gì" ngay cả khi scroll xa.
    </div>
  </div>
);

// ─── Variation B · Stacked by Date + Filter chips ────────────────────────
// All slots grouped under date headers. Speaking & Skills shown as 2
// sub-sections within each date. Filter chips top to narrow by week/AM-PM.

const Step2VariationB = () => (
  <div className="wf wf-app" style={{ position: 'relative', paddingBottom: 64 }}>
    <Step2Header />
    <div style={{ padding: '0 24px 24px', position: 'relative' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <h2 style={{ fontSize: 15 }}>Chọn 2 ca thi của bạn</h2>
        <span style={{ fontSize: 11, color: 'var(--wf-text-muted)' }}>1 Speaking + 1 3 Skills · không trùng giờ</span>
      </div>

      {/* Filter chips */}
      <div className="wf-chips" style={{ marginBottom: 14 }}>
        <span className="wf-chip active">Tất cả ngày</span>
        <span className="wf-chip">Tuần này</span>
        <span className="wf-chip">Tuần sau</span>
        <span style={{ width: 1, background: 'var(--wf-border)', margin: '0 4px' }} />
        <span className="wf-chip">Buổi sáng</span>
        <span className="wf-chip">Buổi chiều</span>
        <span style={{ width: 1, background: 'var(--wf-border)', margin: '0 4px' }} />
        <span className="wf-chip">Còn chỗ</span>
      </div>

      {/* Date sections */}
      <div className="wf-date-section">
        <div className="wf-date-head">
          <h3>Thứ 2 · 22/06/2026</h3>
          <span className="wf-date-meta">3 Speaking · 1 Skills</span>
        </div>

        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--wf-text-muted)', letterSpacing: '0.06em', marginBottom: 6 }}>① SPEAKING</div>
        <div className="wf-grid-2" style={{ marginBottom: 10 }}>
          <div className="wf-slot selected">
            <div className="wf-slot-row">
              <div className="wf-slot-time">13:30 – 14:30</div>
              <span className="wf-slot-remaining">5/8</span>
            </div>
            <div className="wf-slot-loc">📍 Phòng A</div>
          </div>
          <div className="wf-slot">
            <div className="wf-slot-row">
              <div className="wf-slot-time">15:00 – 16:00</div>
              <span className="wf-slot-remaining warn">2/8</span>
            </div>
            <div className="wf-slot-loc">📍 Phòng A</div>
          </div>
        </div>

        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--wf-text-muted)', letterSpacing: '0.06em', marginBottom: 6 }}>② 3 SKILLS</div>
        <div className="wf-grid-2">
          <div className="wf-slot conflict">
            <div className="wf-slot-row">
              <div className="wf-slot-time">13:00 – 15:00</div>
              <span className="wf-conflict-tag">⚠ Trùng</span>
            </div>
            <div className="wf-slot-loc">📍 Phòng B</div>
          </div>
        </div>
      </div>

      <div className="wf-date-section">
        <div className="wf-date-head">
          <h3>Thứ 4 · 24/06/2026</h3>
          <span className="wf-date-meta">0 Speaking · 2 Skills</span>
        </div>

        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--wf-text-muted)', letterSpacing: '0.06em', marginBottom: 6 }}>② 3 SKILLS</div>
        <div className="wf-grid-2">
          <div className="wf-slot">
            <div className="wf-slot-row">
              <div className="wf-slot-time">09:00 – 11:00</div>
              <span className="wf-slot-remaining">7/10</span>
            </div>
            <div className="wf-slot-loc">📍 Phòng B</div>
          </div>
          <div className="wf-slot">
            <div className="wf-slot-row">
              <div className="wf-slot-time">14:00 – 16:00</div>
              <span className="wf-slot-remaining warn">3/10</span>
            </div>
            <div className="wf-slot-loc">📍 Phòng B</div>
          </div>
        </div>
      </div>

      <div className="wf-anno arrow-down" style={{ top: 90, right: 24, maxWidth: 170 }}>
        <b>Filter chips</b> giải quyết cognitive overload khi >20 ca → narrow nhanh "tuần này", "buổi sáng".
      </div>
      <div className="wf-anno arrow-left" style={{ top: 230, right: -180, maxWidth: 170 }}>
        Date là <b>top-level grouping</b>. Speaking + Skills xếp trong cùng 1 ngày → user thấy "mình thi cả ngày được không".
      </div>
      <div className="wf-anno arrow-left" style={{ top: 480, right: -180, maxWidth: 170 }}>
        Pattern <b>collapsible</b>: click date header thu/mở section → tiết kiệm vertical space.
      </div>
    </div>

    <StickySummary speaking="22/06 · 13:30–14:30" skills={null} canSubmit={false} />
  </div>
);

// ─── Variation C · Calendar Week View ────────────────────────────────────
// Google-Calendar-style time-grid · slot blocks positioned on timeline
// Click block → select. Conflicts impossible visually thanks to grid.

const Step2VariationC = () => (
  <div className="wf wf-app" style={{ position: 'relative', paddingBottom: 64 }}>
    <Step2Header />
    <div style={{ padding: '0 24px 24px', position: 'relative' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <h2 style={{ fontSize: 15 }}>Chọn 2 ca thi của bạn</h2>
        <div className="wf-chips">
          <span className="wf-chip">← Tuần trước</span>
          <span className="wf-chip active">22/06 – 26/06</span>
          <span className="wf-chip">Tuần sau →</span>
        </div>
      </div>

      <div className="wf-cal-legend">
        <span className="item"><span className="swatch" style={{ background: 'var(--wf-accent-bg)', border: '1.5px solid var(--wf-accent)' }} />① Speaking</span>
        <span className="item"><span className="swatch" style={{ background: '#f3e8d8', border: '1.5px solid #a8794a' }} />② 3 Skills</span>
        <span className="item"><span className="swatch" style={{ background: 'var(--wf-accent)' }} />Đã chọn</span>
        <span className="item"><span className="swatch" style={{ background: 'var(--wf-bg-alt)', border: '1.5px dashed var(--wf-border)' }} />Hết chỗ</span>
      </div>

      <div className="wf-cal">
        {/* Header row */}
        <div className="wf-cal-head" />
        <div className="wf-cal-head"><div className="day">T2</div><div className="date">22/06</div></div>
        <div className="wf-cal-head"><div className="day">T3</div><div className="date">23/06</div></div>
        <div className="wf-cal-head"><div className="day">T4</div><div className="date">24/06</div></div>
        <div className="wf-cal-head"><div className="day">T5</div><div className="date">25/06</div></div>
        <div className="wf-cal-head"><div className="day">T6</div><div className="date">26/06</div></div>

        {/* 09:00 row */}
        <div className="wf-cal-time">09:00</div>
        <div className="wf-cal-cell" />
        <div className="wf-cal-cell">
          <div className="wf-cal-block sp" style={{ top: 2, height: 26 }}>SP · 09–10 · 6/8</div>
        </div>
        <div className="wf-cal-cell">
          <div className="wf-cal-block sk" style={{ top: 2, height: 58 }}>SK · 09–11 · 7/10</div>
        </div>
        <div className="wf-cal-cell">
          <div className="wf-cal-block sk" style={{ top: 2, height: 58 }}>SK · 09–11 · 8/10</div>
        </div>
        <div className="wf-cal-cell" />

        {/* 10:00 row */}
        <div className="wf-cal-time">10:00</div>
        <div className="wf-cal-cell" />
        <div className="wf-cal-cell" />
        <div className="wf-cal-cell" />
        <div className="wf-cal-cell" />
        <div className="wf-cal-cell" />

        {/* 11:00 row */}
        <div className="wf-cal-time">11:00</div>
        <div className="wf-cal-cell" />
        <div className="wf-cal-cell">
          <div className="wf-cal-block sp full" style={{ top: 2, height: 26 }}>SP · 10:30 · Hết</div>
        </div>
        <div className="wf-cal-cell" />
        <div className="wf-cal-cell" />
        <div className="wf-cal-cell" />

        {/* 13:00 row */}
        <div className="wf-cal-time">13:00</div>
        <div className="wf-cal-cell">
          <div className="wf-cal-block selected" style={{ top: 14, height: 30 }}>✓ SP · 13:30–14:30</div>
        </div>
        <div className="wf-cal-cell" />
        <div className="wf-cal-cell" />
        <div className="wf-cal-cell" />
        <div className="wf-cal-cell" />

        {/* 14:00 row */}
        <div className="wf-cal-time">14:00</div>
        <div className="wf-cal-cell" />
        <div className="wf-cal-cell" />
        <div className="wf-cal-cell">
          <div className="wf-cal-block sk" style={{ top: 2, height: 58 }}>SK · 14–16 · 3/10</div>
        </div>
        <div className="wf-cal-cell" />
        <div className="wf-cal-cell" />

        {/* 15:00 row */}
        <div className="wf-cal-time">15:00</div>
        <div className="wf-cal-cell">
          <div className="wf-cal-block sp" style={{ top: 2, height: 26 }}>SP · 15–16 · 2/8</div>
        </div>
        <div className="wf-cal-cell" />
        <div className="wf-cal-cell" />
        <div className="wf-cal-cell" />
        <div className="wf-cal-cell" />

        {/* 16:00 row */}
        <div className="wf-cal-time">16:00</div>
        <div className="wf-cal-cell" />
        <div className="wf-cal-cell" />
        <div className="wf-cal-cell" />
        <div className="wf-cal-cell" />
        <div className="wf-cal-cell" />
      </div>

      <div className="wf-anno arrow-down" style={{ top: 100, right: 24, maxWidth: 160 }}>
        <b>Calendar week view</b>: thời gian trực quan như Google Calendar → trùng giờ <b>không thể xảy ra về mặt thị giác</b>.
      </div>
      <div className="wf-anno arrow-left" style={{ top: 360, right: -170, maxWidth: 160 }}>
        Click block → chọn. Block đã chọn fill solid → user thấy ngay vị trí trên timeline.
      </div>
      <div className="wf-anno arrow-up" style={{ top: 280, left: 30, maxWidth: 170 }}>
        2 màu phân biệt <b>Speaking (xanh)</b> vs <b>3 Skills (nâu)</b> → quét được "mình rảnh khung nào".
      </div>
    </div>

    <StickySummary speaking="T2 · 13:30–14:30" skills={null} canSubmit={false} />
  </div>
);

// Detail callout: Slot card states
const SlotCardStates = () => (
  <div className="wf" style={{ padding: 20 }}>
    <h3 style={{ fontSize: 13, marginBottom: 4 }}>Slot Card · 6 States</h3>
    <p style={{ fontSize: 11, color: 'var(--wf-text-muted)', marginBottom: 16 }}>
      Information hierarchy + color-coded availability. Mỗi state có visual cue rõ ràng.
    </p>

    <div className="wf-grid-3" style={{ gap: 10, marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--wf-text-muted)', letterSpacing: '0.06em', marginBottom: 6 }}>DEFAULT · còn nhiều</div>
        <div className="wf-slot">
          <div className="wf-slot-row">
            <div className="wf-slot-time">13:30 – 14:30</div>
            <span className="wf-slot-remaining">Còn 5/8</span>
          </div>
          <div className="wf-slot-loc">📍 Phòng A</div>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--wf-text-muted)', letterSpacing: '0.06em', marginBottom: 6 }}>WARN · sắp hết</div>
        <div className="wf-slot">
          <div className="wf-slot-row">
            <div className="wf-slot-time">13:30 – 14:30</div>
            <span className="wf-slot-remaining warn">Còn 2/8</span>
          </div>
          <div className="wf-slot-loc">📍 Phòng A</div>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--wf-text-muted)', letterSpacing: '0.06em', marginBottom: 6 }}>FULL · hết chỗ</div>
        <div className="wf-slot full">
          <div className="wf-slot-row">
            <div className="wf-slot-time">13:30 – 14:30</div>
            <span className="wf-slot-remaining full">Hết chỗ</span>
          </div>
          <div className="wf-slot-loc">📍 Phòng A</div>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--wf-text-muted)', letterSpacing: '0.06em', marginBottom: 6 }}>SELECTED · đã chọn</div>
        <div className="wf-slot selected">
          <div className="wf-slot-row">
            <div className="wf-slot-time">13:30 – 14:30</div>
            <span className="wf-slot-remaining">Còn 5/8</span>
          </div>
          <div className="wf-slot-loc">📍 Phòng A</div>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--wf-text-muted)', letterSpacing: '0.06em', marginBottom: 6 }}>CONFLICT · trùng giờ</div>
        <div className="wf-slot conflict">
          <div className="wf-slot-row">
            <div className="wf-slot-time">13:00 – 15:00</div>
            <span className="wf-conflict-tag">⚠ Trùng</span>
          </div>
          <div className="wf-slot-loc">📍 Phòng B</div>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--wf-text-muted)', letterSpacing: '0.06em', marginBottom: 6 }}>CURRENT · ca hiện tại</div>
        <div className="wf-slot" style={{ borderColor: 'var(--wf-text)', borderWidth: 1.5 }}>
          <div className="wf-slot-row">
            <div className="wf-slot-time">13:30 – 14:30</div>
            <span className="wf-slot-remaining" style={{ background: 'var(--wf-bg-alt)', color: 'var(--wf-text)' }}>Đang chọn</span>
          </div>
          <div className="wf-slot-loc">📍 Phòng A</div>
        </div>
      </div>
    </div>
  </div>
);

Object.assign(window, {
  Step2VariationA,
  Step2VariationB,
  Step2VariationC,
  SlotCardStates,
});

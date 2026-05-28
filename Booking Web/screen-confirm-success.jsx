// ─────────────────────────────────────────────────────────────────────────
// Confirm Modal · Success Screen · Booking Display
// ─────────────────────────────────────────────────────────────────────────

// ─── Confirm Modal ─────────────────────────────────────────────────────
function ConfirmModal({ user, selection, onCancel, onConfirm }) {
  const sp = slotById(selection.spId);
  const sk = slotById(selection.skId);
  const [submitting, setSubmitting] = useState(false);

  function handleConfirm() {
    setSubmitting(true);
    setTimeout(() => onConfirm(), 700);
  }

  return (
    <Modal
      title="Xác nhận đăng ký"
      subtitle="Vui lòng kiểm tra kỹ trước khi gửi. Sau đăng ký bạn vẫn có thể đổi ca."
      onClose={onCancel}
      maxWidth={520}
      footer={
        <>
          <button className="btn ghost" onClick={onCancel} disabled={submitting}>← Quay lại sửa</button>
          <button className={`btn ${submitting ? 'disabled' : ''}`} onClick={handleConfirm} disabled={submitting}>
            {submitting ? (
              <><span className="dots"><span></span><span></span><span></span></span>Đang gửi...</>
            ) : 'Xác nhận đăng ký'}
          </button>
        </>
      }
    >
      {/* Profile preview */}
      <SecTitle icon="👤" text="Học viên" />
      <div style={{ background: 'var(--ink-25)', padding: 'var(--s-3) var(--s-4)', borderRadius: 'var(--r-md)', marginBottom: 'var(--s-4)' }}>
        <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{user.name}</div>
        <div className="text-sm text-muted mt-1">Mã NV: <b style={{ color: 'var(--ink-800)' }}>{user.empCode}</b> · BU: <b style={{ color: 'var(--ink-800)' }}>{user.bu}</b></div>
      </div>

      <SecTitle icon="📅" text="2 ca thi đã chọn" />
      <div className="col mb-4" style={{ gap: 'var(--s-2)' }}>
        <SlotPreview slot={sp} index={1} />
        <SlotPreview slot={sk} index={2} />
      </div>

      <div className="banner warn">
        <span className="banner-icon">⚠</span>
        <div>
          <b>Sau khi đăng ký</b> bạn còn <b>3 lần đổi ca</b>. Hết quota sẽ phải liên hệ BTC.
        </div>
      </div>
    </Modal>
  );
}

function SlotPreview({ slot, index }) {
  if (!slot) return null;
  const d = dayOf(slot.dayId);
  const isSpeak = slot.type === 'sp';
  return (
    <div className={`bk-slot ${isSpeak ? '' : 'sk'}`}>
      <div className="num">{index}</div>
      <div className="body">
        <div className="type-lbl">{isSpeak ? 'Speaking · 60 phút' : '3 Skills · 120 phút'}</div>
        <div className="when">{d.label} · {slot.startLabel}–{slot.endLabel}</div>
        <div className="where">📍 {slot.room}</div>
      </div>
    </div>
  );
}

// ─── Success Screen ─────────────────────────────────────────────────────
function SuccessScreen({ user, selection, deadline, onLogout, onHome, onViewDetail }) {
  const sp = slotById(selection.spId);
  const sk = slotById(selection.skId);
  // Earliest slot
  const slots = [sp, sk].filter(Boolean).sort((a, b) => {
    const da = dayOf(a.dayId).iso, db = dayOf(b.dayId).iso;
    if (da !== db) return da < db ? -1 : 1;
    return a.start - b.start;
  });
  const first = slots[0];

  // Days from "today" (using fixed virtual date for prototype)
  const daysLeft = daysUntil(first ? dayOf(first.dayId).iso : null);

  return (
    <div className="app">
      <Topbar user={user} deadline={deadline} onLogout={onLogout} onHome={onHome} showLogout />

      <main className="container">
        <div className="success-hero">
          <div className="success-check">✓</div>
          <h1 className="success-title">Đăng ký thành công!</h1>
          <p className="success-sub">{user.name} · {user.empCode}</p>
        </div>

        {/* Countdown */}
        <div className="countdown">
          <div className="meta">
            <div className="lbl">Còn đến ca thi gần nhất</div>
            <div className="when">{first ? `${first.type === 'sp' ? 'Speaking' : '3 Skills'} · ${dayOf(first.dayId).label} · ${first.startLabel}` : '—'}</div>
          </div>
          <div className="big">
            <div className="n">{daysLeft}</div>
            <div className="u">ngày</div>
          </div>
        </div>

        {/* Slot cards */}
        <div className="card">
          <div className="card-hd">
            <div className="card-title">Lịch thi của bạn</div>
            <div className="card-sub">Email xác nhận đã gửi đến <b>{user.email}</b>.</div>
          </div>
          <div className="card-bd">
            <div className="col" style={{ gap: 'var(--s-3)' }}>
              {slots.map((s, i) => (
                <BookingSlotCard key={s.id} slot={s} index={i + 1} withCalendarBtn />
              ))}
            </div>
          </div>
          <div className="card-ft">
            <span>Còn <b style={{ color: 'var(--ink-900)' }}>3/3</b> lần đổi ca</span>
            <button className="btn ghost" onClick={onViewDetail}>Xem chi tiết →</button>
          </div>
        </div>

        <div className="banner info mt-4">
          <span className="banner-icon">📨</span>
          <div>
            <b>Lưu ý:</b> Mang theo CCCD/Thẻ NV khi tới phòng thi. Reminder sẽ gửi trước ngày thi 7 / 3 / 1 ngày.
          </div>
        </div>
      </main>
    </div>
  );
}

function BookingSlotCard({ slot, index, withCalendarBtn }) {
  const d = dayOf(slot.dayId);
  const isSpeak = slot.type === 'sp';
  return (
    <div className={`bk-slot ${isSpeak ? '' : 'sk'}`}>
      <div className="num">{index}</div>
      <div className="body">
        <div className="type-lbl">{isSpeak ? 'Speaking · 60 phút' : '3 Skills · 120 phút'}</div>
        <div className="when">{d.label} · {slot.startLabel}–{slot.endLabel}</div>
        <div className="where">📍 {slot.room}</div>
      </div>
      {withCalendarBtn && (
        <div className="action">
          <button className="btn ghost sm" title="Thêm vào lịch (.ics)">
            <span>📅</span>
            <span>+ Lịch</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Booking Display (after success / when user returns) ───────────────
function BookingDisplay({ user, selection, deadline, registeredAt, changesLeft, onLogout, onHome, onChange, onCancel }) {
  const sp = slotById(selection.spId);
  const sk = slotById(selection.skId);
  const [menuOpen, setMenuOpen] = useState(false);
  const slots = [sp, sk].filter(Boolean).sort((a, b) => {
    const da = dayOf(a.dayId).iso, db = dayOf(b.dayId).iso;
    if (da !== db) return da < db ? -1 : 1;
    return a.start - b.start;
  });
  const first = slots[0];
  const daysLeft = daysUntil(first ? dayOf(first.dayId).iso : null);

  // close menu on outside click
  const menuRef = useRef(null);
  useEffect(() => {
    function onDoc(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="app">
      <Topbar user={user} deadline={deadline} onLogout={onLogout} onHome={onHome} />

      <main className="container">
        <div className="row between mb-3" style={{ alignItems: 'baseline' }}>
          <h1 style={{ fontSize: 'var(--fs-xl)' }}>Lịch thi của bạn</h1>
          <span className="pill success">✓ Đã đăng ký</span>
        </div>

        <div className="countdown mb-4">
          <div className="meta">
            <div className="lbl">Còn đến ca thi gần nhất</div>
            <div className="when">{first ? `${first.type === 'sp' ? 'Speaking' : '3 Skills'} · ${dayOf(first.dayId).label} · ${first.startLabel}` : '—'}</div>
          </div>
          <div className="big">
            <div className="n">{daysLeft}</div>
            <div className="u">ngày</div>
          </div>
        </div>

        <div className="card">
          <div className="card-hd">
            <SecTitle icon="👤" text="Học viên" />
            <div className="text-sm" style={{ marginTop: 'var(--s-1)' }}>
              <b>{user.name}</b> · {user.empCode} · {user.bu}
            </div>
          </div>
          <div className="card-bd">
            <SecTitle icon="📅" text="2 ca thi" />
            <div className="col" style={{ gap: 'var(--s-3)' }}>
              {slots.map((s, i) => (
                <BookingSlotCard key={s.id} slot={s} index={i + 1} withCalendarBtn />
              ))}
            </div>
          </div>
          <div className="card-ft">
            <span>Đăng ký: <b style={{ color: 'var(--ink-700)' }}>{registeredAt}</b></span>
            <span>Còn <b style={{ color: 'var(--ink-900)' }}>{changesLeft}/3</b> lần đổi ca</span>
          </div>
        </div>

        <div className="bk-actions">
          <button className="btn" onClick={onChange}>
            ↻ Đổi ca thi
          </button>
          <div className="menu-wrap" ref={menuRef}>
            <button className="btn ghost" onClick={() => setMenuOpen(o => !o)} aria-haspopup="true" aria-expanded={menuOpen}>
              ⋮ Tùy chọn khác
            </button>
            {menuOpen && (
              <div className="menu" role="menu">
                <button className="menu-item" role="menuitem">📥 Tải .ics</button>
                <button className="menu-item" role="menuitem">📧 Gửi lại email</button>
                <div className="menu-divider"></div>
                <button className="menu-item danger" role="menuitem" onClick={() => { setMenuOpen(false); onCancel(); }}>
                  🗑 Hủy đăng ký
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────
function daysUntil(isoDate) {
  if (!isoDate) return 0;
  // Use fixed "today" = 2026-06-07 for the prototype (so countdowns make sense)
  const today = new Date('2026-06-07T00:00:00');
  const d = new Date(isoDate + 'T00:00:00');
  return Math.ceil((d - today) / (1000 * 60 * 60 * 24));
}

Object.assign(window, { ConfirmModal, SuccessScreen, BookingDisplay, SlotPreview, BookingSlotCard });

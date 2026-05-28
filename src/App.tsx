import { Component, useEffect, useMemo, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import {
  book,
  cancel,
  formatDateVi,
  init,
  minToHHmm,
  overlaps,
  type InitResult,
  type MyBooking,
  type Slot,
} from './lib/gas';

type Banner = { kind: 'success' | 'error' | 'info'; text: string } | null;

export function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

function AppInner() {
  const [data, setData] = useState<InitResult | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  useEffect(() => {
    init()
      .then(setData)
      .catch((e: Error) => setLoadErr(e.message || 'Không tải được dữ liệu.'));
  }, []);

  // Auto-dismiss: success 10s, error/info 8s
  useEffect(() => {
    if (!banner) return;
    const ms = banner.kind === 'success' ? 10000 : 8000;
    const id = setTimeout(() => setBanner(null), ms);
    return () => clearTimeout(id);
  }, [banner]);

  if (loadErr) {
    return (
      <div className="app">
        <div className="error-screen">
          <h2>Không tải được dữ liệu</h2>
          <p>{loadErr}</p>
          <button className="primary" onClick={() => window.location.reload()}>
            Tải lại
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app">
        <div className="loading">
          <span className="spinner" /> Đang tải…
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header data={data} />

      {banner && (
        <div className={`banner ${banner.kind}`} role="status">
          <span>{banner.text}</span>
          <button
            type="button"
            className="banner-close"
            aria-label="Đóng"
            onClick={() => setBanner(null)}
          >
            ×
          </button>
        </div>
      )}

      <Body data={data} setData={setData} setBanner={setBanner} />
    </div>
  );
}

function Header({ data }: { data: InitResult }) {
  return (
    <header className="app-header">
      <div>
        <h1>Đăng ký thi Assessment Q2 2026</h1>
        <div className="sub">
          Đăng nhập: <strong>{data.email}</strong>
        </div>
      </div>
      <DeadlinePill data={data} />
    </header>
  );
}

function DeadlinePill({ data }: { data: InitResult }) {
  // Tick mỗi 30s để countdown sống.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!data.deadline) return null;

  const deadlineMs = new Date(data.deadline).getTime();
  // Bù offset (server clock vs client clock) tại thời điểm load.
  const serverLoadMs = new Date(data.serverNow).getTime();
  const clientLoadMs = useRef(Date.now()).current;
  const skew = serverLoadMs - clientLoadMs;
  const effectiveNow = Date.now() + skew;
  const diffMs = deadlineMs - effectiveNow;

  if (data.deadlinePassed || diffMs <= 0) {
    return <span className="deadline-pill passed">Đã đóng đăng ký</span>;
  }

  const totalMin = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  const warn = totalMin < 60 * 24 * 2;
  const urgent = totalMin < 60;

  let text: string;
  if (urgent) text = `Sắp đóng: còn ${mins} phút`;
  else if (days > 0) text = `Hạn đăng ký: còn ${days} ngày ${hours} giờ`;
  else text = `Hạn đăng ký: còn ${hours} giờ ${mins} phút`;

  return <span className={`deadline-pill ${urgent ? 'passed' : warn ? 'warn' : ''}`}>{text}</span>;
}

function Body({
  data,
  setData,
  setBanner,
}: {
  data: InitResult;
  setData: (d: InitResult) => void;
  setBanner: (b: Banner) => void;
}) {
  const [editing, setEditing] = useState<boolean>(!data.myBooking);

  if (data.myBooking && !editing) {
    return (
      <BookingDisplay
        booking={data.myBooking}
        slots={data.slots}
        deadlinePassed={data.deadlinePassed}
        maxChanges={data.maxChanges}
        onEdit={() => setEditing(true)}
        onCancelled={(state) => {
          setBanner({ kind: 'success', text: 'Đã hủy đăng ký.' });
          setData(state);
          setEditing(true);
        }}
        onError={(text) => setBanner({ kind: 'error', text })}
      />
    );
  }

  if (!data.allowEnrollment) {
    return (
      <div className="banner error">
        <span>
          Đăng ký hiện đang bị khoá. Vui lòng liên hệ Ban tổ chức.
        </span>
      </div>
    );
  }

  if (data.deadlinePassed) {
    return (
      <div className="banner error">
        <span>
          Đã hết hạn đăng ký. Bạn chưa đăng ký ca thi nào — vui lòng liên hệ Ban tổ chức.
        </span>
      </div>
    );
  }

  return (
    <BookingForm
      data={data}
      onBooked={(state, emailSent) => {
        setBanner({
          kind: 'success',
          text: emailSent
            ? 'Đăng ký thành công! Email xác nhận đã được gửi.'
            : 'Đăng ký thành công!',
        });
        setData(state);
        setEditing(false);
      }}
      onError={(text, state) => {
        setBanner({ kind: 'error', text });
        if (state) setData(state);
      }}
      onCancelEdit={data.myBooking ? () => setEditing(false) : undefined}
    />
  );
}

function BookingDisplay({
  booking,
  slots,
  deadlinePassed,
  maxChanges,
  onEdit,
  onCancelled,
  onError,
}: {
  booking: MyBooking;
  slots: Slot[];
  deadlinePassed: boolean;
  maxChanges: number;
  onEdit: () => void;
  onCancelled: (state: InitResult) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const sp = slots.find((s) => s.slotId === booking.speakingSlotId);
  const sk = slots.find((s) => s.slotId === booking.skillsSlotId);

  const fallback = (id: string | null) =>
    id ? `${id} (slot đã bị xóa — liên hệ BTC)` : '—';

  const formatSlotDisplay = (slot: Slot | undefined, fallbackId: string | null) => {
    if (!slot) return fallback(fallbackId);
    const loc = slot.location ? ` · ${slot.location}` : '';
    return `${slot.session ? `[${slot.session}] ` : ''}${formatDateVi(slot.date)} · ${minToHHmm(slot.startMin)}–${minToHHmm(slot.endMin)}${loc}`;
  };

  const handleCancel = async () => {
    if (!confirm('Hủy đăng ký 2 ca thi của bạn? Bạn có thể đăng ký lại trước hạn.')) return;
    setBusy(true);
    try {
      const res = await cancel();
      if (!res.ok) onError(res.error || 'Hủy thất bại.');
      else if (res.state) onCancelled(res.state);
      else onError('Đã hủy nhưng không nhận được state mới. Vui lòng tải lại.');
    } catch (e) {
      onError((e as Error).message || 'Hủy thất bại.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="booking-summary">
      <h2>✓ Đã đăng ký</h2>
      <dl>
        <dt>Mã NV</dt>
        <dd>{booking.empCode}</dd>
        <dt>Họ và tên</dt>
        <dd>{booking.fullName}</dd>
        <dt>BU</dt>
        <dd>{booking.bu}</dd>
        <dt>Ca Speaking</dt>
        <dd className={sp ? '' : 'orphan'}>{formatSlotDisplay(sp, booking.speakingSlotId)}</dd>
        <dt>Ca 3 Skills</dt>
        <dd className={sk ? '' : 'orphan'}>{formatSlotDisplay(sk, booking.skillsSlotId)}</dd>
        {booking.createdAt && (
          <>
            <dt>Đăng ký lúc</dt>
            <dd>{new Date(booking.createdAt).toLocaleString('vi-VN')}</dd>
          </>
        )}
        {booking.updatedAt && booking.updatedAt !== booking.createdAt && (
          <>
            <dt>Cập nhật lúc</dt>
            <dd>{new Date(booking.updatedAt).toLocaleString('vi-VN')}</dd>
          </>
        )}
      </dl>
      {booking.changeCount > 0 && (
        <div style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--txt-2)' }}>
          Đã đổi ca: {booking.changeCount} / {maxChanges} lần
          {booking.changeCount >= maxChanges && ' (đã hết lượt đổi)'}
        </div>
      )}
      {!deadlinePassed && (
        <div className="actions" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="ghost"
            onClick={onEdit}
            disabled={busy || booking.changeCount >= maxChanges}
            title={booking.changeCount >= maxChanges ? 'Bạn đã hết lượt đổi ca' : undefined}
          >
            Đổi ca
          </button>
          <button type="button" className="danger" onClick={handleCancel} disabled={busy}>
            {busy ? 'Đang hủy…' : 'Hủy đăng ký'}
          </button>
        </div>
      )}
    </div>
  );
}

function BookingForm({
  data,
  onBooked,
  onError,
  onCancelEdit,
}: {
  data: InitResult;
  onBooked: (state: InitResult, emailSent: boolean) => void;
  onError: (msg: string, state?: InitResult) => void;
  onCancelEdit?: () => void;
}) {
  const cur = data.myBooking;
  const [empCode, setEmpCode] = useState(cur?.empCode ?? '');
  const [fullName, setFullName] = useState(cur?.fullName ?? '');
  const [bu, setBu] = useState(cur?.bu ?? '');
  const [speakingId, setSpeakingId] = useState<string | null>(cur?.speakingSlotId ?? null);
  const [skillsId, setSkillsId] = useState<string | null>(cur?.skillsSlotId ?? null);
  const [submitting, setSubmitting] = useState(false);

  const slots = data.slots;
  const speakingSlots = useMemo(
    () => slots.filter((s) => s.type === 'Speaking').sort(sortByDateStart),
    [slots],
  );
  const chosenSpeaking = speakingSlots.find((s) => s.slotId === speakingId) ?? null;

  const skillsSlots = useMemo(
    () => slots.filter((s) => s.type === '3 Skills').sort(sortByDateStart),
    [slots],
  );

  const canSubmit =
    empCode.trim().length >= 3 &&
    fullName.trim().length >= 2 &&
    bu.trim().length >= 2 &&
    speakingId && skillsId && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!speakingId || !skillsId) return;

    // Confirm dialog
    const sp = data.slots.find((s) => s.slotId === speakingId);
    const sk = data.slots.find((s) => s.slotId === skillsId);
    if (cur) {
      const curSp = data.slots.find((s) => s.slotId === cur.speakingSlotId);
      const curSk = data.slots.find((s) => s.slotId === cur.skillsSlotId);
      const changed = speakingId !== cur.speakingSlotId || skillsId !== cur.skillsSlotId;
      if (changed) {
        const spLabel = sp ? `${formatDateVi(sp.date)} ${minToHHmm(sp.startMin)}–${minToHHmm(sp.endMin)}${sp.location ? ' (' + sp.location + ')' : ''}` : speakingId;
        const skLabel = sk ? `${formatDateVi(sk.date)} ${minToHHmm(sk.startMin)}–${minToHHmm(sk.endMin)}${sk.location ? ' (' + sk.location + ')' : ''}` : skillsId;
        const curSpLabel = curSp ? `${formatDateVi(curSp.date)} ${minToHHmm(curSp.startMin)}–${minToHHmm(curSp.endMin)}` : cur.speakingSlotId;
        const curSkLabel = curSk ? `${formatDateVi(curSk.date)} ${minToHHmm(curSk.startMin)}–${minToHHmm(curSk.endMin)}` : cur.skillsSlotId;
        const msg =
          'Bạn đang thay đổi ca thi:\n' +
          '  Speaking: ' + curSpLabel + '  →  ' + spLabel + '\n' +
          '  3 Skills: ' + curSkLabel + '  →  ' + skLabel + '\n\n' +
          'Xác nhận thay đổi?';
        if (!window.confirm(msg)) return;
      }
    } else {
      // New booking — show summary confirm
      const spLabel = sp ? `${formatDateVi(sp.date)} ${minToHHmm(sp.startMin)}–${minToHHmm(sp.endMin)}${sp.location ? ' (' + sp.location + ')' : ''}` : speakingId;
      const skLabel = sk ? `${formatDateVi(sk.date)} ${minToHHmm(sk.startMin)}–${minToHHmm(sk.endMin)}${sk.location ? ' (' + sk.location + ')' : ''}` : skillsId;
      const msg =
        'Xác nhận đăng ký:\n' +
        '  Họ tên: ' + fullName.trim() + '\n' +
        '  Mã NV: ' + empCode.trim() + '\n' +
        '  BU: ' + bu.trim() + '\n\n' +
        '  Speaking: ' + spLabel + '\n' +
        '  3 Skills: ' + skLabel + '\n\n' +
        'Bạn có thể đổi ca hoặc hủy trước hạn đăng ký.';
      if (!window.confirm(msg)) return;
    }

    setSubmitting(true);
    try {
      const res = await book({
        empCode: empCode.trim(),
        fullName: fullName.trim(),
        bu: bu.trim(),
        speakingSlotId: speakingId,
        skillsSlotId: skillsId,
      });
      if (!res.ok) {
        onError(res.error || 'Đăng ký thất bại.', res.state);
        if (res.state) {
          // Slot có thể đã hết chỗ → reset selection nếu không còn hợp lệ
          const fresh = res.state.slots.find((s) => s.slotId === speakingId);
          if (fresh && fresh.remaining <= 0) setSpeakingId(null);
          const fresh2 = res.state.slots.find((s) => s.slotId === skillsId);
          if (fresh2 && fresh2.remaining <= 0) setSkillsId(null);
        }
      } else if (res.state) {
        onBooked(res.state, !!res.emailSent);
      } else {
        onError('Đăng ký thành công nhưng không nhận được state. Tải lại trang.');
      }
    } catch (e) {
      onError((e as Error).message || 'Đăng ký thất bại.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <section className="card">
        <h2>
          <span className="step">1</span> Thông tin học viên
        </h2>
        <div className="row">
          <label className="field">
            <span>Mã NV</span>
            <input
              value={empCode}
              onChange={(e) => setEmpCode(e.target.value)}
              placeholder="VD: CLG12345"
              required
              maxLength={20}
            />
          </label>
          <label className="field">
            <span>Họ và tên</span>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="VD: Nguyễn Văn A"
              required
              maxLength={100}
            />
          </label>
          <label className="field">
            <span>BU</span>
            <input
              value={bu}
              onChange={(e) => setBu(e.target.value)}
              placeholder="VD: ITS-PHX"
              required
              maxLength={50}
            />
          </label>
        </div>
      </section>

      <section className="card">
        <h2>
          <span className="step">2</span> Chọn ca Speaking
        </h2>
        <SlotGrid
          slots={speakingSlots}
          selectedId={speakingId}
          onSelect={(id) => {
            setSpeakingId(id);
            if (skillsId) {
              const sk = slots.find((s) => s.slotId === skillsId);
              const sp = slots.find((s) => s.slotId === id);
              if (sk && sp && overlaps(sp, sk)) setSkillsId(null);
            }
          }}
          currentBookingId={cur?.speakingSlotId ?? null}
        />
      </section>

      <section className="card">
        <h2>
          <span className="step">3</span> Chọn ca 3 Skills
        </h2>
        {!chosenSpeaking && (
          <div className="slot-empty">Vui lòng chọn ca Speaking trước.</div>
        )}
        {chosenSpeaking && (
          <SlotGrid
            slots={skillsSlots}
            selectedId={skillsId}
            onSelect={setSkillsId}
            disabledIf={(s) => overlaps(s, chosenSpeaking)}
            disabledReason="Trùng giờ"
            currentBookingId={cur?.skillsSlotId ?? null}
          />
        )}
      </section>

      <div className="actions">
        <button className="primary" type="submit" disabled={!canSubmit}>
          {submitting ? (
            <>
              <span className="spinner" /> Đang gửi…
            </>
          ) : cur ? (
            'Cập nhật đăng ký'
          ) : (
            'Đăng ký'
          )}
        </button>
        {onCancelEdit && (
          <button type="button" className="ghost" onClick={onCancelEdit} disabled={submitting}>
            Hủy thay đổi
          </button>
        )}
      </div>
    </form>
  );
}

function SlotGrid({
  slots,
  selectedId,
  onSelect,
  disabledIf,
  disabledReason,
  currentBookingId,
}: {
  slots: Slot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabledIf?: (s: Slot) => boolean;
  disabledReason?: string;
  currentBookingId?: string | null;
}) {
  if (slots.length === 0) {
    return <div className="slot-empty">Chưa có ca nào.</div>;
  }
  return (
    <div className="slot-grid">
      {slots.map((s) => {
        const isCurrent = s.slotId === currentBookingId;
        const fullOrConflict = (s.remaining <= 0 && !isCurrent) || (disabledIf?.(s) ?? false);
        const isSelected = s.slotId === selectedId;
        const conflictReason = disabledIf?.(s) ? disabledReason : null;
        const remainingClass =
          s.remaining <= 0
            ? 'danger'
            : s.remaining <= Math.max(2, Math.floor(s.capacity * 0.25))
              ? 'warn'
              : '';
        return (
          <label
            key={s.slotId}
            className={`slot ${isSelected ? 'selected' : ''} ${fullOrConflict ? 'disabled' : ''}`}
          >
            <input
              type="radio"
              name={`slot-${slots[0].type}`}
              checked={isSelected}
              disabled={fullOrConflict}
              onChange={() => onSelect(s.slotId)}
            />
            <div className="slot-date">
              {formatDateVi(s.date)} · {minToHHmm(s.startMin)}–{minToHHmm(s.endMin)}
              {s.session && <span className="slot-badge">{s.session}</span>}
            </div>
            {s.location && <div className="slot-time">📍 {s.location}</div>}
            <div className={`slot-remaining ${remainingClass}`}>
              {conflictReason
                ? conflictReason
                : s.remaining <= 0
                  ? isCurrent
                    ? 'Ca hiện tại của bạn'
                    : 'Hết chỗ'
                  : `Còn ${s.remaining}/${s.capacity} chỗ${isCurrent ? ' · đang chọn' : ''}`}
            </div>
          </label>
        );
      })}
    </div>
  );
}

function sortByDateStart(a: Slot, b: Slot): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.startMin - b.startMin;
}

// ── ErrorBoundary ────────────────────────────────────────────────────────

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App crashed:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app">
          <div className="error-screen">
            <h2>Ứng dụng gặp lỗi</h2>
            <p>{this.state.error.message || 'Lỗi không xác định.'}</p>
            <button className="primary" onClick={() => window.location.reload()}>
              Tải lại
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

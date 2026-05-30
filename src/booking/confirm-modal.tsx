import { useState } from 'react';
import { Modal } from '../components/modal';
import { SlotCard } from './slot-card';
import { type Step1Data, type Selection } from './booking-utils';
import { type Slot } from '../lib/types';

// ─── Confirm Modal ────────────────────────────────────────────────────────

export function ConfirmModal({
  step1,
  slots,
  selection,
  isEditing,
  maxChanges,
  changeCount,
  onCancel,
  onConfirm,
}: {
  step1: Step1Data;
  slots: Slot[];
  selection: Selection;
  isEditing: boolean;
  maxChanges: number;
  changeCount: number;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const changesLeft = Math.max(0, maxChanges - changeCount);
  const sp = slots.find((s) => s.slotId === selection.speakingId);
  const sk = slots.find((s) => s.slotId === selection.skillsId);

  async function handleConfirm() {
    setSubmitting(true);
    await onConfirm();
    // If onConfirm redirects screen, this component unmounts — setSubmitting(false) is no-op
    setSubmitting(false);
  }

  return (
    <Modal
      title={isEditing ? 'Xác nhận đổi ca' : 'Xác nhận đăng ký'}
      subtitle="Vui lòng kiểm tra kỹ trước khi gửi. Sau đăng ký bạn vẫn có thể đổi ca."
      onClose={onCancel}
      footer={
        <>
          <button className="btn ghost" onClick={onCancel} disabled={submitting}>
            ← Quay lại sửa
          </button>
          <button
            className={`btn ${submitting ? 'disabled' : ''}`}
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="dots">
                  <span />
                  <span />
                  <span />
                </span>
                Đang gửi...
              </>
            ) : isEditing ? (
              'Xác nhận đổi ca'
            ) : (
              'Xác nhận đăng ký'
            )}
          </button>
        </>
      }
    >
      <div className="sec-title">
        <span className="dot"><svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><circle cx="5" cy="3.2" r="2"/><path d="M1 9c0-2.2 1.8-3.8 4-3.8s4 1.6 4 3.8"/></svg></span>Học viên
      </div>
      <div
        style={{
          background: 'var(--ink-25)',
          padding: 'var(--s-3) var(--s-4)',
          borderRadius: 'var(--r-md)',
          marginBottom: 'var(--s-4)',
        }}
      >
        <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{step1.fullName}</div>
        <div className="text-sm text-muted mt-1">
          Mã NV: <b style={{ color: 'var(--ink-800)' }}>{step1.empCode}</b> · BU:{' '}
          <b style={{ color: 'var(--ink-800)' }}>{step1.bu}</b>
        </div>
      </div>

      <div className="sec-title">
        <span className="dot accent"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><rect x="1" y="1.5" width="8" height="7.5" rx="1.2"/><line x1="3" y1="0.5" x2="3" y2="2.5"/><line x1="7" y1="0.5" x2="7" y2="2.5"/><line x1="1" y1="4" x2="9" y2="4"/></svg></span>2 ca thi đã chọn
      </div>
      <div className="col mb-4" style={{ gap: 'var(--s-2)' }}>
        {sp && <SlotCard slot={sp} index={1} />}
        {sk && <SlotCard slot={sk} index={2} />}
      </div>

      <div className="banner warn">
        <span className="banner-icon">⚠</span>
        <div>
          <b>Sau khi {isEditing ? 'đổi' : 'đăng ký'}</b> bạn còn <b>{changesLeft} lần đổi ca</b>. Hết quota sẽ phải liên hệ BTC.
        </div>
      </div>
    </Modal>
  );
}

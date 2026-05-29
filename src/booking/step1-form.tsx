import { useState } from 'react';
import { Stepper } from './booking-chrome';
import { BU_LIST, toUpperNoAccent, type Step1Data } from './booking-utils';
import { checkIneligibility } from '../lib/db';

// ─── Step 1 · Info Form ───────────────────────────────────────────────────

export function Step1Form({
  initial,
  onContinue,
  onCancel,
}: {
  initial: Step1Data;
  onContinue: (d: Step1Data) => void;
  onCancel?: () => void;
}) {
  const [empCode, setEmpCode] = useState(initial.empCode);
  const [fullName, setFullName] = useState(initial.fullName);
  const [bu, setBu] = useState(initial.bu);
  const [checking, setChecking] = useState(false);
  const [blockErr, setBlockErr] = useState<string | null>(null);

  const empValid = /^\d{6}$/.test(empCode);
  const nameValid = fullName.trim().length >= 2;
  const buValid = BU_LIST.includes(bu);
  const allValid = empValid && nameValid && buValid;
  const validCount = [empValid, nameValid, buValid].filter(Boolean).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allValid || checking) return;
    setBlockErr(null);
    setChecking(true);
    try {
      // Pre-flight blocklist check via Firestore /ineligibility collection.
      // bookDb() enforces the same list server-side as the hard guarantee.
      const reason = await checkIneligibility(empCode);
      if (reason) {
        setBlockErr(reason);
        return;
      }
      onContinue({ empCode, fullName: fullName.trim(), bu });
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <Stepper current={1} />
      <form className="card" onSubmit={handleSubmit}>
        <div className="card-hd">
          <div className="card-title">Thông tin học viên</div>
          <div className="card-sub">
            Điền chính xác để hệ thống xác nhận eligibility trước khi chọn ca thi.
          </div>
        </div>
        <div className="card-bd">
          <div className="field">
            <label className="label" htmlFor="empCode">
              Mã nhân viên <span className="req">*</span>
              <span className="opt">· 6 chữ số</span>
            </label>
            <input
              id="empCode"
              className={`input ${empCode && !empValid ? 'error' : ''}`}
              placeholder="VD: 262010"
              value={empCode}
              onChange={(e) => { setEmpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setBlockErr(null); }}
              inputMode="numeric"
              maxLength={6}
              autoFocus
            />
            {empCode && !empValid && <span className="help error">⚠ Mã NV phải có đúng 6 chữ số</span>}
            {empValid && <span className="help success">✓ Hợp lệ</span>}
          </div>

          <div className="field">
            <label className="label" htmlFor="fullName">
              Họ và tên <span className="req">*</span>
            </label>
            <input
              id="fullName"
              className="input"
              placeholder="NGUYEN VAN AN"
              value={fullName}
              onChange={(e) => setFullName(toUpperNoAccent(e.target.value))}
              maxLength={50}
              style={{ textTransform: 'uppercase' }}
            />
            <span className="help">Không dấu, in hoa · Đúng theo tên trên hệ thống nhân sự</span>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="bu">
              Business Unit (BU) <span className="req">*</span>
            </label>
            <select
              id="bu"
              className="input"
              value={bu}
              onChange={(e) => setBu(e.target.value)}
            >
              <option value="">— Chọn BU —</option>
              {BU_LIST.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          {blockErr && (
            <div className="banner danger" style={{ marginTop: 'var(--s-4)' }}>
              <span className="banner-icon">⛔</span>
              <div>
                <b>Không thể tiếp tục.</b> {blockErr}
              </div>
            </div>
          )}
        </div>
        <div className="card-ft">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {onCancel && (
              <button type="button" className="btn ghost sm" onClick={onCancel}>
                ← Hủy
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="text-xs text-muted">{validCount}/3 trường hợp lệ</span>
            <button
              type="submit"
              className={`btn ${allValid && !checking ? '' : 'disabled'}`}
              disabled={!allValid || checking}
            >
              {checking ? (
                <>
                  <span className="dots">
                    <span />
                    <span />
                    <span />
                  </span>
                  Đang kiểm tra...
                </>
              ) : (
                'Tiếp tục →'
              )}
            </button>
          </div>
        </div>
      </form>

      <div className="banner info mt-4">
        <span className="banner-icon">ⓘ</span>
        <div>
          <b>Sau khi đăng ký:</b> Bạn có thể đổi ca tối đa <b>3 lần</b> trước hạn chót. Liên hệ BTC
          Assessment nếu cần hỗ trợ.
        </div>
      </div>
    </>
  );
}

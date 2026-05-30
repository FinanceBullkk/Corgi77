import { useEffect, useState } from 'react';
import { updateConfig } from '../lib/adminDb';
import { useToast } from '../confirm-toast-provider';
import { type ConfigState } from './admin-utils';

// ── Config ──────────────────────────────────────────────────────────────────

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ConfigTab({
  adminEmail, cfg, onReload,
}: { adminEmail: string; cfg: ConfigState; onReload: () => void }) {
  const [allowEnrollment, setAllowEnrollment] = useState(cfg.allowEnrollment);
  const [maxChanges, setMaxChanges] = useState(cfg.maxChanges);
  const [deadline, setDeadline] = useState(cfg.deadline ? toLocalInputValue(cfg.deadline) : '');
  const [emailConfirm, setEmailConfirm] = useState(cfg.emailConfirm);
  const [adminEmails, setAdminEmails] = useState(cfg.adminEmails.join('\n'));
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const toast = useToast();

  // Sync local state when cfg prop changes (after onReload fetches fresh config)
  useEffect(() => {
    setAllowEnrollment(cfg.allowEnrollment);
    setMaxChanges(cfg.maxChanges);
    setDeadline(cfg.deadline ? toLocalInputValue(cfg.deadline) : '');
    setEmailConfirm(cfg.emailConfirm);
    setAdminEmails(cfg.adminEmails.join('\n'));
    setDirty(false);
  }, [cfg]);

  const markDirty = () => setDirty(true);

  const clearDeadline = () => { setDeadline(''); setDirty(true); };

  const stepMaxChanges = (delta: number) => {
    const v = Math.max(0, Math.min(99, maxChanges + delta));
    setMaxChanges(v);
    setDirty(true);
  };

  const save = async () => {
    const mc = maxChanges;
    if (isNaN(mc) || mc < 0) { toast('error', 'Số lần đổi phải là số ≥ 0'); return; }
    const extraAdmins = adminEmails.split(/[\n,]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    setBusy(true);
    try {
      await updateConfig(adminEmail, {
        allowEnrollment,
        maxChanges: mc,
        deadline: deadline ? new Date(deadline) : null,
        emailConfirm,
        adminEmails: extraAdmins,
      });
      setSavedAt(new Date().toLocaleTimeString('vi-VN'));
      setDirty(false);
      onReload();
      toast('success', 'Đã lưu cấu hình.');
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-hd">
        <h1>Cấu hình hệ thống</h1>
        <p className="sub">Điều khiển đăng ký, thông báo và phân quyền cho kỳ Assessment Q2 2026.</p>
      </div>

      {/* Group 1 · Đăng ký & Đổi ca */}
      <section className="card set-group">
        <div className="set-group-hd">
          <span className="gi" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h9A1.5 1.5 0 0 1 14 4.5v7A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7Z" stroke="currentColor" strokeWidth="1.3"/><path d="M2 6.5h12M5 3v2M11 3v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
          </span>
          <div>
            <div className="gt">Đăng ký & Đổi ca</div>
            <div className="gs">Quy tắc cho phép nhân viên đăng ký và thay đổi ca thi.</div>
          </div>
        </div>

        <div className="set-row">
          <div className="set-info">
            <div className="set-label">Cho phép đăng ký mới / sửa ca</div>
            <div className="set-desc">Khi tắt, user không thể đăng ký hoặc đổi ca nữa nhưng vẫn xem được booking đã có.</div>
          </div>
          <div className="set-control">
            <label className="switch">
              <input type="checkbox" checked={allowEnrollment} onChange={(e) => { setAllowEnrollment(e.target.checked); markDirty(); }} />
              <span className="track"></span>
              <span className="state-txt">{allowEnrollment ? 'Bật' : 'Tắt'}</span>
            </label>
          </div>
        </div>

        <div className="set-row">
          <div className="set-info">
            <div className="set-label">Số lần được đổi ca</div>
            <div className="set-desc">Mỗi user được đổi ca tối đa bấy nhiêu lần sau khi đã đăng ký.</div>
          </div>
          <div className="set-control">
            <div className="stepper-num">
              <button type="button" onClick={() => stepMaxChanges(-1)} aria-label="Giảm">−</button>
              <input type="text" inputMode="numeric" value={maxChanges} onChange={(e) => { const v = parseInt(e.target.value.replace(/\D/g, '').slice(0, 2), 10) || 0; setMaxChanges(v); markDirty(); }} />
              <button type="button" onClick={() => stepMaxChanges(1)} aria-label="Tăng">+</button>
            </div>
            <span className="text-sm text-muted">lần / user</span>
          </div>
        </div>

        <div className="set-row">
          <div className="set-info">
            <div className="set-label">Hạn đăng ký (deadline)</div>
            <div className="set-desc">Theo múi giờ thiết bị của bạn. Để trống = không giới hạn thời gian đăng ký.</div>
          </div>
          <div className="set-control">
            <input className="input dt" type="datetime-local" value={deadline} onChange={(e) => { setDeadline(e.target.value); markDirty(); }} />
            <button className="btn-link" type="button" onClick={clearDeadline}>Xoá</button>
          </div>
        </div>
      </section>

      {/* Group 2 · Email & Thông báo */}
      <section className="card set-group">
        <div className="set-group-hd">
          <span className="gi" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h9A1.5 1.5 0 0 1 14 4.5v7A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7Z" stroke="currentColor" strokeWidth="1.3"/><path d="m2.5 4.5 5.5 4 5.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <div>
            <div className="gt">Email & Thông báo</div>
            <div className="gs">Email tự động gửi cho nhân viên sau khi thao tác.</div>
          </div>
        </div>

        <div className="set-row">
          <div className="set-info">
            <div className="set-label">Gửi email xác nhận sau khi đăng ký</div>
            <div className="set-desc">Cần cài extension <code>firestore-send-email</code> trong Firebase. Email được ghi vào collection <code>/mail</code>.</div>
          </div>
          <div className="set-control">
            <label className="switch">
              <input type="checkbox" checked={emailConfirm} onChange={(e) => { setEmailConfirm(e.target.checked); markDirty(); }} />
              <span className="track"></span>
              <span className="state-txt">{emailConfirm ? 'Bật' : 'Tắt'}</span>
            </label>
          </div>
        </div>
      </section>

      {/* Group 3 · Phân quyền Admin */}
      <section className="card set-group">
        <div className="set-group-hd">
          <span className="gi" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2 3 4v3.5c0 3 2.1 5.2 5 6.5 2.9-1.3 5-3.5 5-6.5V4L8 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="m6 8 1.5 1.5L10.5 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <div>
            <div className="gt">Phân quyền Admin</div>
            <div className="gs">Cấp quyền admin không cần deploy lại.</div>
          </div>
        </div>

        <div className="set-row stacked">
          <div className="set-info">
            <div className="set-label">Admin email bổ sung</div>
            <div className="set-desc">Mỗi dòng 1 email. Những tài khoản này sẽ có toàn quyền admin.</div>
          </div>
          <textarea
            className="input textarea"
            value={adminEmails}
            onChange={(e) => { setAdminEmails(e.target.value); markDirty(); }}
            spellCheck={false}
            placeholder="admin1@cyberlogitec.com&#10;admin2@cyberlogitec.com"
          />
        </div>

        <div className="set-row stacked" style={{ paddingTop: 0 }}>
          <div className="set-info">
            <div className="set-label" style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-600)' }}>Admin mặc định (hardcoded)</div>
            <div className="set-desc">Luôn có quyền, không thể gỡ ở đây.</div>
            <div className="admin-chips">
              <span className="admin-chip"><span className="dot">P</span>phuc.lnk <span className="lock">🔒</span></span>
              <span className="admin-chip"><span className="dot">A</span>anhhao.dl108 <span className="lock">🔒</span></span>
            </div>
          </div>
        </div>
      </section>

      {/* Sticky save bar */}
      <div className="save-bar">
        <div className="save-bar-inner">
          <div className={`save-status${dirty ? ' dirty' : ''}`}>
            <span className="sdot"></span>
            <span>{dirty ? 'Có thay đổi chưa lưu' : savedAt ? `Đã lưu · cập nhật gần nhất ${savedAt}` : 'Chưa có thay đổi'}</span>
          </div>
          <div className="row" style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" type="button" disabled={!dirty} onClick={() => { setAllowEnrollment(cfg.allowEnrollment); setMaxChanges(cfg.maxChanges); setDeadline(cfg.deadline ? toLocalInputValue(cfg.deadline) : ''); setEmailConfirm(cfg.emailConfirm); setAdminEmails(cfg.adminEmails.join('\n')); setDirty(false); }}>Hoàn tác</button>
            <button className="btn" type="button" onClick={save} disabled={busy || !dirty}>
              {busy ? <><span className="spinner" /> Đang lưu…</> : 'Lưu cấu hình'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

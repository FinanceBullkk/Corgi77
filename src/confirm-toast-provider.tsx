import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: string; kind: ToastKind; text: string };

export type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

type ConfirmRequest = ConfirmOptions & { id: string; resolve: (ok: boolean) => void };

type Ctx = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  toast: (kind: ToastKind, text: string) => void;
};

const ConfirmContext = createContext<Ctx | null>(null);

function uid(): string {
  return Math.random().toString(36).slice(2);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [req, setReq] = useState<ConfirmRequest | null>(null);

  const toast = useCallback((kind: ToastKind, text: string) => {
    const id = uid();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setReq({ ...opts, id: uid(), resolve });
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    setReq((cur) => {
      if (cur) cur.resolve(ok);
      return null;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm, toast }}>
      {children}
      {req && <ConfirmDialog req={req} onClose={close} />}
      {toasts.length > 0 && (
        <div className="toast-stack" role="region" aria-live="polite" aria-label="Thông báo">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`} role="status">
              {t.text}
            </div>
          ))}
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ req, onClose }: { req: ConfirmRequest; onClose: (ok: boolean) => void }) {
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(false);
      else if (e.key === 'Enter') onClose(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={() => onClose(false)}>
      <div
        className="modal"
        style={{ maxWidth: 420 }}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={req.title}
      >
        <div className="modal-hd">
          <div className="modal-title">{req.title}</div>
        </div>
        {req.message != null && (
          <div className="modal-bd" style={{ whiteSpace: 'pre-line' }}>
            {req.message}
          </div>
        )}
        <div className="modal-ft">
          <button className="btn ghost" onClick={() => onClose(false)}>
            {req.cancelText ?? 'Huỷ'}
          </button>
          <button
            ref={okRef}
            className={`btn${req.danger ? ' danger' : ''}`}
            onClick={() => onClose(true)}
          >
            {req.confirmText ?? 'Xác nhận'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx.confirm;
}

export function useToast() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useToast must be used within ConfirmProvider');
  return ctx.toast;
}

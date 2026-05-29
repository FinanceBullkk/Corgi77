import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DotsIcon } from './admin-icons';

// ── Row menu ────────────────────────────────────────────────────────────────

export type MenuItem = { label: string; onClick: () => void; danger?: boolean } | 'div';

export function RowMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div className="rowmenu-wrap" ref={ref}>
      <button type="button" className="icon-act" aria-label="Tác vụ" onClick={() => setOpen((o) => !o)}>
        <DotsIcon />
      </button>
      {open && (
        <div className="rowmenu">
          {items.map((it, i) =>
            it === 'div' ? (
              <div key={i} className="div" />
            ) : (
              <button key={i} type="button" className={it.danger ? 'danger' : ''} onClick={() => { setOpen(false); it.onClick(); }}>
                {it.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ── Generic drawer chrome ─────────────────────────────────────────────────────

export function Drawer({
  title, sub, cta, busy, onClose, onSave, children,
}: {
  title: string; sub?: string; cta: string; busy?: boolean; onClose: () => void; onSave: () => void; children: ReactNode;
}) {
  return (
    <div className="drawer-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer">
        <div className="drawer-hd">
          <div>
            <div className="dt">{title}</div>
            {sub && <div className="ds">{sub}</div>}
          </div>
          <button type="button" className="drawer-x" aria-label="Đóng" onClick={onClose}>×</button>
        </div>
        <div className="drawer-bd">{children}</div>
        <div className="drawer-ft">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Đóng</button>
          <button type="button" className="btn" onClick={onSave} disabled={busy}>{busy ? 'Đang lưu…' : cta}</button>
        </div>
      </div>
    </div>
  );
}

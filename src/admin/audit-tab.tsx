import { useEffect, useMemo, useState } from 'react';
import { listAuditLogs, type AuditEntry } from '../lib/audit';
import { type Slot } from '../lib/types';
import { slotLabel } from './admin-utils';
import { SearchIcon } from './admin-icons';

// ── Audit Log (human-readable) ────────────────────────────────────────────────

type AuditEvClass = 'create' | 'update' | 'cancel' | 'block' | 'config';

interface AuditView {
  evClass: AuditEvClass;
  evLabel: string;
  subject: string;
  meta?: string;
  diffs: { k: string; from?: string | null; to?: string | null }[];
  note?: string;
}

function buildAuditView(l: AuditEntry, slotMap: Map<string, Slot>): AuditView {
  const d = l.detail as Record<string, any>;
  const sl = (id: unknown) => slotLabel(slotMap, typeof id === 'string' ? id : null);
  switch (l.event) {
    case 'book.create':
      return {
        evClass: 'create', evLabel: 'Tạo đăng ký',
        subject: d.fullName || d.empCode || '',
        diffs: [
          ...(d.speakingSlotId ? [{ k: 'Speaking', to: sl(d.speakingSlotId) }] : []),
          ...(d.skillsSlotId ? [{ k: '3 Skills', to: sl(d.skillsSlotId) }] : []),
        ],
      };
    case 'book.update': {
      const diffs: AuditView['diffs'] = [];
      if (d.prevSpeakingSlotId !== d.speakingSlotId) diffs.push({ k: 'Speaking', from: sl(d.prevSpeakingSlotId), to: sl(d.speakingSlotId) });
      if (d.prevSkillsSlotId !== d.skillsSlotId) diffs.push({ k: '3 Skills', from: sl(d.prevSkillsSlotId), to: sl(d.skillsSlotId) });
      return {
        evClass: 'update', evLabel: 'Sửa đăng ký',
        subject: d.fullName || d.empCode || '',
        meta: d.changeCount != null ? `Lần đổi #${d.changeCount}` : undefined,
        diffs,
      };
    }
    case 'book.cancel':
      return { evClass: 'cancel', evLabel: 'Huỷ đăng ký', subject: d.fullName || d.empCode || l.email, diffs: [] };
    case 'book.rejected.blocked':
      return { evClass: 'block', evLabel: 'Bị chặn (không đủ điều kiện)', subject: d.empCode || l.email, diffs: [], note: d.reason };
    case 'admin.createSlot':
      return { evClass: 'create', evLabel: 'Tạo ca thi', subject: d.slotId || '', diffs: [] };
    case 'admin.deleteSlot':
      return { evClass: 'cancel', evLabel: 'Xoá ca thi', subject: d.slotId || '', diffs: [] };
    case 'admin.updateSlot':
      return {
        evClass: 'update', evLabel: 'Sửa ca thi', subject: d.slotId || '',
        diffs: d.updates ? Object.entries(d.updates).map(([k, v]) => ({ k, to: String(v) })) : [],
      };
    case 'admin.deleteRegistration':
      return { evClass: 'cancel', evLabel: 'Xoá đăng ký (admin)', subject: d.fullName || d.targetEmail || '', diffs: [] };
    case 'admin.upsertIneligibility':
      return { evClass: 'block', evLabel: 'Thêm vào danh sách chặn', subject: d.empCode || '', diffs: [], note: d.reason };
    case 'admin.deleteIneligibility':
      return { evClass: 'cancel', evLabel: 'Gỡ khỏi danh sách chặn', subject: d.empCode || '', diffs: [] };
    case 'admin.updateConfig':
      return { evClass: 'config', evLabel: 'Cập nhật cấu hình', subject: '', diffs: [] };
    default:
      return { evClass: 'config', evLabel: l.event, subject: '', diffs: Object.keys(d).length ? [{ k: 'detail', to: JSON.stringify(d) }] : [] };
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const dd = Math.floor(h / 24);
  return `${dd} ngày trước`;
}

export function AuditTab({ slots }: { slots: Slot[] }) {
  const [logs, setLogs] = useState<AuditEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | AuditEvClass>('all');

  const slotMap = useMemo(() => new Map(slots.map((s) => [s.slotId, s])), [slots]);

  useEffect(() => {
    listAuditLogs(500).then(setLogs).catch((e: Error) => setErr(e.message));
  }, []);

  const rows = useMemo(() => {
    if (!logs) return [];
    const needle = q.trim().toLowerCase();
    return logs
      .map((l) => ({ l, v: buildAuditView(l, slotMap) }))
      .filter(({ l, v }) => {
        if (filter !== 'all' && v.evClass !== filter) return false;
        if (!needle) return true;
        return (`${l.email} ${v.subject} ${v.evLabel} ${v.note ?? ''}`).toLowerCase().includes(needle);
      });
  }, [logs, slotMap, q, filter]);

  if (err) return <div className="panel"><p style={{ color: 'var(--danger)', padding: 'var(--s-5)' }}>{err}</p></div>;
  if (!logs) return <div className="panel"><div className="loading" style={{ padding: 'var(--s-6)' }}><span className="spinner" /> Đang tải…</div></div>;

  const FILTERS: [('all' | AuditEvClass), string][] = [['all', 'Tất cả'], ['create', 'Tạo'], ['update', 'Sửa'], ['cancel', 'Huỷ'], ['block', 'Chặn']];

  return (
    <div className="panel">
      <div className="toolbar">
        <div className="filter-chips">
          {FILTERS.map(([v, l]) => <button key={v} type="button" className={filter === v ? 'active' : ''} onClick={() => setFilter(v)}>{l}</button>)}
        </div>
        <div className="search"><SearchIcon /><input type="text" placeholder="Tìm email, mã NV, tên…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="spacer" />
        <span className="text-sm text-muted">{rows.length} thao tác</span>
      </div>
      <div className="aud-list">
        {rows.map(({ l, v }) => (
          <div className="aud-row" key={l.id}>
            <div className="aud-when">
              {l.timestamp ? new Date(l.timestamp).toLocaleString('vi-VN') : '—'}
              <span className="ago">{timeAgo(l.timestamp)}</span>
            </div>
            <div className="aud-main">
              <div className="aud-head">
                <span className={`aud-ev ${v.evClass}`}>{v.evLabel}</span>
                {v.subject && <span className="aud-subject">{v.subject}</span>}
                <span className="aud-actor">· bởi {l.email}</span>
                {v.meta && <span className="aud-actor">· {v.meta}</span>}
              </div>
              {v.diffs.length > 0 && (
                <div className="aud-diffs">
                  {v.diffs.map((diff, i) => (
                    <div className="aud-diff" key={i}>
                      <span className="dk">{diff.k}</span>
                      {diff.from && <><span className="from tnum">{diff.from}</span><span className="arrow">→</span></>}
                      <span className="to tnum">{diff.to}</span>
                    </div>
                  ))}
                </div>
              )}
              {v.note && <div className="aud-note">{v.note}</div>}
            </div>
          </div>
        ))}
      </div>
      {rows.length === 0 && <div className="empty-state"><div className="es-title">Không có thao tác nào</div></div>}
    </div>
  );
}

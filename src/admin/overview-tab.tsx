import { formatDateVi, type Slot } from '../lib/types';
import { type Registration } from '../lib/adminDb';
import { dowVi } from './admin-utils';

// ── Overview ──────────────────────────────────────────────────────────────────

export function Overview({ slots, regs, allowEnrollment }: { slots: Slot[]; regs: Registration[]; allowEnrollment: boolean }) {
  const sp = slots.filter((s) => s.type === 'Speaking');
  const sk = slots.filter((s) => s.type === '3 Skills');
  const sum = (arr: Slot[], k: 'capacity' | 'remaining') => arr.reduce((a, s) => a + s[k], 0);
  const spCap = sum(sp, 'capacity'), skCap = sum(sk, 'capacity');
  const spBooked = spCap - sum(sp, 'remaining'), skBooked = skCap - sum(sk, 'remaining');
  const spPct = spCap ? Math.round((spBooked / spCap) * 100) : 0;
  const skPct = skCap ? Math.round((skBooked / skCap) * 100) : 0;
  const freeSp = spCap - spBooked, freeSk = skCap - skBooked;

  const days = [...new Set(slots.map((s) => s.date))].sort();
  const byDay = days.map((d) => {
    const ds = slots.filter((s) => s.date === d);
    const cap = sum(ds, 'capacity');
    const booked = cap - sum(ds, 'remaining');
    return { d, dow: dowVi(d), cap, booked, pct: cap ? Math.round((booked / cap) * 100) : 0 };
  });

  return (
    <>
      <div className="statbar">
        <div className="stat"><div className="k">Tổng đăng ký</div><div className="v">{regs.length}</div><div className="ctx">trên {spCap + skCap} suất khả dụng</div></div>
        <div className="stat"><div className="k">Lấp đầy Speaking</div><div className="v">{spPct}<small>%</small></div><div className="ctx"><span className="mini-bar"><span className="mini-fill" style={{ width: `${spPct}%` }} /></span>{spBooked}/{spCap}</div></div>
        <div className="stat accent"><div className="k">Lấp đầy 3 Skills</div><div className="v">{skPct}<small>%</small></div><div className="ctx"><span className="mini-bar"><span className="mini-fill" style={{ width: `${skPct}%` }} /></span>{skBooked}/{skCap}</div></div>
        <div className="stat"><div className="k">Suất còn trống</div><div className="v">{freeSp + freeSk}</div><div className="ctx">{freeSp} Speaking · {freeSk} 3 Skills</div></div>
      </div>
      <div className="panel">
        <div className="panel-hd"><span className="pt">Lấp đầy theo ngày</span><span className="text-sm text-muted">{days.length} ngày thi</span></div>
        <div style={{ padding: 'var(--s-2) var(--s-5) var(--s-4)' }}>
          {byDay.length === 0 && <div className="empty-state"><div className="es-title">Chưa có ca thi nào</div></div>}
          {byDay.map((b) => (
            <div key={b.d} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)', padding: 'var(--s-3) 0', borderBottom: '1px solid var(--ink-100)' }}>
              <div style={{ width: 110, flexShrink: 0 }}><span className="strong">{b.dow}</span> <span className="text-sm text-muted">{formatDateVi(b.d)}</span></div>
              <div className="cap-track" style={{ maxWidth: 'none', flex: 1, height: 9 }}><span className={`cap-fill${b.pct >= 100 ? ' full' : b.pct >= 75 ? ' warn' : ''}`} style={{ width: `${b.pct}%` }} /></div>
              <div className="cap-num" style={{ width: 110, textAlign: 'right' }}><b>{b.booked}</b>/{b.cap} <span className="text-muted">({b.pct}%)</span></div>
            </div>
          ))}
        </div>
      </div>
      {!allowEnrollment && (
        <div className="banner warn" style={{ marginTop: 'var(--s-5)' }}><div>Đăng ký đang <b>tắt</b> — tất cả ca hiển thị trạng thái "Đã đóng" với user.</div></div>
      )}
    </>
  );
}

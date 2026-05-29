// ─────────────────────────────────────────────────────────────────────────
// Admin Panel · app (vanilla) — sidebar shell + tab views
// ─────────────────────────────────────────────────────────────────────────

const IC = {
  overview: '<svg class="ni-ic" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="11" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.5"/></svg>',
  bookings: '<svg class="ni-ic" viewBox="0 0 20 20" fill="none"><path d="M3 5.5h14M3 10h14M3 14.5h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  slots: '<svg class="ni-ic" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M3 8h14M7 2.5v3M13 2.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  blocks: '<svg class="ni-ic" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/><path d="m5.5 5.5 9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  config: '<svg class="ni-ic" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/><path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  audit: '<svg class="ni-ic" viewBox="0 0 20 20" fill="none"><path d="M10 5v5l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/></svg>',
  search: '<svg viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.4"/><path d="m11 11 3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  dots: '<svg viewBox="0 0 18 18" fill="currentColor"><circle cx="9" cy="4" r="1.5"/><circle cx="9" cy="9" r="1.5"/><circle cx="9" cy="14" r="1.5"/></svg>',
};

const NAV = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'bookings', label: 'Đăng ký' },
  { id: 'slots',    label: 'Ca thi' },
  { id: 'blocks',   label: 'Danh sách chặn' },
  { id: 'config',   label: 'Cấu hình' },
  { id: 'audit',    label: 'Audit' },
];

const S = {
  tab: 'slots',
  q: {},                      // search text per tab
  slotFilter: 'all',          // all|sp|sk
  slotDay: 'all',
  bookingBU: 'all',
  auditFilter: 'all',
  selSlots: new Set(),
  selBookings: new Set(),
  openMenu: null,
  drawer: null,
  cfg: { open: true, changes: 3, deadline: '2026-06-02T22:00', email: false, dirty: false },
};

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ─── Date / time helpers (slot editing) ────────────────────────────────────
function dmToIso(dm) { const [d, m] = dm.split('/'); return `2026-${m}-${d}`; }
function isoToDm(iso) { const [, m, d] = iso.split('-'); return `${d}/${m}`; }
function dowOf(iso) { const wd = new Date(iso + 'T00:00:00').getDay(); return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][wd]; }
function addMin(hhmm, mins) { const [h, m] = hhmm.split(':').map(Number); const t = h * 60 + m + mins; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }

// ─── Shell ─────────────────────────────────────────────────────────────────
function render() {
  const t = aTotals();
  const counts = { bookings: t.bookings, slots: t.slots, blocks: t.blocks };
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="admin-shell">
      <aside class="sidebar">
        <div class="side-brand">
          <span class="mark">C7</span>
          <span class="wm"><span class="t">Corgi7 Admin</span><span class="s">${esc(KỲ)}</span></span>
        </div>
        <div class="side-section">Quản trị</div>
        <nav class="side-nav">
          ${NAV.map(n => `
            <button class="nav-item ${S.tab === n.id ? 'active' : ''}" data-act="nav" data-tab="${n.id}">
              ${IC[n.id]}
              <span class="ni-label">${n.label}</span>
              ${counts[n.id] != null ? `<span class="ni-count">${counts[n.id]}</span>` : ''}
            </button>`).join('')}
        </nav>
        <div class="side-foot">
          <button class="side-back" data-act="user-site"><span>← Về trang User</span></button>
          <div class="side-user">
            <span class="av">AH</span>
            <span class="uu"><span class="n">anhhao.dl108</span><span class="r">Admin</span></span>
          </div>
        </div>
      </aside>
      <div class="main">
        ${renderHeader()}
        <div class="content" id="content">${renderTab()}</div>
      </div>
    </div>
    <div id="toast-stack" class="toast-stack"></div>
    <div id="drawer-root"></div>`;
  if (S.drawer) renderDrawer();
  // re-apply search filter after structural render
  applySearch();
}

function headerMeta() {
  return {
    overview: { t: 'Tổng quan', s: `Tình hình đăng ký · ${KỲ}`, action: '' },
    bookings: { t: 'Đăng ký', s: 'Danh sách nhân viên đã đăng ký ca thi', action: `<button class="btn ghost sm" data-act="export">Xuất CSV</button>` },
    slots:    { t: 'Ca thi', s: 'Quản lý slot · phòng · sức chứa', action: `<button class="btn sm" data-act="add-slot">+ Thêm ca</button>` },
    blocks:   { t: 'Danh sách chặn', s: 'Nhân viên không đủ điều kiện đăng ký', action: `<button class="btn sm" data-act="add-block">+ Thêm empCode</button>` },
    config:   { t: 'Cấu hình', s: 'Đăng ký · thông báo · phân quyền', action: '' },
    audit:    { t: 'Audit log', s: 'Lịch sử thao tác · immutable', action: '' },
  }[S.tab];
}
function renderHeader() {
  const m = headerMeta();
  return `<header class="main-hd">
    <div class="titles"><h1>${m.t}</h1><div class="sub">${m.s}</div></div>
    <div class="acts">${m.action}<button class="btn ghost sm" data-act="reload">↻ Tải lại</button></div>
  </header>`;
}

function renderTab() {
  switch (S.tab) {
    case 'overview': return viewOverview();
    case 'bookings': return viewBookings();
    case 'slots':    return viewSlots();
    case 'blocks':   return viewBlocks();
    case 'config':   return viewConfig();
    case 'audit':    return viewAudit();
  }
}

// ─── Overview ────────────────────────────────────────────────────────────
function viewOverview() {
  const t = aTotals();
  const spPct = Math.round(t.spBooked / t.spCap * 100);
  const skPct = Math.round(t.skBooked / t.skCap * 100);
  const freeSp = t.spCap - t.spBooked, freeSk = t.skCap - t.skBooked;
  // fill by day
  const days = [...new Set(A_SLOTS.map(s => s.date))];
  const byDay = days.map(d => {
    const ds = A_SLOTS.filter(s => s.date === d);
    const cap = ds.reduce((a, s) => a + s.cap, 0);
    const booked = ds.reduce((a, s) => a + s.booked, 0);
    return { d, dow: ds[0].dow, cap, booked, pct: Math.round(booked / cap * 100) };
  });
  return `
    <div class="statbar">
      <div class="stat"><div class="k">Tổng đăng ký</div><div class="v">${t.bookings}</div><div class="ctx">trên ${t.spCap + t.skCap} suất khả dụng</div></div>
      <div class="stat"><div class="k">Lấp đầy Speaking</div><div class="v">${spPct}<small>%</small></div><div class="ctx"><span class="mini-bar"><span class="mini-fill" style="width:${spPct}%"></span></span>${t.spBooked}/${t.spCap}</div></div>
      <div class="stat accent"><div class="k">Lấp đầy 3 Skills</div><div class="v">${skPct}<small>%</small></div><div class="ctx"><span class="mini-bar"><span class="mini-fill" style="width:${skPct}%"></span></span>${t.skBooked}/${t.skCap}</div></div>
      <div class="stat"><div class="k">Suất còn trống</div><div class="v">${freeSp + freeSk}</div><div class="ctx">${freeSp} Speaking · ${freeSk} 3 Skills</div></div>
    </div>
    <div class="panel">
      <div class="panel-hd"><span class="pt">Lấp đầy theo ngày</span><span class="text-sm text-muted">${days.length} ngày thi</span></div>
      <div style="padding: var(--s-2) var(--s-5) var(--s-4);">
        ${byDay.map(b => `
          <div style="display:flex;align-items:center;gap:var(--s-4);padding:var(--s-3) 0;border-bottom:1px solid var(--ink-100);">
            <div style="width:96px;flex-shrink:0;"><span class="strong">${b.dow}</span> <span class="text-sm text-muted">${b.d}</span></div>
            <div class="cap-track" style="max-width:none;flex:1;height:9px;"><span class="cap-fill" style="width:${b.pct}%"></span></div>
            <div class="cap-num" style="width:90px;text-align:right;"><b>${b.booked}</b>/${b.cap} <span class="text-muted">(${b.pct}%)</span></div>
          </div>`).join('')}
      </div>
    </div>`;
}

// ─── Slots (Ca thi) ────────────────────────────────────────────────────────
function viewSlots() {
  const days = ['all', ...new Set(A_SLOTS.map(s => s.date))];
  let rows = A_SLOTS.filter(s => (S.slotFilter === 'all' || s.type === S.slotFilter) && (S.slotDay === 'all' || s.date === S.slotDay));
  const sel = S.selSlots;
  const allSel = rows.length > 0 && rows.every(r => sel.has(r.id));
  return `
    <div class="panel">
      ${sel.size ? bulkBar(sel.size, 'slots') : `
      <div class="toolbar">
        <div class="filter-chips">
          ${[['all','Tất cả'],['sp','Speaking'],['sk','3 Skills']].map(([v,l]) => `<button class="${S.slotFilter===v?'active':''}" data-act="slotfilter" data-val="${v}">${l}</button>`).join('')}
        </div>
        <select class="select" data-act="slotday">${days.map(d => `<option value="${d}" ${S.slotDay===d?'selected':''}>${d==='all'?'Tất cả ngày':d}</option>`).join('')}</select>
        <div class="search">${IC.search}<input type="text" placeholder="Tìm phòng, giờ, mã ca…" data-search value="${esc(S.q.slots||'')}" /></div>
        <div class="spacer"></div>
        <span class="text-sm text-muted">${rows.length} ca</span>
      </div>`}
      <table class="dgrid">
        <thead><tr>
          <th class="cbx-cell"><input type="checkbox" class="cbx" data-act="selall" data-scope="slots" ${allSel?'checked':''} /></th>
          <th>Loại</th><th>Ngày / Giờ</th><th>Phòng</th><th>Sức chứa</th><th>Trạng thái</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.map(s => {
            const st = aSlotStatus(s);
            const pct = Math.round(s.booked / s.cap * 100);
            const fillCls = st === 'full' ? 'full' : st === 'warn' ? 'warn' : (s.type === 'sk' ? 'sk' : '');
            return `<tr data-search="${esc((s.room+' '+s.start+' '+s.end+' '+s.id+' '+aTypeLabel(s.type)).toLowerCase())}" class="${sel.has(s.id)?'selected':''}">
              <td class="cbx-cell"><input type="checkbox" class="cbx" data-act="selrow" data-scope="slots" data-id="${s.id}" ${sel.has(s.id)?'checked':''} /></td>
              <td><span class="typ ${s.type}">${aTypeLabel(s.type)}</span></td>
              <td><span class="strong">${s.date}</span> <span class="text-muted">${s.dow}</span> · <span class="tnum">${s.start}–${s.end}</span></td>
              <td>${s.room ? esc(s.room) : '<span class="empty-dash">—</span>'}</td>
              <td><div class="cap"><span class="cap-track"><span class="cap-fill ${fillCls}" style="width:${pct}%"></span></span><span class="cap-num"><b>${s.booked}</b>/${s.cap}</span></div></td>
              <td><span class="stat-pill ${st}">${aStatusLabel(st)}</span></td>
              <td class="num">${rowMenu(`slots:${s.id}`, [
                { a: 'edit', l: 'Sửa ca' },
                { a: 'dup', l: 'Nhân bản' },
                { a: 'close', l: 'Đóng đăng ký' },
                { div: true },
                { a: 'del', l: 'Xoá ca', danger: true },
              ])}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      ${rows.length === 0 ? emptyState('Không có ca thi nào khớp bộ lọc') : ''}
    </div>`;
}

// ─── Bookings (Đăng ký) ──────────────────────────────────────────────────
function viewBookings() {
  const bus = ['all', ...new Set(A_BOOKINGS.map(b => b.bu))];
  let rows = A_BOOKINGS.filter(b => S.bookingBU === 'all' || b.bu === S.bookingBU);
  const sel = S.selBookings;
  const allSel = rows.length > 0 && rows.every(r => sel.has(r.empCode));
  return `
    <div class="panel">
      ${sel.size ? bulkBar(sel.size, 'bookings') : `
      <div class="toolbar">
        <div class="search">${IC.search}<input type="text" placeholder="Tìm tên, mã NV, email…" data-search value="${esc(S.q.bookings||'')}" /></div>
        <select class="select" data-act="bookingbu">${bus.map(b => `<option value="${b}" ${S.bookingBU===b?'selected':''}>${b==='all'?'Tất cả BU':b}</option>`).join('')}</select>
        <div class="spacer"></div>
        <span class="text-sm text-muted">${rows.length} đăng ký</span>
      </div>`}
      <table class="dgrid">
        <thead><tr>
          <th class="cbx-cell"><input type="checkbox" class="cbx" data-act="selall" data-scope="bookings" ${allSel?'checked':''} /></th>
          <th>Nhân viên</th><th>BU</th><th>Speaking</th><th>3 Skills</th><th class="center">Đổi</th><th>Đăng ký lúc</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.map(b => `
            <tr data-search="${esc((b.name+' '+b.empCode+' '+b.email+' '+b.bu).toLowerCase())}" class="${sel.has(b.empCode)?'selected':''}">
              <td class="cbx-cell"><input type="checkbox" class="cbx" data-act="selrow" data-scope="bookings" data-id="${b.empCode}" ${sel.has(b.empCode)?'checked':''} /></td>
              <td><div class="id-cell"><span class="nm">${esc(b.name)}</span><span class="mt">${b.empCode} · ${esc(b.email)}</span></div></td>
              <td><span class="pill outline">${esc(b.bu)}</span></td>
              <td><span class="tnum">${aSlotLabel(b.sp)}</span></td>
              <td><span class="tnum">${aSlotLabel(b.sk)}</span></td>
              <td class="center"><span class="${b.changes>=3?'strong':''}" style="${b.changes>=3?'color:var(--warn-600)':''}">${b.changes}<span class="text-muted">/3</span></span></td>
              <td class="text-muted tnum">${b.at}</td>
              <td class="num">${rowMenu(`bookings:${b.empCode}`, [
                { a: 'view', l: 'Xem chi tiết' },
                { a: 'edit', l: 'Đổi ca giùm' },
                { a: 'resend', l: 'Gửi lại email' },
                { div: true },
                { a: 'cancel', l: 'Huỷ đăng ký', danger: true },
              ])}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${rows.length === 0 ? emptyState('Chưa có đăng ký nào') : ''}
    </div>`;
}

// ─── Blocks (Danh sách chặn) ───────────────────────────────────────────────
function viewBlocks() {
  const rows = A_BLOCKS;
  return `
    <div class="banner info" style="margin-bottom:var(--s-5);">
      <div>Nhân viên trong danh sách này <b>không đăng ký được</b> kỳ thi. Khi họ nhập mã NV ở Bước 1, hệ thống chặn và hiển thị lý do. Danh sách rỗng = không ai bị chặn.</div>
    </div>
    <div class="panel">
      <div class="toolbar">
        <div class="search">${IC.search}<input type="text" placeholder="Tìm mã NV, lý do…" data-search value="${esc(S.q.blocks||'')}" /></div>
        <div class="spacer"></div>
        <span class="text-sm text-muted">${rows.length} mã bị chặn</span>
      </div>
      <table class="dgrid">
        <thead><tr><th>Mã NV</th><th>Lý do</th><th>Người thêm</th><th>Thời gian</th><th></th></tr></thead>
        <tbody>
          ${rows.map(b => `
            <tr data-search="${esc((b.empCode+' '+b.reason.vn+' '+b.reason.en).toLowerCase())}">
              <td><span class="strong tnum" style="font-size:var(--fs-md);">${b.empCode}</span><div class="text-xs muted">chưa đăng nhập</div></td>
              <td><div class="reason"><div class="vn">${esc(b.reason.vn)}</div><div class="en">${esc(b.reason.en)}</div></div></td>
              <td class="text-sm text-muted">${esc(b.by)}</td>
              <td class="text-muted tnum">${b.at}</td>
              <td class="num">${rowMenu(`blocks:${b.empCode}`, [
                { a: 'edit', l: 'Sửa lý do' },
                { div: true },
                { a: 'unblock', l: 'Gỡ chặn', danger: true },
              ])}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${rows.length === 0 ? emptyState('Không có mã NV nào bị chặn') : ''}
    </div>`;
}

// ─── Audit ─────────────────────────────────────────────────────────────────
function viewAudit() {
  const F = [['all','Tất cả'],['create','Tạo'],['update','Sửa'],['cancel','Huỷ'],['block','Chặn']];
  let rows = A_AUDIT.filter(a => S.auditFilter === 'all' || a.ev === S.auditFilter);
  const evLabel = { create: 'Tạo đăng ký', update: 'Sửa đăng ký', cancel: 'Huỷ đăng ký', block: 'Thêm vào danh sách chặn' };
  return `
    <div class="panel">
      <div class="toolbar">
        <div class="filter-chips">${F.map(([v,l]) => `<button class="${S.auditFilter===v?'active':''}" data-act="auditfilter" data-val="${v}">${l}</button>`).join('')}</div>
        <div class="search">${IC.search}<input type="text" placeholder="Tìm email, mã NV…" data-search value="${esc(S.q.audit||'')}" /></div>
        <div class="spacer"></div>
        <span class="text-sm text-muted">${rows.length} thao tác</span>
      </div>
      <div class="aud-list">
        ${rows.map(a => `
          <div class="aud-row" data-search="${esc((a.actor+' '+a.subject).toLowerCase())}">
            <div class="aud-when">${a.at}<span class="ago">${a.ago}</span></div>
            <div class="aud-main">
              <div class="aud-head">
                <span class="aud-ev ${a.ev}">${evLabel[a.ev]}</span>
                <span class="aud-subject">${esc(a.subject)}</span>
                <span class="aud-actor">· bởi ${esc(a.actor)}</span>
                ${a.meta ? `<span class="aud-actor">· ${esc(a.meta)}</span>` : ''}
              </div>
              ${a.diffs && a.diffs.length ? `<div class="aud-diffs">${a.diffs.map(d => `
                <div class="aud-diff"><span class="dk">${d.k}</span>${d.from ? `<span class="from tnum">${aSlotLabel(d.from)}</span><span class="arrow">→</span>` : ''}<span class="to tnum">${aSlotLabel(d.to)}</span></div>`).join('')}</div>` : ''}
              ${a.note ? `<div class="aud-note">${esc(a.note)}</div>` : ''}
            </div>
          </div>`).join('')}
      </div>
      ${rows.length === 0 ? emptyState('Không có thao tác nào') : ''}
    </div>`;
}

// ─── Config (redesigned settings) ──────────────────────────────────────────
function viewConfig() {
  const c = S.cfg;
  return `
    <section class="card set-group">
      <div class="set-group-hd"><div><div class="gt">Đăng ký &amp; Đổi ca</div><div class="gs">Quy tắc cho phép nhân viên đăng ký và thay đổi ca thi.</div></div></div>
      <div class="set-row">
        <div class="set-info"><div class="set-label">Cho phép đăng ký mới / sửa ca</div><div class="set-desc">Khi tắt, user không thể đăng ký hoặc đổi ca nhưng vẫn xem được booking đã có.</div></div>
        <div class="set-control"><label class="switch"><input type="checkbox" data-act="cfg-toggle" data-key="open" ${c.open?'checked':''} /><span class="track"></span><span class="state-txt">${c.open?'Bật':'Tắt'}</span></label></div>
      </div>
      <div class="set-row">
        <div class="set-info"><div class="set-label">Số lần được đổi ca</div><div class="set-desc">Mỗi user được đổi ca tối đa bấy nhiêu lần sau khi đã đăng ký.</div></div>
        <div class="set-control"><div class="stepper-num"><button data-act="cfg-step" data-d="-1">−</button><input type="text" value="${c.changes}" readonly /><button data-act="cfg-step" data-d="1">+</button></div><span class="text-sm text-muted">lần / user</span></div>
      </div>
      <div class="set-row">
        <div class="set-info"><div class="set-label">Hạn đăng ký (deadline)</div><div class="set-desc">Theo múi giờ thiết bị của bạn. Để trống = không giới hạn.</div></div>
        <div class="set-control"><input class="input dt" type="datetime-local" data-act="cfg-deadline" value="${c.deadline}" /><button class="btn-link" data-act="cfg-cleardl">Xoá</button></div>
      </div>
    </section>
    <section class="card set-group">
      <div class="set-group-hd"><div><div class="gt">Email &amp; Thông báo</div><div class="gs">Email tự động gửi cho nhân viên sau khi thao tác.</div></div></div>
      <div class="set-row">
        <div class="set-info"><div class="set-label">Gửi email xác nhận sau khi đăng ký</div><div class="set-desc">Cần cài extension <code>firestore-send-email</code> trong Firebase. Email ghi vào <code>/mail</code>.</div></div>
        <div class="set-control"><label class="switch"><input type="checkbox" data-act="cfg-toggle" data-key="email" ${c.email?'checked':''} /><span class="track"></span><span class="state-txt">${c.email?'Bật':'Tắt'}</span></label></div>
      </div>
    </section>
    <section class="card set-group">
      <div class="set-group-hd"><div><div class="gt">Phân quyền Admin</div><div class="gs">Cấp quyền admin không cần deploy lại.</div></div></div>
      <div class="set-row stacked">
        <div class="set-info"><div class="set-label">Admin email bổ sung</div><div class="set-desc">Mỗi dòng 1 email. Các tài khoản này có toàn quyền admin.</div></div>
        <textarea class="input textarea" data-act="cfg-dirty" spellcheck="false">admin1@cyberlogitec.com
admin2@cyberlogitec.com</textarea>
      </div>
      <div class="set-row stacked" style="padding-top:0;">
        <div class="set-info"><div class="set-label" style="font-size:var(--fs-sm);color:var(--ink-600);">Admin mặc định (hardcoded)</div><div class="set-desc">Luôn có quyền, không thể gỡ ở đây.</div>
          <div class="admin-chips">
            <span class="admin-chip"><span class="dot">H</span>hao.nha <span class="lock">🔒</span></span>
            <span class="admin-chip"><span class="dot">P</span>phuc.lnk <span class="lock">🔒</span></span>
            <span class="admin-chip"><span class="dot">A</span>anhhao.dl108 <span class="lock">🔒</span></span>
          </div>
        </div>
      </div>
    </section>
    <div class="save-bar" style="margin:var(--s-4) calc(-1 * var(--s-7)) calc(-1 * var(--s-6));border-radius:0;">
      <div class="save-bar-inner" style="max-width:none;">
        <div class="save-status ${c.dirty?'dirty':''}"><span class="sdot"></span><span>${c.dirty?'Có thay đổi chưa lưu':'Đã lưu · cập nhật gần nhất 14:32'}</span></div>
        <div class="row"><button class="btn ghost" data-act="cfg-reset">Hoàn tác</button><button class="btn" data-act="cfg-save">Lưu cấu hình</button></div>
      </div>
    </div>`;
}

// ─── Shared fragments ────────────────────────────────────────────────────
function rowMenu(key, items) {
  const open = S.openMenu === key;
  return `<div class="rowmenu-wrap">
    <button class="icon-act" data-act="menu" data-key="${key}" aria-label="Tác vụ">${IC.dots}</button>
    ${open ? `<div class="rowmenu">${items.map(i => i.div ? '<div class="div"></div>' : `<button class="${i.danger?'danger':''}" data-act="menuact" data-key="${key}" data-action="${i.a}">${i.l}</button>`).join('')}</div>` : ''}
  </div>`;
}
function bulkBar(n, scope) {
  return `<div class="bulkbar">
    <span class="bcount">${n} đã chọn</span>
    <button class="blink" data-act="selclear" data-scope="${scope}">Bỏ chọn</button>
    <div class="spacer"></div>
    ${scope === 'slots'
      ? `<button class="bbtn" data-act="bulk" data-op="close">Đóng đăng ký</button><button class="bbtn danger" data-act="bulk" data-op="del">Xoá</button>`
      : `<button class="bbtn" data-act="bulk" data-op="export">Xuất CSV</button><button class="bbtn danger" data-act="bulk" data-op="cancel">Huỷ đăng ký</button>`}
  </div>`;
}
function emptyState(msg) { return `<div class="empty-state"><div class="es-title">${msg}</div></div>`; }

// ─── Drawer ────────────────────────────────────────────────────────────────
function renderDrawer() {
  const d = S.drawer;
  const root = document.getElementById('drawer-root');
  root.innerHTML = `<div class="drawer-back" data-act="drawer-close">
    <div class="drawer" data-stop>
      <div class="drawer-hd"><div><div class="dt">${esc(d.title)}</div><div class="ds">${esc(d.sub||'')}</div></div><button class="drawer-x" data-act="drawer-close">×</button></div>
      <div class="drawer-bd">${d.kind === 'slot' ? slotDrawerBody(d) : d.body}</div>
      <div class="drawer-ft"><button class="btn ghost" data-act="drawer-close">Đóng</button><button class="btn" data-act="drawer-save">${esc(d.cta||'Lưu')}</button></div>
    </div></div>`;
}

// ─── Toast ───────────────────────────────────────────────────────────────
function toast(msg, kind) {
  const stack = document.getElementById('toast-stack');
  const t = document.createElement('div');
  t.className = 'toast ' + (kind || '');
  t.textContent = msg;
  stack.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(20px)'; setTimeout(() => t.remove(), 200); }, 2200);
}

// ─── Search (DOM filter, no re-render) ───────────────────────────────────
function applySearch() {
  const q = (S.q[S.tab] || '').trim().toLowerCase();
  document.querySelectorAll('#content [data-search]').forEach(row => {
    row.style.display = !q || row.getAttribute('data-search').includes(q) ? '' : 'none';
  });
}

// ─── Events ────────────────────────────────────────────────────────────────
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.matches('[data-search]')) { S.q[S.tab] = el.value; applySearch(); return; }
  if (el.matches('[data-act="cfg-deadline"]')) { S.cfg.deadline = el.value; S.cfg.dirty = true; markCfgDirty(); }
  if (el.matches('[data-act="cfg-dirty"]')) { S.cfg.dirty = true; markCfgDirty(); }
  if (el.matches('[data-f]')) {
    const f = el.getAttribute('data-f');
    S.drawer[f] = el.value;
    if (f === 'start' && !S.drawer.slotId) { S.drawer.end = addMin(el.value, S.drawer.type === 'sp' ? 60 : 150); renderDrawer(); }
    else if (f === 'date') { renderDrawer(); }
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  const act = el.getAttribute && el.getAttribute('data-act');
  if (act === 'selrow') {
    const set = el.dataset.scope === 'slots' ? S.selSlots : S.selBookings;
    el.checked ? set.add(el.dataset.id) : set.delete(el.dataset.id);
    render();
  } else if (act === 'selall') {
    const scope = el.dataset.scope;
    const set = scope === 'slots' ? S.selSlots : S.selBookings;
    const ids = scope === 'slots'
      ? A_SLOTS.filter(s => (S.slotFilter==='all'||s.type===S.slotFilter) && (S.slotDay==='all'||s.date===S.slotDay)).map(s => s.id)
      : A_BOOKINGS.filter(b => S.bookingBU==='all'||b.bu===S.bookingBU).map(b => b.empCode);
    const allSel = ids.every(i => set.has(i));
    ids.forEach(i => allSel ? set.delete(i) : set.add(i));
    render();
  } else if (act === 'slotday') { S.slotDay = el.value; render(); }
  else if (act === 'bookingbu') { S.bookingBU = el.value; render(); }
  else if (act === 'cfg-toggle') { S.cfg[el.dataset.key] = el.checked; S.cfg.dirty = true; render(); }
});

document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-act]');
  // close open row menu when clicking elsewhere
  if (S.openMenu && !(target && (target.dataset.act === 'menu' || target.dataset.act === 'menuact'))) {
    S.openMenu = null; render();
  }
  if (!target) return;
  const act = target.dataset.act;

  if (act === 'nav') { S.tab = target.dataset.tab; S.openMenu = null; render(); }
  else if (act === 'slotfilter') { S.slotFilter = target.dataset.val; render(); }
  else if (act === 'auditfilter') { S.auditFilter = target.dataset.val; render(); }
  else if (act === 'menu') { const k = target.dataset.key; S.openMenu = S.openMenu === k ? null : k; render(); }
  else if (act === 'menuact') { S.openMenu = null; const [scope, id] = target.dataset.key.split(':'); doRowAction(scope, id, target.dataset.action); render(); }
  else if (act === 'selclear') { (target.dataset.scope === 'slots' ? S.selSlots : S.selBookings).clear(); render(); }
  else if (act === 'bulk') { doBulk(target.dataset.op); }
  else if (act === 'export') { toast('Đang xuất CSV…', 'success'); }
  else if (act === 'reload') { toast('Đã tải lại dữ liệu'); }
  else if (act === 'user-site') { toast('Chuyển sang trang User (prototype)'); }
  else if (act === 'add-slot') { openDrawer('slot'); }
  else if (act === 'add-block') { openDrawer('block'); }
  // config
  else if (act === 'cfg-step') { S.cfg.changes = Math.max(0, Math.min(20, S.cfg.changes + (+target.dataset.d))); S.cfg.dirty = true; render(); }
  else if (act === 'cfg-cleardl') { S.cfg.deadline = ''; S.cfg.dirty = true; render(); }
  else if (act === 'cfg-save') { S.cfg.dirty = false; render(); toast('Đã lưu cấu hình', 'success'); }
  else if (act === 'cfg-reset') { S.cfg = { open: true, changes: 3, deadline: '2026-06-02T22:00', email: false, dirty: false }; render(); }
  // drawer
  else if (act === 'drawer-type') { S.drawer.type = target.dataset.val; if (!S.drawer.slotId) { S.drawer.end = addMin(S.drawer.start, S.drawer.type === 'sp' ? 60 : 150); S.drawer.cap = S.drawer.type === 'sp' ? 8 : 14; } renderDrawer(); }
  else if (act === 'drawer-close') { if (e.target.closest('[data-stop]') && !e.target.closest('[data-act="drawer-close"]')) return; closeDrawer(); }
  else if (act === 'drawer-save') { saveDrawer(); }
});

function closeDrawer() { S.drawer = null; const r = document.getElementById('drawer-root'); if (r) r.innerHTML = ''; }
function saveDrawer() {
  const d = S.drawer; if (!d) return;
  if (d.kind === 'slot') {
    if (!d.date || !d.start || !d.end) { toast('Cần đủ ngày, giờ bắt đầu và kết thúc', 'danger'); return; }
    if (d.end <= d.start) { toast('Giờ kết thúc phải sau giờ bắt đầu', 'danger'); return; }
    const dm = isoToDm(d.date); const [dd, mm] = dm.split('/');
    if (d.slotId) {
      const s = aSlotById(d.slotId);
      Object.assign(s, { type: d.type, date: dm, dow: dowOf(d.date), start: d.start, end: d.end, room: (d.room || '').trim(), cap: Math.max(1, +d.cap || s.cap) });
      closeDrawer(); render(); toast('Đã cập nhật ngày/giờ ca thi', 'success');
    } else {
      const id = `${d.type === 'sp' ? 'SP' : '3S'}-${dd}${mm}-${d.start.replace(':', '')}`;
      A_SLOTS.unshift({ id, type: d.type, date: dm, dow: dowOf(d.date), start: d.start, end: d.end, cap: Math.max(1, +d.cap || 8), booked: 0, room: (d.room || '').trim() });
      closeDrawer(); render(); toast('Đã thêm ca thi mới', 'success');
    }
    return;
  }
  closeDrawer(); toast('Đã lưu', 'success');
}

function markCfgDirty() {
  const s = document.querySelector('.save-status');
  if (s) { s.classList.add('dirty'); s.querySelector('span:last-child').textContent = 'Có thay đổi chưa lưu'; }
}

function doRowAction(scope, id, action) {
  const labels = { edit: 'Mở chỉnh sửa', dup: 'Đã nhân bản ca', close: 'Đã đóng đăng ký ca', del: 'Đã xoá ca', view: 'Xem chi tiết', resend: 'Đã gửi lại email', cancel: 'Đã huỷ đăng ký', unblock: 'Đã gỡ chặn' };
  if (action === 'edit' && scope === 'slots') return openDrawer('slot', id);
  if (action === 'edit' && scope === 'bookings') return openDrawer('booking', id);
  if (action === 'edit' && scope === 'blocks') return openDrawer('block', id);
  if (action === 'view') return openDrawer('booking', id);
  toast(labels[action] || action, action === 'del' || action === 'cancel' || action === 'unblock' ? 'danger' : '');
}
function doBulk(op) {
  const n = (S.tab === 'slots' ? S.selSlots : S.selBookings).size;
  const msg = { close: `Đã đóng ${n} ca`, del: `Đã xoá ${n} ca`, export: `Xuất CSV ${n} dòng`, cancel: `Đã huỷ ${n} đăng ký` }[op];
  if (S.tab === 'slots') S.selSlots.clear(); else S.selBookings.clear();
  render();
  toast(msg, op === 'del' || op === 'cancel' ? 'danger' : 'success');
}

function slotDrawerBody(d) {
  return `
    <div class="field"><label class="label">Loại ca</label>
      <div class="filter-chips" style="display:inline-flex;">
        <button class="${d.type === 'sp' ? 'active' : ''}" data-act="drawer-type" data-val="sp">Speaking · 60′</button>
        <button class="${d.type === 'sk' ? 'active' : ''}" data-act="drawer-type" data-val="sk">3 Skills · 150′</button>
      </div>
    </div>
    <div class="field"><label class="label">Ngày thi</label>
      <input class="input" type="date" data-f="date" min="2026-06-01" max="2026-07-31" value="${d.date}" />
      <div class="help">${dowOf(d.date)} · ${isoToDm(d.date)}</div>
    </div>
    <div class="row" style="gap:var(--s-3);">
      <div class="field" style="flex:1;"><label class="label">Giờ bắt đầu</label><input class="input" type="time" data-f="start" value="${d.start}" /></div>
      <div class="field" style="flex:1;"><label class="label">Giờ kết thúc</label><input class="input" type="time" data-f="end" value="${d.end}" /></div>
    </div>
    <div class="row" style="gap:var(--s-3);">
      <div class="field" style="flex:2;"><label class="label">Phòng</label><input class="input" data-f="room" value="${esc(d.room)}" placeholder="Phòng A12" /></div>
      <div class="field" style="flex:1;"><label class="label">Sức chứa</label><input class="input" type="number" min="1" data-f="cap" value="${d.cap}" /></div>
    </div>
    ${d.slotId ? `<div class="banner info" style="margin-top:var(--s-2);"><div>Mã ca <b>${d.slotId}</b> · đang có <b>${d.booked || 0}</b> đăng ký. Đổi ngày/giờ sẽ áp dụng cho cả các đăng ký này.</div></div>` : ''}`;
}

function openDrawer(kind, id) {
  if (kind === 'slot') {
    const s = id ? aSlotById(id) : null;
    S.drawer = {
      kind: 'slot', slotId: s ? s.id : null,
      type: s ? s.type : 'sp',
      date: s ? dmToIso(s.date) : '2026-06-22',
      start: s ? s.start : '09:00',
      end: s ? s.end : '10:00',
      room: s ? s.room : '',
      cap: s ? s.cap : 8,
      booked: s ? s.booked : 0,
      title: s ? 'Sửa ca thi' : 'Thêm ca thi',
      sub: s ? 'Cập nhật ngày · giờ · phòng · sức chứa' : 'Tạo slot mới cho kỳ thi',
      cta: s ? 'Lưu thay đổi' : 'Tạo ca',
    };
  } else if (kind === 'block') {
    S.drawer = { title: 'Thêm vào danh sách chặn', sub: 'Chặn theo mã nhân viên', cta: 'Thêm chặn',
      body: `<div class="field"><label class="label">Mã nhân viên</label><input class="input" placeholder="vd 262100" /></div>
        <div class="field"><label class="label">Lý do (hiển thị cho nhân viên)</label><textarea class="input textarea" style="font-family:inherit;" placeholder="Chưa đủ 12 tháng từ ngày thi gần nhất."></textarea></div>` };
  } else if (kind === 'booking') {
    const b = A_BOOKINGS.find(x => x.empCode === id);
    S.drawer = { title: 'Đổi ca giùm nhân viên', sub: b ? `${b.name} · ${b.empCode}` : '', cta: 'Lưu thay đổi',
      body: `<div class="banner warn" style="margin-bottom:var(--s-4);"><div>Thao tác thay nhân viên sẽ ghi vào <b>Audit</b> với tài khoản admin của bạn.</div></div>
        <div class="field"><label class="label">Ca Speaking</label><select class="input">${A_SLOTS.filter(s=>s.type==='sp').map(s=>`<option ${b&&b.sp===s.id?'selected':''}>${s.date} · ${s.start}–${s.end} · ${s.room}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Ca 3 Skills</label><select class="input">${A_SLOTS.filter(s=>s.type==='sk').map(s=>`<option ${b&&b.sk===s.id?'selected':''}>${s.date} · ${s.start}–${s.end} · ${s.room}</option>`).join('')}</select></div>` };
  }
  renderDrawer();
}

render();

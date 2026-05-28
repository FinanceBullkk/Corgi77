// ─────────────────────────────────────────────────────────────────────────
// Main App · state machine + routing
//   signin → step1 → step2 → confirm → success → display
// ─────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'corgi7.proto.v1';

const DEFAULT_USER = {
  name: 'Nguyễn Văn An',
  email: 'an.nguyen@cyberlogitec.com',
  shortName: 'An Nguyễn',
  initials: 'AN',
  empCode: '',
  bu: '',
};

const DEADLINE = { daysLeft: 12, hoursLeft: 30 };

function App() {
  const persisted = loadState();
  const [route, setRoute] = useState(persisted.route || 'signin');
  const [user, setUser] = useState(persisted.user || DEFAULT_USER);
  const [info, setInfo] = useState(persisted.info || { empCode: '', name: '', bu: '' });
  const [selection, setSelection] = useState(persisted.selection || { spId: null, skId: null });
  const [registeredAt, setRegisteredAt] = useState(persisted.registeredAt || null);
  const [changesLeft, setChangesLeft] = useState(persisted.changesLeft ?? 3);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const { toasts, push } = useToast();

  // Persist
  useEffect(() => {
    saveState({ route, user, info, selection, registeredAt, changesLeft });
  }, [route, user, info, selection, registeredAt, changesLeft]);

  // ── Actions ────────────────────────────────────────────────────────
  function handleSignIn() {
    setUser({ ...DEFAULT_USER, name: 'Nguyễn Văn An' });
    setRoute('step1');
  }
  function handleLogout() {
    if (!confirm('Đăng xuất và xoá toàn bộ dữ liệu prototype?')) return;
    localStorage.removeItem(STORAGE_KEY);
    setRoute('signin');
    setUser(DEFAULT_USER);
    setInfo({ empCode: '', name: '', bu: '' });
    setSelection({ spId: null, skId: null });
    setRegisteredAt(null);
    setChangesLeft(3);
  }
  function handleHome() {
    if (registeredAt) setRoute('display');
    else setRoute(route === 'signin' ? 'signin' : 'step1');
  }
  function handleStep1Continue(data) {
    setInfo(data);
    setUser(u => ({ ...u, ...data, initials: getInitials(data.name) }));
    setRoute('step2');
  }
  function handleStep2Continue() { setShowConfirm(true); }
  function handleConfirm() {
    setShowConfirm(false);
    setRegisteredAt(formatNow());
    setRoute('success');
    push('Đã đăng ký thành công!', 'success');
  }
  function handleChange() {
    if (changesLeft <= 0) {
      push('Đã hết quota đổi ca. Liên hệ BTC.', 'danger');
      return;
    }
    setChangesLeft(c => c - 1);
    setRoute('step2');
    push(`Đang chỉnh sửa · còn ${changesLeft - 1} lần đổi sau lần này`, '');
  }
  function handleCancel() { setShowCancelConfirm(true); }
  function confirmCancel() {
    setShowCancelConfirm(false);
    setSelection({ spId: null, skId: null });
    setRegisteredAt(null);
    setChangesLeft(3);
    setRoute('step1');
    push('Đã hủy đăng ký', 'danger');
  }
  function handleViewDetail() { setRoute('display'); }

  // ── Render ─────────────────────────────────────────────────────────
  let screen;
  if (route === 'signin') {
    screen = <SignInScreen onSignIn={handleSignIn} />;
  } else if (route === 'step1') {
    screen = (
      <Step1Form
        user={user}
        deadline={DEADLINE}
        initial={info}
        onContinue={handleStep1Continue}
        onLogout={handleLogout}
        onHome={handleHome}
      />
    );
  } else if (route === 'step2') {
    screen = (
      <CalendarStep
        user={user}
        deadline={DEADLINE}
        selection={selection}
        setSelection={setSelection}
        onBack={() => setRoute('step1')}
        onContinue={handleStep2Continue}
        onLogout={handleLogout}
        onHome={handleHome}
      />
    );
  } else if (route === 'success') {
    screen = (
      <SuccessScreen
        user={user}
        selection={selection}
        deadline={DEADLINE}
        onLogout={handleLogout}
        onHome={handleHome}
        onViewDetail={handleViewDetail}
      />
    );
  } else if (route === 'display') {
    screen = (
      <BookingDisplay
        user={user}
        selection={selection}
        deadline={DEADLINE}
        registeredAt={registeredAt}
        changesLeft={changesLeft}
        onLogout={handleLogout}
        onHome={handleHome}
        onChange={handleChange}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <>
      {screen}

      {showConfirm && (
        <ConfirmModal
          user={user}
          selection={selection}
          onCancel={() => setShowConfirm(false)}
          onConfirm={handleConfirm}
        />
      )}

      {showCancelConfirm && (
        <Modal
          title="Hủy đăng ký?"
          subtitle="Bạn sẽ mất 2 ca đã chọn và phải đăng ký lại từ đầu. Hành động này không thể hoàn tác."
          onClose={() => setShowCancelConfirm(false)}
          maxWidth={420}
          footer={
            <>
              <button className="btn ghost" onClick={() => setShowCancelConfirm(false)}>Không, giữ đăng ký</button>
              <button className="btn danger" onClick={confirmCancel}>Vâng, hủy đăng ký</button>
            </>
          }
        >
          <div className="banner danger">
            <div>Sau khi hủy, ca thi của bạn sẽ trả lại pool. Người khác có thể đăng ký vào chỗ đó.</div>
          </div>
        </Modal>
      )}

      <Toast toasts={toasts} />
      <DemoNav route={route} setRoute={setRoute} hasSelection={!!(selection.spId && selection.skId)} hasRegistration={!!registeredAt} />
    </>
  );
}

// ─── Demo nav (jump between screens for review) ────────────────────────
function DemoNav({ route, setRoute, hasSelection, hasRegistration }) {
  const [open, setOpen] = useState(false);
  const routes = [
    { id: 'signin', label: 'Sign-in', enabled: true },
    { id: 'step1', label: 'Step 1 · Info', enabled: true },
    { id: 'step2', label: 'Step 2 · Calendar', enabled: true },
    { id: 'success', label: 'Success', enabled: hasSelection },
    { id: 'display', label: 'Booking Display', enabled: hasRegistration },
  ];
  return (
    <div style={{
      position: 'fixed', bottom: 12, left: 12, zIndex: 400,
      background: 'var(--ink-900)', color: 'white',
      borderRadius: 'var(--r-md)', boxShadow: 'var(--sh-4)',
      fontSize: 12, fontFamily: 'var(--font-mono)',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: 'transparent', color: 'white', border: 0, padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success-500)' }}></span>
        DEMO · {route} {open ? '▾' : '▴'}
      </button>
      {open && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: 6 }}>
          {routes.map(r => (
            <button
              key={r.id}
              disabled={!r.enabled}
              onClick={() => { setRoute(r.id); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: route === r.id ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: r.enabled ? 'white' : 'rgba(255,255,255,0.3)',
                border: 0, padding: '6px 10px', cursor: r.enabled ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit', fontSize: 12, borderRadius: 4,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Storage helpers ───────────────────────────────────────────────────
function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}
function getInitials(name) {
  return name.trim().split(/\s+/).slice(-2).map(p => p[0]?.toUpperCase() || '').join('');
}
function formatNow() {
  // Use fixed prototype "now"
  return '07/06/2026 14:23';
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

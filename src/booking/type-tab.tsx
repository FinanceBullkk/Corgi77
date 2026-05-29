// ─── Type Tab · segmented control above the calendar ──────────────────────

export function TypeTab({
  tone,
  num,
  active,
  picked,
  label,
  duration,
  statusText,
  onClick,
  pulse,
}: {
  tone: 'sp' | 'sk';
  num: string;
  active: boolean;
  picked: boolean;
  label: string;
  duration: string;
  statusText: string;
  onClick: () => void;
  pulse?: boolean;
}) {
  return (
    <button
      className={`type-tab ${tone} ${active ? 'active' : ''} ${picked ? 'picked' : ''} ${pulse ? 'pulse' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <div className="tt-num">{picked ? '✓' : num}</div>
      <div className="tt-body">
        <div className="tt-label">
          {label}
          <span className="tt-dur"> · {duration}</span>
        </div>
        <div className={`tt-status ${picked ? 'picked' : ''}`}>{statusText}</div>
      </div>
      {active && <div className="tt-indicator" aria-hidden />}
    </button>
  );
}

import { type Tab } from './admin-utils';

// ── Icons ─────────────────────────────────────────────────────────────────────

export function NavIcon({ tab }: { tab: Tab }) {
  const c = 'currentColor';
  switch (tab) {
    case 'overview':
      return <svg className="ni-ic" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5" /><rect x="11" y="3" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5" /><rect x="3" y="11" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5" /><rect x="11" y="11" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5" /></svg>;
    case 'registrations':
      return <svg className="ni-ic" viewBox="0 0 20 20" fill="none"><path d="M3 5.5h14M3 10h14M3 14.5h9" stroke={c} strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case 'slots':
      return <svg className="ni-ic" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="13" rx="2" stroke={c} strokeWidth="1.5" /><path d="M3 8h14M7 2.5v3M13 2.5v3" stroke={c} strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case 'ineligibility':
      return <svg className="ni-ic" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke={c} strokeWidth="1.5" /><path d="m5.5 5.5 9 9" stroke={c} strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case 'config':
      return <svg className="ni-ic" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="2.5" stroke={c} strokeWidth="1.5" /><path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7" stroke={c} strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case 'audit':
      return <svg className="ni-ic" viewBox="0 0 20 20" fill="none"><path d="M10 5v5l3 2" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><circle cx="10" cy="10" r="7" stroke={c} strokeWidth="1.5" /></svg>;
  }
}

export function SearchIcon() {
  return <svg viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" /><path d="m11 11 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
}
export function DotsIcon() {
  return <svg viewBox="0 0 18 18" fill="currentColor" width="18" height="18"><circle cx="9" cy="4" r="1.5" /><circle cx="9" cy="9" r="1.5" /><circle cx="9" cy="14" r="1.5" /></svg>;
}

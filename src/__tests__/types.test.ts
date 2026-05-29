import { describe, it, expect } from 'vitest';
import { overlaps, formatDateVi, minToHHmm, type Slot } from '../lib/types';

// ─── Helper to create a test slot ──────────────────────────────────────────
function slot(overrides: Partial<Slot> = {}): Slot {
  return {
    slotId: 'test-slot',
    type: 'Speaking',
    date: '2026-06-22',
    session: '',
    startMin: 540,
    endMin: 600,
    capacity: 10,
    remaining: 10,
    location: '',
    display: 'Test',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UC-T01: overlaps() — Two slots overlap when same date & overlapping time
// ═══════════════════════════════════════════════════════════════════════════
describe('overlaps()', () => {
  it('UC-T01: returns true when two slots on same date overlap in time', () => {
    const a = slot({ startMin: 540, endMin: 630 }); // 09:00–10:30
    const b = slot({ startMin: 600, endMin: 690 }); // 10:00–11:30
    expect(overlaps(a, b)).toBe(true);
  });

  it('UC-T02: returns false when same date but no time overlap', () => {
    const a = slot({ startMin: 540, endMin: 600 }); // 09:00–10:00
    const b = slot({ startMin: 600, endMin: 690 }); // 10:00–11:30 (touching, not overlapping)
    expect(overlaps(a, b)).toBe(false);
  });

  it('UC-T03: returns false when different date even with overlapping time', () => {
    const a = slot({ date: '2026-06-22', startMin: 540, endMin: 630 });
    const b = slot({ date: '2026-06-23', startMin: 540, endMin: 630 });
    expect(overlaps(a, b)).toBe(false);
  });

  it('UC-T04: returns true when one slot fully contains another', () => {
    const a = slot({ startMin: 480, endMin: 720 }); // 08:00–12:00
    const b = slot({ startMin: 540, endMin: 600 }); // 09:00–10:00
    expect(overlaps(a, b)).toBe(true);
    expect(overlaps(b, a)).toBe(true); // symmetric
  });

  it('UC-T05: returns true for identical time ranges', () => {
    const a = slot({ startMin: 540, endMin: 600 });
    const b = slot({ startMin: 540, endMin: 600 });
    expect(overlaps(a, b)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-T06: formatDateVi() — Convert YYYY-MM-DD to DD/MM/YYYY
// ═══════════════════════════════════════════════════════════════════════════
describe('formatDateVi()', () => {
  it('UC-T06: converts ISO date to Vietnamese format', () => {
    expect(formatDateVi('2026-06-22')).toBe('22/06/2026');
  });

  it('UC-T07: handles single-digit day and month with padding', () => {
    expect(formatDateVi('2026-01-05')).toBe('05/01/2026');
  });

  it('UC-T08: handles leap year date', () => {
    expect(formatDateVi('2028-02-29')).toBe('29/02/2028');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-T09: minToHHmm() — Convert minutes-since-midnight to HH:mm
// ═══════════════════════════════════════════════════════════════════════════
describe('minToHHmm()', () => {
  it('UC-T09: converts 0 to 00:00 (midnight)', () => {
    expect(minToHHmm(0)).toBe('00:00');
  });

  it('UC-T10: converts 540 to 09:00', () => {
    expect(minToHHmm(540)).toBe('09:00');
  });

  it('UC-T11: converts 780 to 13:00', () => {
    expect(minToHHmm(780)).toBe('13:00');
  });

  it('UC-T12: converts 775 to 12:55 (with minutes)', () => {
    expect(minToHHmm(775)).toBe('12:55');
  });

  it('UC-T13: converts 1439 to 23:59 (end of day)', () => {
    expect(minToHHmm(1439)).toBe('23:59');
  });
});
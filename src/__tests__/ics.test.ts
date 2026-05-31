import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Slot } from '../lib/types';
import { buildBookingIcs, escapeText, toIcsUtc } from '../lib/ics';

const realRequire = createRequire(import.meta.url);
const { buildBookingIcs: buildBookingIcsJs } = realRequire(join(process.cwd(), 'functions/ics-helpers.js'));

const sp: Slot = {
  slotId: 'SP-2206-0900',
  type: 'Speaking',
  date: '2026-06-22',
  session: 'S1',
  startMin: 540,
  endMin: 600,
  capacity: 10,
  remaining: 8,
  location: 'Room A, B; C',
  display: 'Speaking',
};

const sk: Slot = {
  slotId: '3S-2206-1100',
  type: '3 Skills',
  date: '2026-06-22',
  session: 'S2',
  startMin: 660,
  endMin: 840,
  capacity: 10,
  remaining: 7,
  location: 'Room D',
  display: '3 Skills',
};

describe('ICS builder', () => {
  it('matches the Cloud Functions builder for stable calendar identity fields', () => {
    const opts = {
      empCode: '262010',
      sp,
      sk,
      sequence: 2,
      assessmentName: 'Assessment Q2 2026',
      now: new Date('2026-05-31T00:00:00.000Z'),
    };
    const ts = buildBookingIcs(opts);
    const js = buildBookingIcsJs(opts);

    expect(ts).toBe(js);
    expect(ts).toContain('UID:262010-SP@assessment-booking');
    expect(ts).toContain('UID:262010-3S@assessment-booking');
    expect(ts).toContain('DTSTART:20260622T020000Z');
    expect(ts).toContain('DTEND:20260622T030000Z');
    expect(ts).toContain('SEQUENCE:2');
    expect((ts.match(/BEGIN:VEVENT/g) || [])).toHaveLength(2);
    expect((ts.match(/BEGIN:VALARM/g) || [])).toHaveLength(4);
    expect(ts.endsWith('\r\n')).toBe(true);
  });

  it('converts Vietnam local slot minutes to UTC ICS timestamps', () => {
    expect(toIcsUtc('2026-06-22', 540)).toBe('20260622T020000Z');
    expect(toIcsUtc('2026-06-22', 0)).toBe('20260621T170000Z');
    expect(toIcsUtc('2026-06-22', 1439)).toBe('20260622T165900Z');
  });

  it('escapes RFC 5545 TEXT characters', () => {
    expect(escapeText('A\\B; C, D\nE')).toBe('A\\\\B\\; C\\, D\\nE');
  });
});

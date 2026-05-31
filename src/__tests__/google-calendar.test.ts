import { describe, expect, it, vi } from 'vitest';
import type { Slot } from '../lib/types';

vi.mock('../lib/firebase', () => ({
  auth: { currentUser: null },
}));

import { buildGoogleCalendarEvents, googleCalendarEventId } from '../lib/google-calendar';

const sp: Slot = {
  slotId: 'SP-2206-0900',
  type: 'Speaking',
  date: '2026-06-22',
  startMin: 540,
  endMin: 600,
  capacity: 10,
  remaining: 8,
  location: 'Room A',
  display: 'Speaking',
};

const sk: Slot = {
  slotId: '3S-2206-1100',
  type: '3 Skills',
  date: '2026-06-22',
  startMin: 660,
  endMin: 840,
  capacity: 10,
  remaining: 7,
  location: 'Room B',
  display: '3 Skills',
};

describe('Google Calendar event builder', () => {
  it('uses stable API event ids for each assessment slot type', () => {
    expect(googleCalendarEventId('262010', 'Speaking')).toBe('assessment262010sp');
    expect(googleCalendarEventId('262010', '3 Skills')).toBe('assessment2620103s');
  });

  it('builds two primary-calendar events with Vietnam timezone and popup reminders', () => {
    const events = buildGoogleCalendarEvents({
      empCode: '262010',
      sp,
      sk,
      sequence: 2,
      assessmentName: 'Assessment Q2 2026',
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      id: 'assessment262010sp',
      summary: 'Assessment Q2 2026 — Speaking',
      start: { dateTime: '2026-06-22T09:00:00+07:00', timeZone: 'Asia/Ho_Chi_Minh' },
      end: { dateTime: '2026-06-22T10:00:00+07:00', timeZone: 'Asia/Ho_Chi_Minh' },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 1440 },
          { method: 'popup', minutes: 60 },
        ],
      },
      extendedProperties: {
        private: {
          empCode: '262010',
          sequence: '2',
          slotId: 'SP-2206-0900',
        },
      },
    });
    expect(events[1]).toMatchObject({
      id: 'assessment2620103s',
      summary: 'Assessment Q2 2026 — 3 Skills',
      start: { dateTime: '2026-06-22T11:00:00+07:00', timeZone: 'Asia/Ho_Chi_Minh' },
      end: { dateTime: '2026-06-22T14:00:00+07:00', timeZone: 'Asia/Ho_Chi_Minh' },
    });
  });
});

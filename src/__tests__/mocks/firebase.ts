/**
 * Shared Firebase mock helpers for all test files.
 */
import { vi } from 'vitest';

/** Create a mock Firestore doc snapshot */
export function mockDocSnap(exists: boolean, data?: Record<string, any>) {
  return { exists: () => exists, data: () => data, id: data?.id ?? '' };
}

/** Create a mock Firestore query snapshot */
export function mockQuerySnap(docs: Array<{ id: string; data: () => Record<string, any> }>) {
  return {
    docs: docs.map((d) => ({
      id: d.id,
      data: d.data,
      exists: () => true,
    })),
  };
}

/** Create a mock Timestamp */
export function mockTimestamp(date: Date) {
  return {
    toDate: () => date,
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: (date.getTime() % 1000) * 1_000_000,
  };
}

/** Create a mock transaction */
export function mockTransaction() {
  const tx = {
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return tx;
}

/** Base slot document data for testing */
export const TEST_SLOT_SPEAKING = {
  type: 'Speaking',
  date: '2026-06-22',
  session: 'S1',
  startMin: 540, // 09:00
  endMin: 600,   // 10:00
  capacity: 10,
  remaining: 8,
  location: 'Room A',
};

export const TEST_SLOT_SKILLS = {
  type: '3 Skills',
  date: '2026-06-22',
  session: 'S2',
  startMin: 660, // 11:00
  endMin: 840,   // 14:00
  capacity: 15,
  remaining: 12,
  location: 'Room B',
};

export const TEST_SLOT_SPEAKING_2 = {
  type: 'Speaking',
  date: '2026-06-23',
  session: 'S1',
  startMin: 540,
  endMin: 600,
  capacity: 10,
  remaining: 10,
  location: 'Room C',
};

export const TEST_CONFIG = {
  allowEnrollment: true,
  maxChanges: 3,
  deadline: null,
  emailConfirm: false,
  adminEmails: ['admin@test.com'],
  buList: ['BSG', 'CHORUS', 'LBU', 'MOC', 'ONC', 'POC', 'TBU'],
  assessmentName: 'Assessment Q2 2026',
};

export const TEST_REGISTRATION = {
  email: 'user@test.com',
  empCode: '262010',
  fullName: 'Nguyen Van A',
  bu: 'IT',
  speakingSlotId: 'SP-2206-0900',
  skillsSlotId: '3S-2206-1100',
  createdAt: mockTimestamp(new Date('2026-05-01')),
  updatedAt: mockTimestamp(new Date('2026-05-01')),
  changeCount: 0,
};

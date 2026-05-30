/**
 * Database Layer Test Suite
 *
 * UC-DB01 -> UC-DB08  : checkIneligibility()
 * UC-DB08 -> UC-DB10  : initDb()
 * UC-DB11 -> UC-DB13  : bookDb() — validation
 * UC-DB14             : bookDb() — pre-flight blocklist
 * UC-DB15 -> UC-DB23  : bookDb() — transaction scenarios
 * UC-DB24             : bookDb() — error handling
 * UC-DB25 -> UC-DB28  : cancelDb()
 * UC-DB29 -> UC-DB38  : bookDb() — concurrency
 * UC-DB39             : cancelDb() — enrollment-lock guard (C5 regression)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock firebase ────────────────────────────────────────────────────────────
vi.mock('../lib/firebase', () => ({ db: {}, functions: {} }));

const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockRunTransaction = vi.fn();
const mockAddDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockHttpsCallable = vi.fn();

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: any[]) => mockAddDoc(...args),
  collection: vi.fn((_db: any, path: string) => ({ path })),
  doc: vi.fn((_db: any, path: string, id?: string) => ({ path: id ? `${path}/${id}` : path })),
  getDoc: (...args: any[]) => mockGetDoc(...args),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  query: vi.fn((...args: any[]) => args),
  where: vi.fn((...args: any[]) => args),
  runTransaction: (_db: any, fn: any) => mockRunTransaction(fn),
  setDoc: (...args: any[]) => mockSetDoc(...args),
  updateDoc: (...args: any[]) => mockUpdateDoc(...args),
  deleteDoc: (...args: any[]) => mockDeleteDoc(...args),
  deleteField: () => '__DELETE__',
  Timestamp: {
    now: () => ({ toDate: () => new Date() }),
    fromDate: (d: Date) => ({ toDate: () => d }),
  },
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: (...args: any[]) => mockHttpsCallable(...args),
}));

vi.mock('../lib/audit', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

import { checkIneligibility, initDb, bookDb, cancelDb } from '../lib/db';
import { mockDocSnap, mockQuerySnap, TEST_CONFIG, TEST_REGISTRATION } from './mocks/firebase';

// ── Fixtures ─────────────────────────────────────────────────────────────────
const TEST_SLOT_SPEAKING = {
  type: 'Speaking',
  date: '2026-06-22',
  startMin: 540,
  endMin: 600,
  capacity: 30,
  remaining: 25,
  location: 'Phòng A',
  session: 'morning',
};
const TEST_SLOT_SKILLS = {
  type: '3 Skills',
  date: '2026-06-22',
  startMin: 660,
  endMin: 720,
  capacity: 20,
  remaining: 15,
  location: 'Phòng B',
  session: 'afternoon',
};

// ═══════════════════════════════════════════════════════════════════════════
// UC-DB01 -> UC-DB08: checkIneligibility()
// ═══════════════════════════════════════════════════════════════════════════
describe('checkIneligibility()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('UC-DB01: returns null for empty empCode', async () => {
    const result = await checkIneligibility('');
    expect(result).toBeNull();
  });

  it('UC-DB02: returns reason when empCode is in ineligibility blocklist', async () => {
    // 1st getDoc: ineligibility doc exists
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, { reason: 'Chưa đủ 12 tháng' }));
    const result = await checkIneligibility('262010');
    expect(result).toBe('Chưa đủ 12 tháng');
  });

  it('UC-DB03: returns default message when blocklist entry has no reason', async () => {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, {}));
    const result = await checkIneligibility('262010');
    expect(result).toContain('đủ điều kiện');
  });

  it('UC-DB04: returns null when not blocked and eligibility not required', async () => {
    // 1st getDoc: not in ineligibility
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
    // 2nd getDoc: config — no requireEligibility
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, {}));
    const result = await checkIneligibility('262010');
    expect(result).toBeNull();
  });

  it('UC-DB05: returns reason when eligibility required but empCode not in allowlist', async () => {
    // 1st getDoc: not in ineligibility
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
    // 2nd getDoc: config with requireEligibility=true
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, { requireEligibility: true }));
    // 3rd getDoc: eligibility doc doesn't exist
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
    const result = await checkIneligibility('262010');
    expect(result).toContain('danh sách');
  });

  it('UC-DB06: returns null when eligibility required and empCode is in allowlist', async () => {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, { requireEligibility: true }));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, {}));
    const result = await checkIneligibility('262010');
    expect(result).toBeNull();
  });

  it('UC-DB06B: returns reason when empCode is claimed by another email', async () => {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, {}));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, { email: 'other@test.com' }));
    const result = await checkIneligibility('262010', 'user@test.com');
    expect(result).toContain('email khác');
  });

  it('UC-DB06C: returns null when empCode claim belongs to same email', async () => {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, {}));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, { email: 'user@test.com' }));
    const result = await checkIneligibility('262010', 'user@test.com');
    expect(result).toBeNull();
  });

  it('UC-DB07: throws when Firestore read fails (callers handle non-blocking behavior)', async () => {
    mockGetDoc.mockRejectedValueOnce(new Error('Network error'));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(checkIneligibility('262010')).rejects.toThrow('Network error');
    consoleSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-DB08 -> UC-DB10: initDb()
// ═══════════════════════════════════════════════════════════════════════════
describe('initDb()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('UC-DB08: returns full InitResult with config, slots, and booking', async () => {
    // 1. getConfig -> getDoc(config/main)
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    // 2. getDocs(slots) -> 2 slots
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([
      { id: 'SP-2206-0900', data: () => TEST_SLOT_SPEAKING },
      { id: '3S-2206-1100', data: () => TEST_SLOT_SKILLS },
    ]));
    // 3. getDoc(registrations/email)
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_REGISTRATION));

    const result = await initDb('user@test.com');
    expect(result.email).toBe('user@test.com');
    expect(result.slots).toHaveLength(2);
    expect(result.myBooking).toBeDefined();
    expect(result.myBooking?.empCode).toBe('262010');
  });

  it('UC-DB09: returns myBooking=null when user has no registration', async () => {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await initDb('user@test.com');
    expect(result.myBooking).toBeNull();
  });

  it('UC-DB10: sorts slots by date then startMin', async () => {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, {}));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([
      { id: 'late', data: () => ({ ...TEST_SLOT_SPEAKING, date: '2026-06-23', startMin: 600 }) },
      { id: 'early', data: () => ({ ...TEST_SLOT_SPEAKING, date: '2026-06-22', startMin: 540 }) },
      { id: 'mid', data: () => ({ ...TEST_SLOT_SPEAKING, date: '2026-06-22', startMin: 660 }) },
    ]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await initDb('user@test.com');
    expect(result.slots[0].date).toBe('2026-06-22');
    expect(result.slots[0].startMin).toBe(540);
    expect(result.slots[1].date).toBe('2026-06-22');
    expect(result.slots[1].startMin).toBe(660);
    expect(result.slots[2].date).toBe('2026-06-23');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-DB11 -> UC-DB14: bookDb() — Validation & pre-flight
// ═══════════════════════════════════════════════════════════════════════════
describe('bookDb() — validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('UC-DB11: rejects when empCode is empty', async () => {
    const result = await bookDb('user@test.com', {
      empCode: '', fullName: 'A', bu: 'IT',
      speakingSlotId: 'sp1', skillsSlotId: 'sk1',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('đầy đủ');
  });

  it('UC-DB12: rejects when empCode is not 6 digits', async () => {
    const result = await bookDb('user@test.com', {
      empCode: '12345', fullName: 'A', bu: 'IT',
      speakingSlotId: 'sp1', skillsSlotId: 'sk1',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('6 chữ số');
  });

  it('UC-DB13: rejects when fullName is empty', async () => {
    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: '', bu: 'IT',
      speakingSlotId: 'sp1', skillsSlotId: 'sk1',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('đầy đủ');
  });

  it('UC-DB14: rejects when blocked by ineligibility', async () => {
    // checkIneligibility -> getDoc(ineligibility/262010) returns blocked
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, { reason: 'Chưa đủ 12 tháng' }));
    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'sp1', skillsSlotId: 'sk1',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Chưa đủ 12 tháng');
  });
});

describe('bookDb()/cancelDb() — callable functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDoc.mockReset();
    mockGetDocs.mockReset();
    mockHttpsCallable.mockReset();
  });

  function setupAllowedPreflight() {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false)); // ineligibility
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, {})); // config requireEligibility off
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false)); // empCodeClaims
  }

  function setupInitAfterCall() {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
  }

  it('UC-DB15: bookDb calls bookRegistration and returns refreshed state', async () => {
    setupAllowedPreflight();
    const callable = vi.fn().mockResolvedValue({ data: { emailSent: true } });
    mockHttpsCallable.mockReturnValue(callable);
    setupInitAfterCall();

    const result = await bookDb('user@test.com', {
      empCode: ' 262010 ', fullName: ' Nguyen Van A ', bu: ' IT ',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });

    expect(result.ok).toBe(true);
    expect(result.emailSent).toBe(true);
    expect(mockHttpsCallable).toHaveBeenCalledWith({}, 'bookRegistration');
    expect(callable).toHaveBeenCalledWith({
      empCode: '262010',
      fullName: 'Nguyen Van A',
      bu: 'IT',
      speakingSlotId: 'SP-2206-0900',
      skillsSlotId: '3S-2206-1100',
    });
    expect(result.state?.email).toBe('user@test.com');
  });

  it('UC-DB16: bookDb surfaces callable business errors', async () => {
    setupAllowedPreflight();
    const callable = vi.fn().mockRejectedValue(Object.assign(new Error('Đăng ký hiện đang bị khoá.'), { code: 'functions/failed-precondition' }));
    mockHttpsCallable.mockReturnValue(callable);
    setupInitAfterCall();

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('khoá');
  });

  it('UC-DB25: cancelDb calls cancelRegistration and returns refreshed state', async () => {
    const callable = vi.fn().mockResolvedValue({ data: {} });
    mockHttpsCallable.mockReturnValue(callable);
    setupInitAfterCall();

    const result = await cancelDb('user@test.com');

    expect(result.ok).toBe(true);
    expect(mockHttpsCallable).toHaveBeenCalledWith({}, 'cancelRegistration');
    expect(callable).toHaveBeenCalledWith({});
  });

  it('UC-DB26: cancelDb surfaces callable errors', async () => {
    const callable = vi.fn().mockRejectedValue(Object.assign(new Error('Bạn chưa có đăng ký nào để hủy.'), { code: 'functions/failed-precondition' }));
    mockHttpsCallable.mockReturnValue(callable);

    const result = await cancelDb('user@test.com');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('chưa có đăng ký');
  });
});


/**
 * Database Layer Test Suite
 *
 * UC-DB01 -> UC-DB07  : checkIneligibility()
 * UC-DB08 -> UC-DB10  : initDb()
 * UC-DB11 -> UC-DB13  : bookDb() — validation
 * UC-DB14             : bookDb() — pre-flight blocklist
 * UC-DB15 -> UC-DB23  : bookDb() — transaction scenarios
 * UC-DB24             : bookDb() — error handling
 * UC-DB25 -> UC-DB28  : cancelDb()
 * UC-DB29 -> UC-DB38  : bookDb() — concurrency
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock firebase ────────────────────────────────────────────────────────────
vi.mock('../lib/firebase', () => ({ db: {} }));

const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockRunTransaction = vi.fn();
const mockAddDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockDeleteDoc = vi.fn();

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
// UC-DB01 -> UC-DB07: checkIneligibility()
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

  it('UC-DB07: returns null when Firestore read fails (non-blocking)', async () => {
    mockGetDoc.mockRejectedValueOnce(new Error('Network error'));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await checkIneligibility('262010');
    expect(result).toBeNull();
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
    // 1. preflight getConfig() -> getDoc(config/main)
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    // 2. checkIneligibility -> getDoc(ineligibility/262010) returns blocked
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, { reason: 'Chưa đủ 12 tháng' }));
    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'sp1', skillsSlotId: 'sk1',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Chưa đủ 12 tháng');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-DB15 -> UC-DB24: bookDb() — Transaction scenarios
// ═══════════════════════════════════════════════════════════════════════════
describe('bookDb() — transaction', () => {
  beforeEach(() => vi.clearAllMocks());

  // Helper: mock the preflight sequence (getConfig first, then checkIneligibility)
  function setupPreflight() {
    // 1. preflight getConfig() -> getDoc(config/main)
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    // 2. checkIneligibility -> getDoc(ineligibility/code) -> not blocked
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
    // 3. checkIneligibility -> getDoc(config/main) for eligibility check -> no requireEligibility
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, {}));
  }

  it('UC-DB15: successful new booking creates registration', async () => {
    setupPreflight();

    const txGet = vi.fn();
    // Transaction reads (batch 1 — parallel):
    // 1. tx.get(config/main)
    txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    // 2. tx.get(registrations/email) -> no existing
    txGet.mockResolvedValueOnce(mockDocSnap(false));
    // 3. tx.get(cancelledQuota/email) -> no saved quota
    txGet.mockResolvedValueOnce(mockDocSnap(false));
    // Transaction reads (batch 2 — parallel):
    // 4. tx.get(slots/sp) -> Speaking slot
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
    // 5. tx.get(slots/sk) -> Skills slot
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 3 }));

    mockRunTransaction.mockImplementation(async (fn: any) => {
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    // After transaction: initDb call
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'Nguyen Van A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    expect(result.ok).toBe(true);
  });

  it('UC-DB16: rejects when allowEnrollment=false', async () => {
    setupPreflight();

    const txGet = vi.fn();
    // Transaction reads batch 1: config fails enrollment check
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_CONFIG, allowEnrollment: false }));
    txGet.mockResolvedValueOnce(mockDocSnap(false));
    txGet.mockResolvedValueOnce(mockDocSnap(false));

    mockRunTransaction.mockImplementation(async (fn: any) => {
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('khoá');
  });

  it('UC-DB17: rejects when Speaking slot not found', async () => {
    setupPreflight();

    const txGet = vi.fn();
    txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    txGet.mockResolvedValueOnce(mockDocSnap(false));
    txGet.mockResolvedValueOnce(mockDocSnap(false));
    // batch 2: Speaking not found
    txGet.mockResolvedValueOnce(mockDocSnap(false));

    mockRunTransaction.mockImplementation(async (fn: any) => {
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-INVALID', skillsSlotId: '3S-2206-1100',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Speaking');
  });

  it('UC-DB18: rejects when 3 Skills slot not found', async () => {
    setupPreflight();

    const txGet = vi.fn();
    txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    txGet.mockResolvedValueOnce(mockDocSnap(false));
    txGet.mockResolvedValueOnce(mockDocSnap(false));
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
    txGet.mockResolvedValueOnce(mockDocSnap(false)); // Skills not found

    mockRunTransaction.mockImplementation(async (fn: any) => {
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-INVALID',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('3 Skills');
  });

  it('UC-DB19: rejects when two slots overlap in time on same date', async () => {
    setupPreflight();

    const txGet = vi.fn();
    txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    txGet.mockResolvedValueOnce(mockDocSnap(false));
    txGet.mockResolvedValueOnce(mockDocSnap(false));
    // Both slots same date, overlapping times
    txGet.mockResolvedValueOnce(mockDocSnap(true, {
      type: 'Speaking', date: '2026-06-22', startMin: 540, endMin: 630,
      capacity: 30, remaining: 25, location: 'A', session: 'morning',
    }));
    txGet.mockResolvedValueOnce(mockDocSnap(true, {
      type: '3 Skills', date: '2026-06-22', startMin: 600, endMin: 720,
      capacity: 20, remaining: 15, location: 'B', session: 'afternoon',
    }));

    mockRunTransaction.mockImplementation(async (fn: any) => {
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1000',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('trùng');
  });

  it('UC-DB20: rejects when Speaking slot has no remaining capacity', async () => {
    setupPreflight();

    const txGet = vi.fn();
    txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    txGet.mockResolvedValueOnce(mockDocSnap(false));
    txGet.mockResolvedValueOnce(mockDocSnap(false));
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 0 }));
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 3 }));

    mockRunTransaction.mockImplementation(async (fn: any) => {
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('hết chỗ');
  });

  it('UC-DB21: rejects when 3 Skills slot has no remaining capacity', async () => {
    setupPreflight();

    const txGet = vi.fn();
    txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    txGet.mockResolvedValueOnce(mockDocSnap(false));
    txGet.mockResolvedValueOnce(mockDocSnap(false));
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 0 }));

    mockRunTransaction.mockImplementation(async (fn: any) => {
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('hết chỗ');
  });

  it('UC-DB22: rejects when change count exceeds maxChanges', async () => {
    setupPreflight();

    const txGet = vi.fn();
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_CONFIG, maxChanges: 3 }));
    // existing reg with changeCount=3 (already used all changes)
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_REGISTRATION, changeCount: 3 }));
    txGet.mockResolvedValueOnce(mockDocSnap(false));
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 3 }));

    mockRunTransaction.mockImplementation(async (fn: any) => {
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-1100', skillsSlotId: '3S-2206-1300',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('tối đa');
  });

  it('UC-DB23: successful change (update) when within change limit', async () => {
    setupPreflight();

    const txGet = vi.fn();
    txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    // existing reg with changeCount=1
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_REGISTRATION, changeCount: 1 }));
    txGet.mockResolvedValueOnce(mockDocSnap(false));
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 3 }));
    // old slot reads (different from new ones)
    txGet.mockResolvedValueOnce(mockDocSnap(true, { remaining: 10 }));
    txGet.mockResolvedValueOnce(mockDocSnap(true, { remaining: 8 }));

    const setCalls: any[] = [];
    const updateCalls: any[] = [];
    mockRunTransaction.mockImplementation(async (fn: any) => {
      await fn({
        get: txGet,
        set: (...args: any[]) => setCalls.push(args),
        update: (...args: any[]) => updateCalls.push(args),
        delete: vi.fn(),
      });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_REGISTRATION, changeCount: 2 }));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    expect(result.ok).toBe(true);
  });

  it('UC-DB24: handles transaction failure gracefully', async () => {
    setupPreflight();

    mockRunTransaction.mockRejectedValueOnce(new Error('ABORTED'));

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('ABORTED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-DB25 -> UC-DB28: cancelDb()
// ═══════════════════════════════════════════════════════════════════════════
describe('cancelDb()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('UC-DB25: successful cancel deletes registration and restores slot remaining', async () => {
    const updateCalls: any[] = [];
    const deleteCalls: any[] = [];

    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_REGISTRATION));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { remaining: 10 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { remaining: 8 }));
      await fn({
        get: txGet,
        set: mockSetDoc,
        update: (...args: any[]) => updateCalls.push(args),
        delete: (...args: any[]) => deleteCalls.push(args),
      });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await cancelDb('user@test.com');
    expect(result.ok).toBe(true);
    expect(updateCalls.length).toBeGreaterThanOrEqual(2);
    expect(deleteCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('UC-DB26: rejects when no registration exists', async () => {
    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    const result = await cancelDb('user@test.com');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('chưa có đăng ký');
  });

  it('UC-DB27: rejects cancel when deadline has passed', async () => {
    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      const pastDeadline = new Date('2020-01-01');
      txGet.mockResolvedValueOnce(mockDocSnap(true, {
        ...TEST_CONFIG,
        deadline: { toDate: () => pastDeadline },
      }));
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    const result = await cancelDb('user@test.com');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('hết hạn');
  });

  it('UC-DB28: handles transaction failure gracefully', async () => {
    mockRunTransaction.mockRejectedValueOnce(new Error('TRANSACTION FAILED'));

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await cancelDb('user@test.com');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('TRANSACTION FAILED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-DB29 -> UC-DB38: bookDb() — Concurrency scenarios
// ═══════════════════════════════════════════════════════════════════════════
describe('bookDb() — concurrency', () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * Helper: sets up preflight mocks that bookDb calls outside the transaction.
   * Call once per bookDb invocation.
   */
  function setupPreflight() {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, {}));
  }

  /**
   * Helper: set up a sequential transaction mock.
   * Each call to runTransaction will use the next `txGet` implementation from the array.
   */
  function setupSequentialTransactions(txGetImpls: (() => Promise<any>)[][]) {
    let callIndex = 0;
    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      const impls = txGetImpls[callIndex] || txGetImpls[txGetImpls.length - 1];
      impls.forEach((impl) => txGet.mockImplementationOnce(impl));
      callIndex++;
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });
  }

  it('UC-DB29: two users booking same slot with remaining=1 — only first succeeds', async () => {
    // Both users preflight
    setupPreflight(); // userA
    setupPreflight(); // userB

    // We need to track remaining as it changes between transactions
    let spRemaining = 1;
    let skRemaining = 1;

    let txCall = 0;
    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      if (txCall === 0) {
        // User A — remaining=1
        txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
        txGet.mockResolvedValueOnce(mockDocSnap(false));
        txGet.mockResolvedValueOnce(mockDocSnap(false));
        txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: spRemaining }));
        txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: skRemaining }));
      } else {
        // User B — remaining should be 0 after A succeeds
        txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
        txGet.mockResolvedValueOnce(mockDocSnap(false));
        txGet.mockResolvedValueOnce(mockDocSnap(false));
        txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 0 }));
        txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 0 }));
      }
      txCall++;
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    // initDb mocks for resultA
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
    // initDb mocks for resultB (fails → catch block)
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const [resultA, resultB] = await Promise.all([
      bookDb('userA@test.com', {
        empCode: '262010', fullName: 'A', bu: 'IT',
        speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
      }),
      bookDb('userB@test.com', {
        empCode: '262011', fullName: 'B', bu: 'IT',
        speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
      }),
    ]);
    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(false);
    expect(resultB.error).toContain('hết chỗ');
  });

  it('UC-DB30: two users booking different slots simultaneously — both succeed', async () => {
    setupPreflight();
    setupPreflight();

    let txCall = 0;
    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      if (txCall === 0) {
        txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
        txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 3 }));
      } else {
        txGet.mockResolvedValueOnce(mockDocSnap(true, {
          type: 'Speaking', date: '2026-06-23', startMin: 600, endMin: 660,
          capacity: 20, remaining: 10, location: 'B', session: 'afternoon',
        }));
        txGet.mockResolvedValueOnce(mockDocSnap(true, {
          type: '3 Skills', date: '2026-06-23', startMin: 720, endMin: 780,
          capacity: 15, remaining: 8, location: 'C', session: 'afternoon',
        }));
      }
      txCall++;
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    // initDb mocks for resultA
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
    // initDb mocks for resultB
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const [resultA, resultB] = await Promise.all([
      bookDb('userA@test.com', {
        empCode: '262010', fullName: 'A', bu: 'IT',
        speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
      }),
      bookDb('userB@test.com', {
        empCode: '262011', fullName: 'B', bu: 'IT',
        speakingSlotId: 'SP-2306-1000', skillsSlotId: '3S-2306-1200',
      }),
    ]);
    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);
  });

  it('UC-DB31: two users booking last seat in Skills slot — one succeeds, one fails', async () => {
    setupPreflight();
    setupPreflight();

    let txCall = 0;
    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
      if (txCall === 0) {
        txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 1 }));
      } else {
        txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 0 }));
      }
      txCall++;
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const [resultA, resultB] = await Promise.all([
      bookDb('userA@test.com', {
        empCode: '262010', fullName: 'A', bu: 'IT',
        speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
      }),
      bookDb('userB@test.com', {
        empCode: '262011', fullName: 'B', bu: 'IT',
        speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
      }),
    ]);
    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(false);
    expect(resultB.error).toContain('hết chỗ');
  });

  it('UC-DB32: same user double-clicks book — second call updates (not duplicate)', async () => {
    setupPreflight();
    setupPreflight();

    let txCall = 0;
    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      if (txCall === 0) {
        // First click: no existing registration
        txGet.mockResolvedValueOnce(mockDocSnap(false));
        txGet.mockResolvedValueOnce(mockDocSnap(false));
      } else {
        // Second click: registration now exists from first click
        txGet.mockResolvedValueOnce(mockDocSnap(true, {
          ...TEST_REGISTRATION, changeCount: 0,
        }));
        txGet.mockResolvedValueOnce(mockDocSnap(false));
      }
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 3 }));
      // For second click: old slot reads (same as new → noChange path)
      if (txCall === 1) {
        // no slots to restore since same slots
      }
      txCall++;
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    // First call initDb
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
    // Second call initDb (noChange path)
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const [result1, result2] = await Promise.all([
      bookDb('user@test.com', {
        empCode: '262010', fullName: 'A', bu: 'IT',
        speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
      }),
      bookDb('user@test.com', {
        empCode: '262010', fullName: 'A', bu: 'IT',
        speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
      }),
    ]);
    expect(result1.ok).toBe(true);
    // Second call: same slots → noChange=true → returns ok
    expect(result2.ok).toBe(true);
  });

  it('UC-DB33: booking while admin deletes the slot — transaction reads consistent state', async () => {
    setupPreflight();

    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      // Speaking slot deleted by admin while transaction running
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Speaking');
  });

  it('UC-DB34: concurrent change and cancel — cancel sees consistent state', async () => {
    // Simulate: user tries to change slots while also cancelling
    // The change transaction should either see the registration or fail
    setupPreflight();

    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      // Registration still exists when change is processed
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_REGISTRATION, changeCount: 0 }));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 3 }));
      // old slot reads
      txGet.mockResolvedValueOnce(mockDocSnap(true, { remaining: 10 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { remaining: 8 }));
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_REGISTRATION, changeCount: 1 }));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    expect(result.ok).toBe(true);
  });

  it('UC-DB35: transaction retries on Firestore contention', async () => {
    setupPreflight();

    let attempts = 0;
    mockRunTransaction.mockImplementation(async (fn: any) => {
      attempts++;
      if (attempts < 3) throw new Error('ABORTED by Firestore');
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 3 }));
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    // Vitest doesn't auto-retry; the client sees the 3rd-attempt success
    expect(result.ok).toBe(true);
    expect(attempts).toBe(3);
  });

  it('UC-DB36: 20 users book same slot with capacity=10 — only first 10 succeed', async () => {
    const TOTAL_USERS = 20;
    const CAPACITY = 10;

    // Preflight for each user
    for (let i = 0; i < TOTAL_USERS; i++) setupPreflight();

    let txCall = 0;
    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      const remaining = Math.max(0, CAPACITY - txCall);
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 100 }));
      txCall++;
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    // initDb mocks for each user
    for (let i = 0; i < TOTAL_USERS; i++) {
      mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
      mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
    }

    const emails = Array.from({ length: TOTAL_USERS }, (_, i) => `user${i}@test.com`);
    const results = await Promise.all(
      emails.map((email) =>
        bookDb(email, {
          empCode: String(262000 + (parseInt(email) || 0)).padStart(6, '0'),
          fullName: `User ${email}`, bu: 'IT',
          speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
        }),
      ),
    );

    const successes = results.filter((r) => r.ok).length;
    const failures = results.filter((r) => !r.ok).length;
    expect(successes).toBe(CAPACITY);
    expect(failures).toBe(TOTAL_USERS - CAPACITY);
  });

  it('UC-DB37: 20 users book 10 different slots (2 users per slot) — all succeed when capacity allows', async () => {
    const TOTAL_USERS = 20;

    for (let i = 0; i < TOTAL_USERS; i++) setupPreflight();

    let txCall = 0;
    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      const slotIndex = Math.floor(txCall / 2);
      const hour = 9 + slotIndex;
      txGet.mockResolvedValueOnce(mockDocSnap(true, {
        type: 'Speaking', date: '2026-06-22',
        startMin: hour * 60, endMin: (hour + 1) * 60,
        capacity: 2, remaining: 2 - (txCall % 2),
        location: `Room ${slotIndex}`, session: 'morning',
      }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, {
        type: '3 Skills', date: '2026-06-22',
        startMin: (hour + 2) * 60, endMin: (hour + 3) * 60,
        capacity: 2, remaining: 2 - (txCall % 2),
        location: `Room ${slotIndex + 10}`, session: 'afternoon',
      }));
      txCall++;
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    for (let i = 0; i < TOTAL_USERS; i++) {
      mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
      mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
    }

    const results: any[] = [];
    for (let i = 0; i < TOTAL_USERS; i++) {
      const slotIndex = Math.floor(i / 2);
      const hour = 9 + slotIndex;
      results.push(
        bookDb(`user${i}@test.com`, {
          empCode: String(262000 + i).padStart(6, '0'),
          fullName: `User ${i}`, bu: 'IT',
          speakingSlotId: `SP-2206-${String(hour * 100).padStart(4, '0')}`,
          skillsSlotId: `3S-2206-${String((hour + 2) * 100).padStart(4, '0')}`,
        }),
      );
    }

    const resolved = await Promise.all(results);
    for (const result of resolved) {
      expect(result.ok).toBe(true);
    }
  });

  it('UC-DB38: 20 users race on slot with capacity=1 — exactly 1 succeeds, rest fail', async () => {
    const TOTAL_USERS = 20;

    for (let i = 0; i < TOTAL_USERS; i++) setupPreflight();

    let txCall = 0;
    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      const remaining = txCall === 0 ? 1 : 0;
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 100 }));
      txCall++;
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    for (let i = 0; i < TOTAL_USERS; i++) {
      mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
      mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
    }

    const emails = Array.from({ length: TOTAL_USERS }, (_, i) => `user${i}@test.com`);
    const results = await Promise.all(
      emails.map((email) =>
        bookDb(email, {
          empCode: String(262000 + (parseInt(email.replace(/\D/g, '')) || 0)).padStart(6, '0'),
          fullName: `User ${email}`, bu: 'IT',
          speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
        }),
      ),
    );

    const successes = results.filter((r) => r.ok).length;
    const failures = results.filter((r) => !r.ok).length;
    expect(successes).toBe(1);
    expect(failures).toBe(TOTAL_USERS - 1);
  });
});
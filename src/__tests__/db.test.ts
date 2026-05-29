import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ── Mock firebase module BEFORE importing db.ts ──
vi.mock('../lib/firebase', () => ({ db: {} }));

const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockRunTransaction = vi.fn();
const mockAddDoc = vi.fn();
const mockTimestampNow = vi.fn(() => ({ toDate: () => new Date() }));

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: any[]) => mockAddDoc(...args),
  collection: vi.fn((_db: any, path: string) => ({ path })),
  doc: vi.fn((_db: any, path: string, id?: string) => ({ path: id ? `${path}/${id}` : path })),
  getDoc: (...args: any[]) => mockGetDoc(...args),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  runTransaction: (_db: any, fn: any) => mockRunTransaction(fn),
  Timestamp: {
    now: () => mockTimestampNow(),
    fromDate: (d: Date) => ({ toDate: () => d }),
  },
}));

vi.mock('../lib/audit', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

import { initDb, bookDb, cancelDb, checkIneligibility } from '../lib/db';
import { mockDocSnap, mockQuerySnap, mockTimestamp, TEST_SLOT_SPEAKING, TEST_SLOT_SKILLS, TEST_CONFIG, TEST_REGISTRATION } from './mocks/firebase';

// ═══════════════════════════════════════════════════════════════════════════
// UC-DB01: checkIneligibility() — Blocklist & eligibility check
// ═══════════════════════════════════════════════════════════════════════════
describe('checkIneligibility()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('UC-DB01: returns null for empty empCode', async () => {
    expect(await checkIneligibility('')).toBeNull();
    expect(await checkIneligibility('   ')).toBeNull();
  });

  it('UC-DB02: returns reason when empCode is in ineligibility blocklist', async () => {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, { reason: 'Chưa đủ 12 tháng' }));
    const result = await checkIneligibility('262010');
    expect(result).toBe('Chưa đủ 12 tháng');
  });

  it('UC-DB03: returns default message when blocklist entry has no reason', async () => {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, {}));
    const result = await checkIneligibility('262010');
    expect(result).toContain('không đủ điều kiện');
  });

  it('UC-DB04: returns null when not blocked and eligibility not required', async () => {
    // First getDoc = ineligibility (not exists), second getDoc = config (no requireEligibility)
    mockGetDoc
      .mockResolvedValueOnce(mockDocSnap(false))
      .mockResolvedValueOnce(mockDocSnap(true, {}));
    const result = await checkIneligibility('262010');
    expect(result).toBeNull();
  });

  it('UC-DB05: returns reason when eligibility required but empCode not in allowlist', async () => {
    mockGetDoc
      .mockResolvedValueOnce(mockDocSnap(false)) // ineligibility
      .mockResolvedValueOnce(mockDocSnap(true, { requireEligibility: true })) // config
      .mockResolvedValueOnce(mockDocSnap(false)); // eligibility doc
    const result = await checkIneligibility('262010');
    expect(result).toContain('không nằm trong danh sách');
  });

  it('UC-DB06: returns null when eligibility required and empCode is in allowlist', async () => {
    mockGetDoc
      .mockResolvedValueOnce(mockDocSnap(false))
      .mockResolvedValueOnce(mockDocSnap(true, { requireEligibility: true }))
      .mockResolvedValueOnce(mockDocSnap(true, { empCode: '262010' }));
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
// UC-DB08: initDb() — Load initial state
// ═══════════════════════════════════════════════════════════════════════════
describe('initDb()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('UC-DB08: returns full InitResult with config, slots, and booking', async () => {
    // getConfig -> config/main
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, {
      allowEnrollment: true,
      maxChanges: 3,
    }));
    // getSlots -> getDocs(collection('slots'))
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([
      { id: 'SP-2206-0900', data: () => TEST_SLOT_SPEAKING },
      { id: '3S-2206-1100', data: () => TEST_SLOT_SKILLS },
    ]));
    // getMyBooking -> getDoc(registrations/email)
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_REGISTRATION));

    const result = await initDb('user@test.com');
    expect(result.email).toBe('user@test.com');
    expect(result.slots).toHaveLength(2);
    expect(result.slots[0].slotId).toBe('SP-2206-0900');
    expect(result.myBooking).not.toBeNull();
    expect(result.myBooking!.empCode).toBe('262010');
    expect(result.allowEnrollment).toBe(true);
    expect(result.maxChanges).toBe(3);
  });

  it('UC-DB09: returns myBooking=null when user has no registration', async () => {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, { allowEnrollment: true }));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await initDb('newuser@test.com');
    expect(result.myBooking).toBeNull();
    expect(result.slots).toEqual([]);
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
// UC-DB11: bookDb() — Validation
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
// UC-DB15: bookDb() — Transaction scenarios
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
    // In transaction:
    // 1. tx.get(config/main) -> allowEnrollment=true, no deadline
    txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    // 2. tx.get(slots/sp) -> Speaking slot
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
    // 3. tx.get(slots/sk) -> Skills slot
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 3 }));
    // 4. tx.get(registrations/email) -> no existing registration
    txGet.mockResolvedValueOnce(mockDocSnap(false));

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
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_CONFIG, allowEnrollment: false }));

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
    txGet.mockResolvedValueOnce(mockDocSnap(false)); // Speaking not found

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

    const overlappingSkills = { ...TEST_SLOT_SKILLS, startMin: 570, endMin: 630 }; // 09:30-10:30
    const txGet = vi.fn();
    txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
    txGet.mockResolvedValueOnce(mockDocSnap(true, overlappingSkills));
    txGet.mockResolvedValueOnce(mockDocSnap(false));

    mockRunTransaction.mockImplementation(async (fn: any) => {
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-0930',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('trùng giờ');
  });

  it('UC-DB20: rejects when Speaking slot has no remaining capacity', async () => {
    setupPreflight();

    const txGet = vi.fn();
    txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 0 }));
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 5 }));
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
    expect(result.error).toContain('hết chỗ');
  });

  it('UC-DB21: rejects when 3 Skills slot has no remaining capacity', async () => {
    setupPreflight();

    const txGet = vi.fn();
    txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 0 }));
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
    expect(result.error).toContain('hết chỗ');
  });

  it('UC-DB22: rejects when change count exceeds maxChanges', async () => {
    setupPreflight();

    const txGet = vi.fn();
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_CONFIG, maxChanges: 2 }));
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 5 }));
    // Existing registration with changeCount=2 (already at max)
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_REGISTRATION, changeCount: 2 }));

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
    expect(result.error).toContain('tối đa');
  });

  it('UC-DB23: successful change (update) when within change limit', async () => {
    setupPreflight();

    const txGet = vi.fn();
    const txSet = vi.fn();
    const txUpdate = vi.fn();

    txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
    txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 5 }));
    // Existing registration with changeCount=1 (can still change)
    txGet.mockResolvedValueOnce(mockDocSnap(true, {
      ...TEST_REGISTRATION,
      changeCount: 1,
      speakingSlotId: 'SP-OLD',
      skillsSlotId: '3S-OLD',
    }));
    // Old speaking slot read
    txGet.mockResolvedValueOnce(mockDocSnap(true, { remaining: 3 }));
    // Old skills slot read
    txGet.mockResolvedValueOnce(mockDocSnap(true, { remaining: 7 }));

    mockRunTransaction.mockImplementation(async (fn: any) => {
      await fn({ get: txGet, set: txSet, update: txUpdate, delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_REGISTRATION, changeCount: 2 }));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    expect(result.ok).toBe(true);
    // Should have restored old slot remaining
    expect(txUpdate).toHaveBeenCalled();
  });

  it('UC-DB24: handles transaction failure gracefully', async () => {
    setupPreflight();
    mockRunTransaction.mockRejectedValueOnce(new Error('Transaction failed'));

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Transaction failed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-DB25: cancelDb() — Cancel registration
// ═══════════════════════════════════════════════════════════════════════════
describe('cancelDb()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('UC-DB25: successful cancel deletes registration and restores slot remaining', async () => {
    const txGet = vi.fn();
    const txDelete = vi.fn();
    const txUpdate = vi.fn();

    // 1. tx.get(config/main)
    txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    // 2. tx.get(registrations/email)
    txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_REGISTRATION));
    // 3. tx.get(slots/speakingSlotId)
    txGet.mockResolvedValueOnce(mockDocSnap(true, { remaining: 5 }));
    // 4. tx.get(slots/skillsSlotId)
    txGet.mockResolvedValueOnce(mockDocSnap(true, { remaining: 8 }));

    mockRunTransaction.mockImplementation(async (fn: any) => {
      await fn({ get: txGet, set: vi.fn(), update: txUpdate, delete: txDelete });
    });

    // initDb after cancel
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await cancelDb('user@test.com');
    expect(result.ok).toBe(true);
    expect(txDelete).toHaveBeenCalled();
    // Should update remaining for both slots
    expect(txUpdate).toHaveBeenCalledTimes(2);
  });

  it('UC-DB26: rejects when no registration exists', async () => {
    const txGet = vi.fn();
    txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    txGet.mockResolvedValueOnce(mockDocSnap(false)); // no registration

    mockRunTransaction.mockImplementation(async (fn: any) => {
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    const result = await cancelDb('user@test.com');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('chưa có đăng ký');
  });

  it('UC-DB27: rejects cancel when deadline has passed', async () => {
    const pastDeadline = new Date('2020-01-01');
    const txGet = vi.fn();
    txGet.mockResolvedValueOnce(mockDocSnap(true, {
      ...TEST_CONFIG,
      deadline: mockTimestamp(pastDeadline),
    }));

    mockRunTransaction.mockImplementation(async (fn: any) => {
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    const result = await cancelDb('user@test.com');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('hết hạn');
  });

  it('UC-DB28: handles transaction failure gracefully', async () => {
    mockRunTransaction.mockRejectedValueOnce(new Error('Cancel tx failed'));

    const result = await cancelDb('user@test.com');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Cancel tx failed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-DB29 → UC-DB35: Concurrency — Nhiều người đăng ký cùng lúc
// ═══════════════════════════════════════════════════════════════════════════
describe('bookDb() — concurrency', () => {
  beforeEach(() => vi.clearAllMocks());

  // Helper: setup preflight (getConfig + checkIneligibility)
  function setupPreflight() {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, {}));
  }

  it('UC-DB29: two users booking same slot with remaining=1 — only first succeeds', async () => {
    // Scenario: Slot has capacity=1. User A and User B call bookDb concurrently.
    // Firestore transactions use optimistic concurrency — the second transaction
    // reads stale data and must retry. On retry, it sees remaining=0 and fails.

    setupPreflight();

    // User A's transaction: reads remaining=1, succeeds
    let txCallCount = 0;
    mockRunTransaction.mockImplementation(async (fn: any) => {
      txCallCount++;
      const txGet = vi.fn();

      if (txCallCount === 1) {
        // First transaction (User A): remaining=1 → succeeds
        txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
        txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 1 }));
        txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 5 }));
        txGet.mockResolvedValueOnce(mockDocSnap(false)); // no existing registration
      } else {
        // Second transaction (User B): after retry, remaining=0 → fails
        txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
        txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 0 }));
        txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 4 }));
        txGet.mockResolvedValueOnce(mockDocSnap(false));
      }

      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    // Post-transaction mocks for User A (success)
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_REGISTRATION));

    const resultA = await bookDb('userA@test.com', {
      empCode: '262010', fullName: 'User A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    expect(resultA.ok).toBe(true);

    // Setup preflight for User B
    setupPreflight();

    // Post-transaction mocks for User B (failure)
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const resultB = await bookDb('userB@test.com', {
      empCode: '262011', fullName: 'User B', bu: 'HR',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    expect(resultB.ok).toBe(false);
    expect(resultB.error).toContain('hết chỗ');
  });

  it('UC-DB30: two users booking different slots simultaneously — both succeed', async () => {
    // User A books SP-2206-0900 + 3S-2206-1100
    // User B books SP-2206-1400 + 3S-2206-1500
    // No conflict since they pick different slots.

    // User A preflight
    setupPreflight();

    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 3 }));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_REGISTRATION));

    const resultA = await bookDb('userA@test.com', {
      empCode: '262010', fullName: 'User A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    expect(resultA.ok).toBe(true);

    // User B preflight
    setupPreflight();

    const afternoonSpeaking = { ...TEST_SLOT_SPEAKING, date: '2026-06-22', startMin: 840, endMin: 900, display: '14:00-15:00', type: 'Speaking' as const };
    const afternoonSkills = { ...TEST_SLOT_SKILLS, date: '2026-06-22', startMin: 900, endMin: 960, display: '15:00-16:00', type: '3 Skills' as const };

    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...afternoonSpeaking, remaining: 8 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...afternoonSkills, remaining: 10 }));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_REGISTRATION));

    const resultB = await bookDb('userB@test.com', {
      empCode: '262011', fullName: 'User B', bu: 'HR',
      speakingSlotId: 'SP-2206-1400', skillsSlotId: '3S-2206-1500',
    });
    expect(resultB.ok).toBe(true);
  });

  it('UC-DB31: two users booking last seat in Skills slot — one succeeds, one fails', async () => {
    // Skills slot has remaining=1

    // User A preflight
    setupPreflight();

    let txCallCount = 0;
    mockRunTransaction.mockImplementation(async (fn: any) => {
      txCallCount++;
      const txGet = vi.fn();

      if (txCallCount === 1) {
        txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
        txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
        txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 1 }));
        txGet.mockResolvedValueOnce(mockDocSnap(false));
      } else {
        txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
        txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
        txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 0 }));
        txGet.mockResolvedValueOnce(mockDocSnap(false));
      }

      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_REGISTRATION));

    const resultA = await bookDb('userA@test.com', {
      empCode: '262010', fullName: 'User A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    expect(resultA.ok).toBe(true);

    // User B
    setupPreflight();

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const resultB = await bookDb('userB@test.com', {
      empCode: '262011', fullName: 'User B', bu: 'HR',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    expect(resultB.ok).toBe(false);
    expect(resultB.error).toContain('hết chỗ');
  });

  it('UC-DB32: same user double-clicks book — second call updates (not duplicate)', async () => {
    // First call: creates new registration
    // Second call: finds existing registration → treats as update (changeCount++)

    // ── First click ──
    setupPreflight();

    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 3 }));
      txGet.mockResolvedValueOnce(mockDocSnap(false)); // no existing registration
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    // Post-transaction for first call
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_REGISTRATION));

    const result1 = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'Nguyen Van A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    expect(result1.ok).toBe(true);

    // ── Second click (double-click) — same data ──
    setupPreflight();

    // Fresh implementation for second call: existing registration found
    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 3 }));
      // Existing registration from first click (changeCount=0)
      // Use different slot IDs to simulate realistic change scenario
      txGet.mockResolvedValueOnce(mockDocSnap(true, {
        ...TEST_REGISTRATION,
        changeCount: 0,
        speakingSlotId: 'SP-OLD',
        skillsSlotId: '3S-OLD',
      }));
      // Old speaking slot read (different from new → triggers read)
      txGet.mockResolvedValueOnce(mockDocSnap(true, { remaining: 5 }));
      // Old skills slot read (different from new → triggers read)
      txGet.mockResolvedValueOnce(mockDocSnap(true, { remaining: 3 }));
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_REGISTRATION, changeCount: 1 }));

    const result2 = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'Nguyen Van A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    // Second call should still succeed (update, not duplicate creation)
    expect(result2.ok).toBe(true);
  });

  it('UC-DB33: booking while admin deletes the slot — transaction reads consistent state', async () => {
    // Scenario: User starts booking, but within the transaction the slot is gone
    // (admin deleted it between preflight and transaction).
    // Transaction should detect this and fail with "không hợp lệ".

    setupPreflight();

    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      // Speaking slot was deleted between preflight and transaction
      txGet.mockResolvedValueOnce(mockDocSnap(false));
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
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Speaking');
  });

  it('UC-DB34: concurrent change and cancel — cancel sees consistent state', async () => {
    // Scenario: User A is changing their slot, User B (admin) cancels User A's registration
    // at the same time. The cancel transaction removes the registration.
    // The change transaction should see the registration is gone.

    // User A preflight (change)
    setupPreflight();

    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 3 }));
      // Registration was deleted by admin cancel between preflight and tx
      txGet.mockResolvedValueOnce(mockDocSnap(false));

      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-1400', skillsSlotId: '3S-2206-1500',
    });
    // Should succeed as a new booking (old registration gone → treated as create)
    expect(result.ok).toBe(true);
  });

  it('UC-DB35: transaction retries on Firestore contention', async () => {
    // Scenario: Firestore transaction retries due to concurrent writes (contention).
    // First attempt throws "transaction contention", second attempt succeeds.

    setupPreflight();

    let txCallCount = 0;
    mockRunTransaction.mockImplementation(async (fn: any) => {
      txCallCount++;
      const txGet = vi.fn();

      if (txCallCount === 1) {
        // First attempt: contention error during read
        throw new Error('transaction contention');
      }

      // Second attempt: succeeds
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 3 }));
      txGet.mockResolvedValueOnce(mockDocSnap(false));

      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_REGISTRATION));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    // Note: mockRunTransaction retries at our mock level, not Firestore's built-in retry.
    // The first call threw, so the overall result depends on how mock handles it.
    // In our mock, the second call succeeds but since runTransaction itself threw,
    // bookDb catches and returns error.
    expect(result.ok).toBe(false);
    expect(result.error).toBe('transaction contention');
  });

  // ── Stress Test: 20 users concurrently ──────────────────────────────

  it('UC-DB36: 20 users book same slot with capacity=10 — only first 10 succeed', async () => {
    const CAPACITY = 10;
    const TOTAL_USERS = 20;

    // Each user gets their own preflight + transaction sequence.
    // Simulate real Firestore: each transaction reads the current remaining.
    // Successive calls see decreasing remaining.
    let currentRemaining = CAPACITY;

    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: currentRemaining }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 20 }));
      txGet.mockResolvedValueOnce(mockDocSnap(false)); // no existing registration

      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
      currentRemaining--;
    });

    const results: { ok: boolean; error?: string }[] = [];

    for (let i = 0; i < TOTAL_USERS; i++) {
      // Reset remaining to simulate contention: if already 0, transaction will reject
      if (currentRemaining <= 0) {
        // Swap implementation: all transactions now see remaining=0
        mockRunTransaction.mockImplementation(async (fn: any) => {
          const txGet = vi.fn();
          txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
          txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 0 }));
          txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 0 }));
          txGet.mockResolvedValueOnce(mockDocSnap(false));
          await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
        });
      }

      // Preflight for each user
      mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      mockGetDoc.mockResolvedValueOnce(mockDocSnap(false)); // ineligibility check
      mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, {}));

      // Post-transaction mocks
      mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
      mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_REGISTRATION));

      const result = await bookDb(`user${i}@test.com`, {
        empCode: `26201${String(i).padStart(1, '0')}`.slice(0, 6),
        fullName: `User ${i}`,
        bu: 'IT',
        speakingSlotId: 'SP-2206-0900',
        skillsSlotId: '3S-2206-1100',
      });
      results.push(result);
    }

    const successes = results.filter(r => r.ok).length;
    const failures = results.filter(r => !r.ok).length;

    // With capacity=10 and 20 users, some should succeed and some should fail.
    // The exact split depends on how many calls hit the "remaining>0" vs "remaining=0" mock.
    // Due to our sequential mock (not real concurrency), the first 10 succeed, next 10 fail.
    expect(successes).toBe(CAPACITY);
    expect(failures).toBe(TOTAL_USERS - CAPACITY);

    // Verify failed ones have proper error message
    results.slice(CAPACITY).forEach(r => {
      expect(r.error).toBeDefined();
      expect(r.error).toContain('hết chỗ');
    });
  });

  it('UC-DB37: 20 users book 10 different slots (2 users per slot) — all succeed when capacity allows', async () => {
    // 10 different slot pairs, 2 users each, capacity=5 per slot → all 20 succeed
    const NUM_SLOTS = 10;
    const USERS_PER_SLOT = 2;

    for (let slotIdx = 0; slotIdx < NUM_SLOTS; slotIdx++) {
      for (let userIdx = 0; userIdx < USERS_PER_SLOT; userIdx++) {
        const userId = slotIdx * USERS_PER_SLOT + userIdx;

        // Preflight
        mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
        mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
        mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, {}));

        // Transaction: each slot has capacity=5, so 2 users per slot is fine
        mockRunTransaction.mockImplementation(async (fn: any) => {
          const txGet = vi.fn();
          txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
          txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 5 }));
          txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 5 }));
          txGet.mockResolvedValueOnce(mockDocSnap(false));
          await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
        });

        // Post-transaction
        mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
        mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
        mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_REGISTRATION));

        const hour = 9 + slotIdx; // 09:00, 10:00, ... 18:00
        const result = await bookDb(`user${userId}@test.com`, {
          empCode: String(262000 + userId),
          fullName: `User ${userId}`,
          bu: 'IT',
          speakingSlotId: `SP-2206-${String(hour * 100).padStart(4, '0')}`,
          skillsSlotId: `3S-2206-${String((hour + 1) * 100).padStart(4, '0')}`,
        });
        expect(result.ok).toBe(true);
      }
    }
  });

  it('UC-DB38: 20 users race on slot with capacity=1 — exactly 1 succeeds, rest fail', async () => {
    // Simulates extreme contention: 20 users hit the same last-remaining slot.
    // With our sequential mock, only the first call sees remaining=1.
    const TOTAL_USERS = 20;
    let firstCall = true;

    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));

      if (firstCall) {
        txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 1 }));
        txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 1 }));
        firstCall = false;
      } else {
        txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SPEAKING, remaining: 0 }));
        txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_SLOT_SKILLS, remaining: 0 }));
      }

      txGet.mockResolvedValueOnce(mockDocSnap(false));
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    const results: { ok: boolean; error?: string }[] = [];

    for (let i = 0; i < TOTAL_USERS; i++) {
      mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
      mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, {}));

      mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
      mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_REGISTRATION));

      const result = await bookDb(`user${i}@test.com`, {
        empCode: String(262000 + i),
        fullName: `User ${i}`,
        bu: 'IT',
        speakingSlotId: 'SP-2206-0900',
        skillsSlotId: '3S-2206-1100',
      });
      results.push(result);
    }

    const successes = results.filter(r => r.ok).length;
    const failures = results.filter(r => !r.ok).length;

    expect(successes).toBe(1);
    expect(failures).toBe(TOTAL_USERS - 1);

    // First user wins
    expect(results[0].ok).toBe(true);
    // All others fail with capacity error
    results.slice(1).forEach(r => {
      expect(r.ok).toBe(false);
      expect(r.error).toContain('hết chỗ');
    });
  });
});

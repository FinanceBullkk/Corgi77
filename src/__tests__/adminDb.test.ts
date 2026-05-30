import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock firebase module BEFORE importing adminDb.ts ──
vi.mock('../lib/firebase', () => ({ db: {} }));

const mockSetDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockAddDoc = vi.fn();
const mockRunTransaction = vi.fn();

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: any[]) => mockAddDoc(...args),
  collection: vi.fn((_db: any, path: string) => ({ path })),
  doc: vi.fn((_db: any, path: string, id?: string) => ({ path: id ? `${path}/${id}` : path })),
  getDoc: (...args: any[]) => mockGetDoc(...args),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  setDoc: (...args: any[]) => mockSetDoc(...args),
  updateDoc: (...args: any[]) => mockUpdateDoc(...args),
  deleteDoc: (...args: any[]) => mockDeleteDoc(...args),
  runTransaction: (_db: any, fn: any) => mockRunTransaction(fn),
  query: vi.fn((...args: any[]) => args),
  where: vi.fn(),
  deleteField: () => 'DELETE_FIELD',
  serverTimestamp: () => 'SERVER_TIMESTAMP',
  Timestamp: {
    now: () => ({ toDate: () => new Date() }),
    fromDate: (d: Date) => ({ toDate: () => d }),
  },
}));

vi.mock('../lib/audit', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

import {
  listSlots,
  generateSlotId,
  adminCreateSlot,
  adminDeleteSlot,
  listRegistrations,
  adminDeleteRegistration,
  backfillEmpCodeClaims,
  updateConfig,
  updateSlot,
  listIneligibility,
  upsertIneligibility,
  deleteIneligibility,
} from '../lib/adminDb';
import { mockDocSnap, mockQuerySnap, TEST_SLOT_SPEAKING, TEST_SLOT_SKILLS, TEST_REGISTRATION } from './mocks/firebase';

// ═══════════════════════════════════════════════════════════════════════════
// UC-AD01: listSlots() — Load all slots sorted by date+startMin
// ═══════════════════════════════════════════════════════════════════════════
describe('listSlots()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('UC-AD01: returns mapped slot objects with slotId', async () => {
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([
      { id: 'SP-2206-0900', data: () => TEST_SLOT_SPEAKING },
      { id: '3S-2206-1100', data: () => TEST_SLOT_SKILLS },
    ]));
    const result = await listSlots();
    expect(result).toHaveLength(2);
    expect(result[0].slotId).toBe('SP-2206-0900');
    expect(result[0].type).toBe('Speaking');
    expect(result[1].slotId).toBe('3S-2206-1100');
    expect(result[1].type).toBe('3 Skills');
  });

  it('UC-AD02: returns empty array when no slots exist', async () => {
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    const result = await listSlots();
    expect(result).toEqual([]);
  });

  it('UC-AD03: sorts slots by date then startMin', async () => {
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([
      { id: 'late', data: () => ({ ...TEST_SLOT_SPEAKING, date: '2026-06-23', startMin: 600 }) },
      { id: 'early', data: () => ({ ...TEST_SLOT_SPEAKING, date: '2026-06-22', startMin: 540 }) },
      { id: 'mid', data: () => ({ ...TEST_SLOT_SPEAKING, date: '2026-06-22', startMin: 660 }) },
    ]));
    const result = await listSlots();
    expect(result[0].date).toBe('2026-06-22');
    expect(result[0].startMin).toBe(540);
    expect(result[1].date).toBe('2026-06-22');
    expect(result[1].startMin).toBe(660);
    expect(result[2].date).toBe('2026-06-23');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-AD04: generateSlotId() — Generate deterministic slot ID
// ═══════════════════════════════════════════════════════════════════════════
describe('generateSlotId()', () => {
  it('UC-AD04: generates correct ID for Speaking type', () => {
    expect(generateSlotId('Speaking', '2026-06-22', 540)).toBe('SP-2206-0900');
  });

  it('UC-AD05: generates correct ID for 3 Skills type', () => {
    expect(generateSlotId('3 Skills', '2026-06-22', 660)).toBe('3S-2206-1100');
  });

  it('UC-AD06: generates correct ID for afternoon slot', () => {
    expect(generateSlotId('Speaking', '2026-06-23', 780)).toBe('SP-2306-1300');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-AD07: adminCreateSlot() — Create a new slot
// ═══════════════════════════════════════════════════════════════════════════
describe('adminCreateSlot()', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Re-apply default empty implementations
    mockGetDoc.mockImplementation(() => Promise.resolve(mockDocSnap(false)));
    mockGetDocs.mockImplementation(() => Promise.resolve(mockQuerySnap([])));
    mockSetDoc.mockImplementation(() => Promise.resolve());
    mockDeleteDoc.mockImplementation(() => Promise.resolve());
    mockUpdateDoc.mockImplementation(() => Promise.resolve());
    mockAddDoc.mockImplementation(() => Promise.resolve({ id: 'new-id' }));
  });

  it('UC-AD07: creates slot with generated ID and sets doc', async () => {
    const slotData = {
      type: 'Speaking' as const,
      date: '2026-06-22',
      session: 'S1',
      startMin: 540,
      endMin: 600,
      capacity: 10,
      location: 'Room A',
    };
    const result = await adminCreateSlot('admin@test.com', slotData);
    expect(result).toBe('SP-2206-0900');
    expect(mockSetDoc).toHaveBeenCalledOnce();
  });

  it('UC-AD08: throws when slotId already exists', async () => {
    mockGetDoc.mockImplementation(() => Promise.resolve(mockDocSnap(true, TEST_SLOT_SPEAKING)));

    await expect(
      adminCreateSlot('admin@test.com', {
        type: 'Speaking', date: '2026-06-22', session: 'S1',
        startMin: 540, endMin: 600, capacity: 10, location: '',
      })
    ).rejects.toThrow('đã tồn tại');
  });

  it('UC-AD09: throws when startMin >= endMin', async () => {
    await expect(
      adminCreateSlot('admin@test.com', {
        type: 'Speaking', date: '2026-06-22', session: 'S1',
        startMin: 600, endMin: 540, capacity: 10, location: '',
      })
    ).rejects.toThrow('trước giờ kết thúc');
  });

  it('UC-AD10: throws when capacity <= 0', async () => {
    await expect(
      adminCreateSlot('admin@test.com', {
        type: 'Speaking', date: '2026-06-22', session: 'S1',
        startMin: 540, endMin: 600, capacity: 0, location: '',
      })
    ).rejects.toThrow('Sức chứa phải > 0');
  });

  it('UC-AD11: throws when same-type slots overlap on same date', async () => {
    // getDoc -> not exists (for the slotId existence check)
    // getDocs -> returns overlapping existing slot (for listSlots clash check)
    mockGetDocs.mockImplementation(() =>
      Promise.resolve(mockQuerySnap([
        { id: 'SP-2206-0900', data: () => TEST_SLOT_SPEAKING },
      ]))
    );

    await expect(
      adminCreateSlot('admin@test.com', {
        type: 'Speaking', date: '2026-06-22', session: 'S2',
        startMin: 570, endMin: 630, capacity: 10, location: '',
      })
    ).rejects.toThrow('chồng giờ');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-AD12: adminDeleteSlot() — Remove slot
// ═══════════════════════════════════════════════════════════════════════════
describe('adminDeleteSlot()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('UC-AD12: deletes the correct slot document', async () => {
    await adminDeleteSlot('admin@test.com', 'SP-2206-0900');
    expect(mockDeleteDoc).toHaveBeenCalledOnce();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-AD13: updateSlot() — Update existing slot fields
// ═══════════════════════════════════════════════════════════════════════════
describe('updateSlot()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('UC-AD13: updates slot with partial data', async () => {
    await updateSlot('admin@test.com', 'SP-2206-0900', { capacity: 20 });
    expect(mockUpdateDoc).toHaveBeenCalledOnce();
    const [docRef, payload] = mockUpdateDoc.mock.calls[0];
    expect(docRef.path).toContain('SP-2206-0900');
    expect(payload.capacity).toBe(20);
  });

  it('UC-AD14: can update location field', async () => {
    await updateSlot('admin@test.com', 'SP-2206-0900', { location: 'New Room' });
    const [, payload] = mockUpdateDoc.mock.calls[0];
    expect(payload.location).toBe('New Room');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-AD15: listRegistrations() — List all registrations
// ═══════════════════════════════════════════════════════════════════════════
describe('listRegistrations()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('UC-AD15: returns mapped registrations with email as id', async () => {
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([
      { id: 'user@test.com', data: () => TEST_REGISTRATION },
    ]));
    const result = await listRegistrations();
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('user@test.com');
    expect(result[0].empCode).toBe('262010');
  });

  it('UC-AD16: returns empty array when no registrations', async () => {
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    const result = await listRegistrations();
    expect(result).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-AD17: adminDeleteRegistration() — Remove registration with slot restore
// ═══════════════════════════════════════════════════════════════════════════
describe('adminDeleteRegistration()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('UC-AD17: deletes registration and restores slot remaining via transaction', async () => {
    const txGet = vi.fn();
    const txUpdate = vi.fn();
    const txDelete = vi.fn();

    // 1. tx.get(registrations/email) -> exists
    txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_REGISTRATION));
    // 2. tx.get(slots/speakingSlotId) -> exists
    txGet.mockResolvedValueOnce(mockDocSnap(true, { remaining: 5 }));
    // 3. tx.get(slots/skillsSlotId) -> exists
    txGet.mockResolvedValueOnce(mockDocSnap(true, { remaining: 8 }));
    // 4. tx.get(empCodeClaims/empCode) -> owned by target registration
    txGet.mockResolvedValueOnce(mockDocSnap(true, { email: 'user@test.com' }));

    mockRunTransaction.mockImplementation(async (fn: any) => {
      await fn({ get: txGet, set: vi.fn(), update: txUpdate, delete: txDelete });
    });

    await adminDeleteRegistration('admin@test.com', 'user@test.com');
    expect(txDelete).toHaveBeenCalledTimes(2);
    expect(txDelete.mock.calls.some(([ref]) => ref.path === 'registrations/user@test.com')).toBe(true);
    expect(txDelete.mock.calls.some(([ref]) => ref.path === 'empCodeClaims/262010')).toBe(true);
    expect(txUpdate).toHaveBeenCalledTimes(2); // Both slots restored
  });

  it('UC-AD18: throws when registration does not exist', async () => {
    const txGet = vi.fn();
    txGet.mockResolvedValueOnce(mockDocSnap(false));

    mockRunTransaction.mockImplementation(async (fn: any) => {
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    await expect(
      adminDeleteRegistration('admin@test.com', 'nobody@test.com')
    ).rejects.toThrow('Không tìm thấy đăng ký');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-AD19: updateConfig() — Update system configuration
// ═══════════════════════════════════════════════════════════════════════════
describe('updateConfig()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('UC-AD19: updates allowEnrollment field', async () => {
    await updateConfig('admin@test.com', { allowEnrollment: false });
    expect(mockUpdateDoc).toHaveBeenCalledOnce();
    const [docRef, payload] = mockUpdateDoc.mock.calls[0];
    expect(docRef.path).toContain('config/main');
    expect(payload.allowEnrollment).toBe(false);
  });

  it('UC-AD20: can update adminEmails list', async () => {
    await updateConfig('admin@test.com', { adminEmails: ['a@test.com', 'b@test.com'] });
    const [, payload] = mockUpdateDoc.mock.calls[0];
    expect(payload.adminEmails).toEqual(['a@test.com', 'b@test.com']);
  });

  it('UC-AD21: can update maxChanges', async () => {
    await updateConfig('admin@test.com', { maxChanges: 5 });
    const [, payload] = mockUpdateDoc.mock.calls[0];
    expect(payload.maxChanges).toBe(5);
  });

  it('UC-AD22: sets deadline to deleteField when null is passed', async () => {
    await updateConfig('admin@test.com', { deadline: null });
    const [, payload] = mockUpdateDoc.mock.calls[0];
    expect(payload.deadline).toBe('DELETE_FIELD');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-AD23: listIneligibility() — List ineligibility blocklist
// ═══════════════════════════════════════════════════════════════════════════
describe('listIneligibility()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('UC-AD23: returns mapped ineligibility entries', async () => {
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([
      { id: '262010', data: () => ({ reason: 'Chưa đủ 12 tháng' }) },
    ]));
    const result = await listIneligibility();
    expect(result).toHaveLength(1);
    expect(result[0].empCode).toBe('262010');
    expect(result[0].reason).toBe('Chưa đủ 12 tháng');
  });

  it('UC-AD24: returns empty array when no ineligibilities', async () => {
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    const result = await listIneligibility();
    expect(result).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-AD25: upsertIneligibility() — Add/update blocklist entry
// ═══════════════════════════════════════════════════════════════════════════
describe('upsertIneligibility()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('UC-AD25: sets ineligibility doc with reason', async () => {
    await upsertIneligibility('admin@test.com', '262010', { reason: 'Chưa đủ 12 tháng' });
    expect(mockSetDoc).toHaveBeenCalledOnce();
    const [docRef, payload, options] = mockSetDoc.mock.calls[0];
    expect(docRef.path).toContain('ineligibility/262010');
    expect(payload.reason).toBe('Chưa đủ 12 tháng');
    expect(options.merge).toBe(true);
  });

  it('UC-AD26: throws when empCode is not 6 digits', async () => {
    await expect(
      upsertIneligibility('admin@test.com', '12345', { reason: 'test' })
    ).rejects.toThrow('6 chữ số');
  });

  it('UC-AD27: throws when reason is empty', async () => {
    await expect(
      upsertIneligibility('admin@test.com', '262010', { reason: '' })
    ).rejects.toThrow('lý do');
  });

  it('UC-AD28: includes optional email and fullName when provided', async () => {
    await upsertIneligibility('admin@test.com', '262010', {
      reason: 'test',
      email: 'test@company.com',
      fullName: 'Nguyen Van A',
    });
    const [, payload] = mockSetDoc.mock.calls[0];
    expect(payload.email).toBe('test@company.com');
    expect(payload.fullName).toBe('Nguyen Van A');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-AD29: deleteIneligibility() — Remove blocklist entry
// ═══════════════════════════════════════════════════════════════════════════
describe('deleteIneligibility()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('UC-AD29: deletes the correct ineligibility document', async () => {
    await deleteIneligibility('admin@test.com', '262010');
    expect(mockDeleteDoc).toHaveBeenCalledOnce();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-AD30: backfillEmpCodeClaims() — Create uniqueness claims for old data
// ═══════════════════════════════════════════════════════════════════════════
describe('backfillEmpCodeClaims()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('UC-AD30: creates claims for unique empCodes and skips duplicates', async () => {
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([
      { id: 'user@test.com', data: () => TEST_REGISTRATION },
      { id: 'other@test.com', data: () => ({ ...TEST_REGISTRATION, email: 'other@test.com', empCode: '262011' }) },
      { id: 'dup1@test.com', data: () => ({ ...TEST_REGISTRATION, email: 'dup1@test.com', empCode: '262111' }) },
      { id: 'dup2@test.com', data: () => ({ ...TEST_REGISTRATION, email: 'dup2@test.com', empCode: '262111' }) },
    ]));
    mockGetDoc.mockResolvedValue(mockDocSnap(false));

    const result = await backfillEmpCodeClaims('admin@test.com');

    expect(result.created).toBe(2);
    expect(result.skippedDuplicates).toEqual([
      { empCode: '262111', emails: ['dup1@test.com', 'dup2@test.com'] },
    ]);
    expect(mockSetDoc.mock.calls.map(([ref, payload]) => [ref.path, payload.email])).toEqual([
      ['empCodeClaims/262010', 'user@test.com'],
      ['empCodeClaims/262011', 'other@test.com'],
    ]);
  });
});

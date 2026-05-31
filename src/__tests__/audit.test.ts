import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock firebase module BEFORE importing audit.ts ──
vi.mock('../lib/firebase', () => ({
  db: {},
}));

const mockAddDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockCaptureError = vi.fn();
vi.mock('firebase/firestore', () => ({
  addDoc: (...args: any[]) => mockAddDoc(...args),
  collection: vi.fn((_db: any, path: string) => ({ path })),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  query: vi.fn((...args: any[]) => args),
  orderBy: vi.fn(),
  limit: vi.fn(),
  serverTimestamp: () => 'SERVER_TIMESTAMP',
  Timestamp: {
    fromDate: (d: Date) => ({ toDate: () => d }),
  },
}));
vi.mock('../lib/monitoring', () => ({
  captureError: (...args: any[]) => mockCaptureError(...args),
}));

import { auditLog, listAuditLogs, type AuditEvent } from '../lib/audit';
import { mockQuerySnap, mockTimestamp } from './mocks/firebase';

// ═══════════════════════════════════════════════════════════════════════════
// UC-D01: auditLog() — Append immutable audit entry
// ═══════════════════════════════════════════════════════════════════════════
describe('auditLog()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('UC-D01: writes audit entry with email, event, and detail', async () => {
    mockAddDoc.mockResolvedValueOnce({ id: 'audit-1' });
    await auditLog('user@test.com', 'book.create', { empCode: '262010' });
    expect(mockAddDoc).toHaveBeenCalledOnce();
    const [collectionRef, payload] = mockAddDoc.mock.calls[0];
    expect(collectionRef.path).toBe('auditLogs');
    expect(payload.email).toBe('user@test.com');
    expect(payload.event).toBe('book.create');
    expect(payload.detail).toEqual({ empCode: '262010' });
    expect(payload.timestamp).toBe('SERVER_TIMESTAMP');
  });

  it('UC-D02: uses empty detail when not provided', async () => {
    mockAddDoc.mockResolvedValueOnce({ id: 'audit-2' });
    await auditLog('user@test.com', 'book.cancel');
    const [, payload] = mockAddDoc.mock.calls[0];
    expect(payload.detail).toEqual({});
  });

  it('UC-D03: does not throw when Firestore write fails (non-blocking)', async () => {
    const err = new Error('Network error');
    mockAddDoc.mockRejectedValueOnce(err);
    await expect(auditLog('user@test.com', 'book.cancel')).resolves.toBeUndefined();
    expect(mockCaptureError).toHaveBeenCalledWith(err, { operation: 'auditLog' });
  });

  it('UC-D04: supports all defined AuditEvent types', async () => {
    const events: AuditEvent[] = [
      'book.create', 'book.update', 'book.cancel', 'book.rejected.blocked',
      'admin.deleteRegistration', 'admin.updateSlot', 'admin.createSlot',
      'admin.deleteSlot', 'admin.updateConfig', 'admin.upsertIneligibility',
      'admin.deleteIneligibility',
    ];
    for (const event of events) {
      mockAddDoc.mockResolvedValueOnce({ id: 'x' });
      await auditLog('admin@test.com', event, {});
      expect(mockAddDoc).toHaveBeenCalledTimes(events.indexOf(event) + 1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-D05: listAuditLogs() — Fetch recent audit entries
// ═══════════════════════════════════════════════════════════════════════════
describe('listAuditLogs()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('UC-D05: returns mapped audit entries with id, timestamp, email, event, detail', async () => {
    const ts = new Date('2026-05-29T10:00:00Z');
    mockGetDocs.mockResolvedValueOnce(
      mockQuerySnap([
        {
          id: 'log-1',
          data: () => ({
            timestamp: mockTimestamp(ts),
            email: 'user@test.com',
            event: 'book.create',
            detail: { empCode: '262010' },
          }),
        },
      ])
    );
    const result = await listAuditLogs();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('log-1');
    expect(result[0].email).toBe('user@test.com');
    expect(result[0].event).toBe('book.create');
    expect(result[0].detail).toEqual({ empCode: '262010' });
    expect(result[0].timestamp).toBe(ts.toISOString());
  });

  it('UC-D06: handles missing timestamp gracefully', async () => {
    mockGetDocs.mockResolvedValueOnce(
      mockQuerySnap([
        {
          id: 'log-2',
          data: () => ({
            email: 'admin@test.com',
            event: 'admin.updateConfig',
            detail: {},
          }),
        },
      ])
    );
    const result = await listAuditLogs();
    expect(result[0].timestamp).toBeNull();
  });

  it('UC-D07: handles empty audit logs collection', async () => {
    mockGetDocs.mockResolvedValueOnce(mockQuerySnap([]));
    const result = await listAuditLogs();
    expect(result).toEqual([]);
  });
});

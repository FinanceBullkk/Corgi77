import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock firebase module BEFORE importing admin.ts ──
vi.mock('../lib/firebase', () => ({
  db: {},
}));

// Mock Firestore functions
const mockGetDoc = vi.fn();
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: any, path: string, id: string) => ({ path: `${path}/${id}` })),
  getDoc: (...args: any[]) => mockGetDoc(...args),
}));

import { isAdmin, fetchAdminEmails, ADMIN_EMAILS } from '../lib/admin';
import { mockDocSnap } from './mocks/firebase';

// ═══════════════════════════════════════════════════════════════════════════
// UC-A01: isAdmin() — Hardcoded admin detection
// ═══════════════════════════════════════════════════════════════════════════
describe('isAdmin()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('UC-A01: returns true for hardcoded admin email', () => {
    expect(isAdmin('hao.nha@cyberlogitec.com')).toBe(true);
  });

  it('UC-A02: returns true for hardcoded admin (case insensitive)', () => {
    expect(isAdmin('HAO.NHA@CYBERLOGITEC.COM')).toBe(true);
  });

  it('UC-A03: returns false for non-admin email', () => {
    expect(isAdmin('user@company.com')).toBe(false);
  });

  it('UC-A04: returns false for null email', () => {
    expect(isAdmin(null)).toBe(false);
  });

  it('UC-A05: returns false for undefined email', () => {
    expect(isAdmin(undefined)).toBe(false);
  });

  it('UC-A06: returns false for empty string email', () => {
    expect(isAdmin('')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UC-A07: fetchAdminEmails() — Merge hardcoded + Firestore config admins
// ═══════════════════════════════════════════════════════════════════════════
describe('fetchAdminEmails()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('UC-A07: merges hardcoded admins with config admins', async () => {
    mockGetDoc.mockResolvedValueOnce(
      mockDocSnap(true, { adminEmails: ['custom@admin.com'] })
    );
    const result = await fetchAdminEmails();
    // Should contain all hardcoded admins
    for (const email of ADMIN_EMAILS) {
      expect(result).toContain(email.toLowerCase());
    }
    // Plus the config admin
    expect(result).toContain('custom@admin.com');
  });

  it('UC-A08: deduplicates emails ignoring case', async () => {
    mockGetDoc.mockResolvedValueOnce(
      mockDocSnap(true, { adminEmails: ['HAO.NHA@CYBERLOGITEC.COM'] })
    );
    const result = await fetchAdminEmails();
    const haoCount = result.filter((e) => e === 'hao.nha@cyberlogitec.com').length;
    expect(haoCount).toBe(1);
  });

  it('UC-A09: falls back to hardcoded list when Firestore read fails', async () => {
    mockGetDoc.mockRejectedValueOnce(new Error('Network error'));
    const result = await fetchAdminEmails();
    expect(result).toEqual(ADMIN_EMAILS.map((e) => e.toLowerCase()));
  });

  it('UC-A10: handles missing config document gracefully', async () => {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(false));
    const result = await fetchAdminEmails();
    expect(result).toEqual(ADMIN_EMAILS.map((e) => e.toLowerCase()));
  });

  it('UC-A11: handles config with empty adminEmails array', async () => {
    mockGetDoc.mockResolvedValueOnce(mockDocSnap(true, { adminEmails: [] }));
    const result = await fetchAdminEmails();
    expect(result.length).toBe(ADMIN_EMAILS.length);
  });

  it('UC-A12: returns cached result on subsequent isAdmin calls after fetch', async () => {
    mockGetDoc.mockResolvedValueOnce(
      mockDocSnap(true, { adminEmails: ['dynamic@test.com'] })
    );
    await fetchAdminEmails();
    // After fetch, the cached list should include dynamic admin
    expect(isAdmin('dynamic@test.com')).toBe(true);
  });

  it('UC-A13: ADMIN_EMAILS constant contains expected bootstrap admins', () => {
    expect(ADMIN_EMAILS).toContain('hao.nha@cyberlogitec.com');
    expect(ADMIN_EMAILS).toContain('phuc.lnk@cyberlogitec.com');
    expect(ADMIN_EMAILS).toContain('anhhao.dl108@gmail.com');
  });
});
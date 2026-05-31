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

function setupGetDocByPath(records: Record<string, false | Record<string, unknown>>, rejectPaths: Record<string, Error> = {}) {
  mockGetDoc.mockImplementation((ref: { path: string }) => {
    const err = rejectPaths[ref.path];
    if (err) return Promise.reject(err);
    const value = records[ref.path];
    if (value === undefined || value === false) return Promise.resolve(mockDocSnap(false));
    return Promise.resolve(mockDocSnap(true, value));
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// UC-A01 -> UC-A06: isAdmin() before config cache is loaded
// ═══════════════════════════════════════════════════════════════════════════
describe('isAdmin()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('UC-A01: returns false before admin config is fetched', () => {
    expect(isAdmin('admin@test.com')).toBe(false);
  });

  it('UC-A02: returns false for any configured-looking admin before fetch', () => {
    expect(isAdmin('owner@cyberlogitec.com')).toBe(false);
    expect(isAdmin('ops.admin@gmail.com')).toBe(false);
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
// UC-A07: fetchAdminEmails() — Load admin emails from Firestore config
// ═══════════════════════════════════════════════════════════════════════════
describe('fetchAdminEmails()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDoc.mockReset();
  });

  it('UC-A07: loads admins from /config/main.adminEmails', async () => {
    setupGetDocByPath({ 'config/main': { adminEmails: ['admin@test.com', 'owner@test.com'] } });
    const result = await fetchAdminEmails();
    expect(result).toEqual(['admin@test.com', 'owner@test.com']);
  });

  it('UC-A08: normalizes, trims, removes empty values, and deduplicates emails', async () => {
    setupGetDocByPath({ 'config/main': { adminEmails: [' ADMIN@Test.com ', '', 'admin@test.com'] } });
    const result = await fetchAdminEmails();
    expect(result).toEqual(['admin@test.com']);
  });

  it('UC-A09: does not fall back to built-in personal emails when Firestore read fails', async () => {
    setupGetDocByPath({}, { 'config/main': new Error('Network error') });
    const result = await fetchAdminEmails();
    expect(result).toEqual([]);
    expect(ADMIN_EMAILS).toEqual([]);
  });

  it('UC-A10: handles missing config document gracefully', async () => {
    setupGetDocByPath({ 'config/main': false });
    const result = await fetchAdminEmails();
    expect(result).toEqual([]);
  });

  it('UC-A11: handles config with empty adminEmails array', async () => {
    setupGetDocByPath({ 'config/main': { adminEmails: [] } });
    const result = await fetchAdminEmails();
    expect(result).toEqual([]);
  });

  it('UC-A12: returns cached result on subsequent isAdmin calls after fetch', async () => {
    setupGetDocByPath({ 'config/main': { adminEmails: ['dynamic@test.com'] } });
    await fetchAdminEmails();
    expect(isAdmin('dynamic@test.com')).toBe(true);
    expect(isAdmin('DYNAMIC@TEST.COM')).toBe(true);
  });

  it('UC-A13: ADMIN_EMAILS compatibility export stays empty', () => {
    expect(ADMIN_EMAILS).toEqual([]);
  });
});

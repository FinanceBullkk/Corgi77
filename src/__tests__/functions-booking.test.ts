import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type DocData = Record<string, any>;
const realRequire = createRequire(import.meta.url);

class FakeHttpsError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

class FakeDocRef {
  path: string;
  id: string;
  private store: Map<string, DocData>;

  constructor(path: string, store: Map<string, DocData>) {
    this.path = path;
    this.id = path.split('/').pop() || path;
    this.store = store;
  }

  async get() {
    return snap(this, this.store.get(this.path));
  }

  async set(data: DocData) {
    this.store.set(this.path, { ...data });
  }

  async update(data: DocData) {
    const current = this.store.get(this.path) || {};
    const next = { ...current };
    for (const [key, value] of Object.entries(data)) {
      if (value === 'FIELD_DELETE') delete next[key];
      else next[key] = value;
    }
    this.store.set(this.path, next);
  }

  async delete() {
    this.store.delete(this.path);
  }
}

class FakeDb {
  store = new Map<string, DocData>();
  collectionAdds: Array<{ path: string; data: DocData }> = [];
  transactionLog: Array<{ op: string; path: string; data?: DocData }> = [];
  failCollectionAdds = new Set<string>();

  doc(path: string) {
    return new FakeDocRef(path, this.store);
  }

  collection(path: string) {
    return {
      add: async (data: DocData) => {
        if (this.failCollectionAdds.has(path)) throw new Error(`${path} add failed`);
        this.collectionAdds.push({ path, data });
        const id = `${path}-${this.collectionAdds.length}`;
        this.store.set(`${path}/${id}`, data);
        return this.doc(`${path}/${id}`);
      },
      get: async () => {
        const prefix = `${path}/`;
        const docs = Array.from(this.store.entries())
          .filter(([docPath]) => docPath.startsWith(prefix) && docPath.slice(prefix.length).indexOf('/') === -1)
          .map(([docPath, data]) => ({
            id: docPath.slice(prefix.length),
            data: () => data,
          }));
        return {
          docs,
          forEach: (fn: (doc: { id: string; data: () => DocData }) => void) => docs.forEach(fn),
        };
      },
    };
  }

  batch() {
    const ops: Array<() => void> = [];
    return {
      update: (ref: FakeDocRef, data: DocData) => { ops.push(() => { const next = { ...(this.store.get(ref.path) || {}) }; for (const [k, v] of Object.entries(data)) { if (v === 'FIELD_DELETE') delete next[k]; else next[k] = v; } this.store.set(ref.path, next); }); },
      commit: async () => { ops.forEach((op) => op()); ops.length = 0; },
    };
  }

  async runTransaction(fn: (tx: any) => Promise<void>) {
    const tx = {
      get: async (ref: FakeDocRef) => snap(ref, this.store.get(ref.path)),
      set: (ref: FakeDocRef, data: DocData) => {
        this.transactionLog.push({ op: 'set', path: ref.path, data });
        this.store.set(ref.path, { ...data });
      },
      update: (ref: FakeDocRef, data: DocData) => {
        this.transactionLog.push({ op: 'update', path: ref.path, data });
        this.store.set(ref.path, { ...(this.store.get(ref.path) || {}), ...data });
      },
      delete: (ref: FakeDocRef) => {
        this.transactionLog.push({ op: 'delete', path: ref.path });
        this.store.delete(ref.path);
      },
    };
    await fn(tx);
  }
}

function snap(ref: FakeDocRef, data: DocData | undefined) {
  return {
    id: ref.id,
    ref,
    exists: data !== undefined,
    data: () => data || {},
  };
}

function ts(date = '2026-05-01T00:00:00.000Z') {
  const d = new Date(date);
  return {
    toDate: () => d,
    seconds: Math.floor(d.getTime() / 1000),
    nanoseconds: (d.getTime() % 1000) * 1_000_000,
  };
}

function signed(email = 'user@test.com') {
  return { auth: { token: { email } }, data: {} };
}

function basePayload(overrides: DocData = {}) {
  return {
    empCode: '262010',
    fullName: 'Nguyen Van A',
    bu: 'BSG',
    speakingSlotId: 'SP-2206-0900',
    skillsSlotId: '3S-2206-1100',
    ...overrides,
  };
}

function seedOpenConfig(db: FakeDb, overrides: DocData = {}) {
  db.store.set('config/main', {
    allowEnrollment: true,
    maxChanges: 3,
    deadline: null,
    emailConfirm: false,
    adminEmails: ['admin@test.com'],
    ...overrides,
  });
}

function seedSlots(db: FakeDb, overrides: { sp?: DocData; sk?: DocData } = {}) {
  db.store.set('slots/SP-2206-0900', {
    type: 'Speaking',
    date: '2026-06-22',
    session: 'S1',
    startMin: 540,
    endMin: 600,
    capacity: 10,
    remaining: 8,
    location: 'Room A',
    ...overrides.sp,
  });
  db.store.set('slots/3S-2206-1100', {
    type: '3 Skills',
    date: '2026-06-22',
    session: 'S2',
    startMin: 660,
    endMin: 720,
    capacity: 10,
    remaining: 7,
    location: 'Room B',
    ...overrides.sk,
  });
}

function loadFunctions(db: FakeDb) {
  const exports: Record<string, any> = {};
  const code = readFileSync(join(process.cwd(), 'functions/index.js'), 'utf8');
  const fakeRequire = (id: string) => {
    if (id === 'firebase-functions/v2/https') {
      return { onCall: (optionsOrHandler: any, maybeHandler?: any) => maybeHandler ?? optionsOrHandler, HttpsError: FakeHttpsError };
    }
    if (id === 'firebase-functions/v2/scheduler') {
      return { onSchedule: (_schedule: string, handler: any) => handler };
    }
    if (id === 'firebase-admin/app') {
      return { initializeApp: vi.fn() };
    }
    if (id === 'firebase-admin/firestore') {
      return {
        getFirestore: () => db,
        FieldValue: { delete: () => 'FIELD_DELETE' },
        Timestamp: {
          now: () => ts('2026-05-30T00:00:00.000Z'),
          fromMillis: (ms: number) => ts(new Date(ms).toISOString()),
        },
      };
    }
    if (id === './booking-handlers' || id === './cancel-handler' || id === './email-helpers' || id === './format-helpers' || id === './maintenance' || id === './repair-claims') {
      return realRequire(join(process.cwd(), 'functions', `${id.slice(2)}.js`));
    }
    throw new Error(`Unexpected require: ${id}`);
  };
  vm.runInNewContext(code, {
    exports,
    require: fakeRequire,
    console,
    Date,
    Promise,
    Map,
    String,
    Math,
    RegExp,
  });
  return exports;
}

describe('Cloud Functions booking handlers', () => {
  let db: FakeDb;
  let fns: Record<string, any>;

  beforeEach(() => {
    db = new FakeDb();
    fns = loadFunctions(db);
  });

  it('rejects unauthenticated booking requests', async () => {
    await expect(fns.bookRegistration({ data: basePayload() })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('rejects empCode already claimed by another email', async () => {
    seedOpenConfig(db);
    seedSlots(db);
    db.store.set('empCodeClaims/262010', { email: 'other@test.com' });

    await expect(fns.bookRegistration({ ...signed(), data: basePayload() })).rejects.toMatchObject({
      code: 'failed-precondition',
      message: 'Mã NV này đã đăng ký bằng email khác.',
    });
  });

  it('rejects BU outside the default list when config buList is empty', async () => {
    seedOpenConfig(db, { buList: [] });
    seedSlots(db);

    await expect(fns.bookRegistration({
      ...signed('outsider@test.com'),
      data: basePayload({ bu: 'IT' }),
    })).rejects.toMatchObject({
      code: 'failed-precondition',
      message: 'BU không hợp lệ.',
    });
  });

  it('creates a new booking, claim, slot decrements and audit log', async () => {
    seedOpenConfig(db);
    seedSlots(db);

    const result = await fns.bookRegistration({ ...signed(), data: basePayload() });

    expect(result).toEqual({ ok: true, emailSent: false });
    const savedRegistration = db.store.get('registrations/user@test.com');
    expect(savedRegistration).toMatchObject({
      empCode: '262010',
      speakingSlotId: 'SP-2206-0900',
      skillsSlotId: '3S-2206-1100',
      changeCount: 0,
    });
    expect(savedRegistration).not.toHaveProperty('email');
    expect(db.store.get('empCodeClaims/262010')).toEqual({ email: 'user@test.com' });
    expect(db.store.get('slots/SP-2206-0900')?.remaining).toBe(7);
    expect(db.store.get('slots/3S-2206-1100')?.remaining).toBe(6);
    expect(db.collectionAdds.find((c) => c.path === 'auditLogs')?.data).toMatchObject({
      email: 'user@test.com',
      event: 'book.create',
    });
  });

  it('keeps booking success when audit logging fails after commit', async () => {
    seedOpenConfig(db);
    seedSlots(db);
    db.failCollectionAdds.add('auditLogs');

    const result = await fns.bookRegistration({ ...signed(), data: basePayload() });

    expect(result).toEqual({ ok: true, emailSent: false });
    expect(db.store.get('registrations/user@test.com')).toMatchObject({
      empCode: '262010',
      speakingSlotId: 'SP-2206-0900',
      skillsSlotId: '3S-2206-1100',
    });
    expect(db.store.get('slots/SP-2206-0900')?.remaining).toBe(7);
    expect(db.store.get('empCodeClaims/262010')).toEqual({ email: 'user@test.com' });
  });

  it('updates an existing booking, restores old slots and deletes old empCode claim', async () => {
    seedOpenConfig(db);
    seedSlots(db);
    db.store.set('slots/SP-2306-0900', {
      type: 'Speaking',
      date: '2026-06-23',
      startMin: 540,
      endMin: 600,
      capacity: 10,
      remaining: 4,
    });
    db.store.set('slots/3S-2306-1100', {
      type: '3 Skills',
      date: '2026-06-23',
      startMin: 660,
      endMin: 720,
      capacity: 10,
      remaining: 3,
    });
    db.store.set('registrations/user@test.com', {
      email: 'user@test.com',
      empCode: '262009',
      fullName: 'Old Name',
      bu: 'BSG',
      speakingSlotId: 'SP-2306-0900',
      skillsSlotId: '3S-2306-1100',
      createdAt: ts('2026-05-01T00:00:00.000Z'),
      updatedAt: ts('2026-05-01T00:00:00.000Z'),
      changeCount: 1,
    });
    db.store.set('empCodeClaims/262009', { email: 'user@test.com' });

    await fns.bookRegistration({ ...signed(), data: basePayload() });

    expect(db.store.get('registrations/user@test.com')).toMatchObject({
      empCode: '262010',
      changeCount: 2,
    });
    expect(db.store.has('empCodeClaims/262009')).toBe(false);
    expect(db.store.get('empCodeClaims/262010')).toEqual({ email: 'user@test.com' });
    expect(db.store.get('slots/SP-2306-0900')?.remaining).toBe(5);
    expect(db.store.get('slots/3S-2306-1100')?.remaining).toBe(4);
    expect(db.collectionAdds.find((c) => c.path === 'auditLogs')?.data.event).toBe('book.update');
  });

  it('enforces max changes inside the transaction', async () => {
    seedOpenConfig(db, { maxChanges: 1 });
    seedSlots(db);
    db.store.set('registrations/user@test.com', {
      empCode: '262010',
      speakingSlotId: 'SP-OLD',
      skillsSlotId: '3S-OLD',
      changeCount: 1,
    });

    await expect(fns.bookRegistration({ ...signed(), data: basePayload() })).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('tối đa 1 lần'),
    });
  });

  it('escapes confirmation email HTML and sends to authenticated email only', async () => {
    seedOpenConfig(db, { emailConfirm: true });
    seedSlots(db);

    const result = await fns.bookRegistration({
      ...signed('attacker@test.com'),
      data: basePayload({ fullName: '"><script>alert(1)</script>', email: 'victim@test.com' }),
    });

    expect(result.emailSent).toBe(true);
    const mail = db.collectionAdds.find((c) => c.path === 'mail')?.data;
    expect(mail?.to).toBe('attacker@test.com');
    expect(mail?.message.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(mail?.message.html).not.toContain('<script>alert(1)</script>');
  });

  it('cancels a booking, restores seats, removes claim and preserves quota', async () => {
    seedOpenConfig(db);
    seedSlots(db);
    db.store.set('registrations/user@test.com', {
      empCode: '262010',
      speakingSlotId: 'SP-2206-0900',
      skillsSlotId: '3S-2206-1100',
      changeCount: 2,
    });
    db.store.set('empCodeClaims/262010', { email: 'user@test.com' });

    await expect(fns.cancelRegistration(signed())).resolves.toEqual({ ok: true });

    expect(db.store.has('registrations/user@test.com')).toBe(false);
    expect(db.store.has('empCodeClaims/262010')).toBe(false);
    expect(db.store.get('slots/SP-2206-0900')?.remaining).toBe(9);
    expect(db.store.get('slots/3S-2206-1100')?.remaining).toBe(8);
    expect(db.store.get('cancelledQuota/user@test.com')).toMatchObject({ changeCount: 2 });
    expect(db.collectionAdds.find((c) => c.path === 'auditLogs')?.data.event).toBe('book.cancel');
  });

  it('keeps cancel success when audit logging fails after commit', async () => {
    seedOpenConfig(db);
    seedSlots(db);
    db.store.set('registrations/user@test.com', {
      empCode: '262010',
      speakingSlotId: 'SP-2206-0900',
      skillsSlotId: '3S-2206-1100',
      changeCount: 2,
    });
    db.store.set('empCodeClaims/262010', { email: 'user@test.com' });
    db.failCollectionAdds.add('auditLogs');

    await expect(fns.cancelRegistration(signed())).resolves.toEqual({ ok: true });

    expect(db.store.has('registrations/user@test.com')).toBe(false);
    expect(db.store.get('cancelledQuota/user@test.com')).toMatchObject({ changeCount: 2 });
    expect(db.store.get('slots/SP-2206-0900')?.remaining).toBe(9);
  });

  it('rate limits rapid cancellation attempts', async () => {
    seedOpenConfig(db);
    seedSlots(db);
    db.store.set('registrations/user@test.com', {
      empCode: '262010',
      speakingSlotId: 'SP-2206-0900',
      skillsSlotId: '3S-2206-1100',
      changeCount: 2,
    });
    db.store.set('functionRateLimits/cancelRegistration_user@test_com', {
      lastCallAt: ts(new Date().toISOString()),
    });

    await expect(fns.cancelRegistration(signed())).rejects.toMatchObject({
      code: 'resource-exhausted',
      message: expect.stringContaining('thao tác quá nhanh'),
    });
  });

  it('repairs empCode claims and reports duplicates/conflicts', async () => {
    seedOpenConfig(db, { adminEmails: ['admin@test.com'] });
    db.store.set('registrations/a@test.com', { empCode: '262001' });
    db.store.set('registrations/b@test.com', { empCode: '262002' });
    db.store.set('registrations/c@test.com', { empCode: '262002' });
    db.store.set('registrations/d@test.com', { empCode: '262003' });
    db.store.set('empCodeClaims/262003', { email: 'someone@test.com' });

    const result = await fns.repairEmpCodeClaimsNow(signed('admin@test.com'));

    expect(result.created).toBe(1);
    expect(result.skippedDuplicates).toEqual([{ empCode: '262002', emails: ['b@test.com', 'c@test.com'] }]);
    expect(result.conflicts).toEqual([
      { empCode: '262003', claimEmail: 'someone@test.com', registrationEmail: 'd@test.com' },
    ]);
    expect(db.store.get('empCodeClaims/262001')).toEqual({ email: 'a@test.com' });
    expect(db.collectionAdds.find((c) => c.path === 'auditLogs')?.data.event).toBe('admin.backfillEmpCodeClaims');
  });

  it('cleans redundant email fields from registration documents', async () => {
    seedOpenConfig(db, { adminEmails: ['admin@test.com'] });
    db.store.set('registrations/user@test.com', { email: 'user@test.com', empCode: '262010' });
    db.store.set('registrations/clean@test.com', { empCode: '262011' });

    const result = await fns.cleanupRegistrationEmailFieldsNow(signed('admin@test.com'));

    expect(result).toEqual({ scanned: 2, cleaned: 1 });
    expect(db.store.get('registrations/user@test.com')).toEqual({ empCode: '262010' });
    expect(db.store.get('registrations/clean@test.com')).toEqual({ empCode: '262011' });
    expect(db.collectionAdds.find((c) => c.path === 'auditLogs')?.data.event)
      .toBe('admin.cleanupRegistrationEmailFields');
  });

  it('scheduled cleanup deletes stale function rate-limit docs', async () => {
    const oldTs = ts(new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString());
    const freshTs = ts(new Date().toISOString());
    db.store.set('functionRateLimits/bookRegistration_old@test_com', { lastCallAt: oldTs });
    db.store.set('functionRateLimits/bookRegistration_new@test_com', { lastCallAt: freshTs });

    await fns.scheduledCleanupFunctionRateLimits();

    expect(db.store.has('functionRateLimits/bookRegistration_old@test_com')).toBe(false);
    expect(db.store.has('functionRateLimits/bookRegistration_new@test_com')).toBe(true);
    expect(db.collectionAdds.find((c) => c.path === 'auditLogs')?.data.event)
      .toBe('admin.cleanupFunctionRateLimits');
  });
});

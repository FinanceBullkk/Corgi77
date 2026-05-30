// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-corgi7-rules';

let testEnv: RulesTestEnvironment;

function authedDb(email: string) {
  return testEnv.authenticatedContext(email, { email }).firestore();
}

function unauthDb() {
  return testEnv.unauthenticatedContext().firestore();
}

async function seed(path: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

async function seedAdminConfig(adminEmails = ['admin@test.com']) {
  await seed('config/main', { adminEmails });
}

const validSlot = {
  type: 'Speaking',
  date: '2026-06-22',
  session: 'AM',
  startMin: 540,
  endMin: 600,
  capacity: 8,
  remaining: 8,
  location: 'Room A',
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('firestore.rules admin authorization', () => {
  it('does not grant admin access without /config/main.adminEmails', async () => {
    const db = authedDb('admin@test.com');
    await assertFails(setDoc(doc(db, 'slots/SP-2206-0900'), validSlot));
  });

  it('grants admin access from /config/main.adminEmails only', async () => {
    await seedAdminConfig();

    const admin = authedDb('admin@test.com');
    const user = authedDb('user@test.com');

    await assertSucceeds(setDoc(doc(admin, 'slots/SP-2206-0900'), validSlot));
    await assertFails(setDoc(doc(user, 'slots/SP-2206-1000'), { ...validSlot, startMin: 600, endMin: 660 }));
  });
});

describe('firestore.rules auditLogs', () => {
  it('allows admin client to append own admin audit events', async () => {
    await seedAdminConfig();
    const admin = authedDb('admin@test.com');

    await assertSucceeds(addDoc(collection(admin, 'auditLogs'), {
      timestamp: serverTimestamp(),
      email: 'admin@test.com',
      event: 'admin.updateConfig',
      detail: { field: 'allowEnrollment' },
    }));
  });

  it('blocks forged user booking audit logs from raw SDK', async () => {
    await seedAdminConfig();
    const user = authedDb('user@test.com');

    await assertFails(addDoc(collection(user, 'auditLogs'), {
      timestamp: serverTimestamp(),
      email: 'user@test.com',
      event: 'book.create',
      detail: { empCode: '262010' },
    }));
  });

  it('blocks admin audit logs when email does not match auth token', async () => {
    await seedAdminConfig();
    const admin = authedDb('admin@test.com');

    await assertFails(addDoc(collection(admin, 'auditLogs'), {
      timestamp: serverTimestamp(),
      email: 'other@test.com',
      event: 'admin.updateConfig',
      detail: {},
    }));
  });

  it('blocks unauthenticated audit log reads and writes', async () => {
    await seedAdminConfig();
    const db = unauthDb();

    await assertFails(getDoc(doc(db, 'auditLogs/log-1')));
    await assertFails(addDoc(collection(db, 'auditLogs'), {
      timestamp: serverTimestamp(),
      email: 'admin@test.com',
      event: 'admin.updateConfig',
      detail: {},
    }));
  });
});

describe('firestore.rules slot delete safety', () => {
  it('allows admin to delete an unused slot', async () => {
    await seedAdminConfig();
    await seed('slots/SP-2206-0900', validSlot);

    const admin = authedDb('admin@test.com');
    await assertSucceeds(deleteDoc(doc(admin, 'slots/SP-2206-0900')));
  });

  it('blocks admin from deleting a slot with active usage', async () => {
    await seedAdminConfig();
    await seed('slots/SP-2206-0900', { ...validSlot, remaining: 7 });

    const admin = authedDb('admin@test.com');
    await assertFails(deleteDoc(doc(admin, 'slots/SP-2206-0900')));
  });

  it('blocks non-admin slot delete even when the slot is unused', async () => {
    await seedAdminConfig();
    await seed('slots/SP-2206-0900', validSlot);

    const user = authedDb('user@test.com');
    await assertFails(deleteDoc(doc(user, 'slots/SP-2206-0900')));
  });
});

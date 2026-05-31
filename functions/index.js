const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore, Timestamp } = require('firebase-admin/firestore');
const { createBookRegistrationHandler } = require('./booking-handlers');
const { createCancelRegistrationHandler } = require('./cancel-handler');
const { cleanupFunctionRateLimits, cleanupRegistrationEmailFields } = require('./maintenance');
const { repairClaims } = require('./repair-claims');

initializeApp();

const db = getFirestore();

const DEFAULT_MAX_CHANGES = 3; // Sync with src/lib/db.ts DEFAULT_MAX_CHANGES.
const DEFAULT_ASSESSMENT_NAME = 'Assessment Q2 2026';
const DEFAULT_BU_LIST = ['BSG', 'CHORUS', 'LBU', 'MOC', 'ONC', 'POC', 'TBU']; // Sync with src/lib/db.ts DEFAULT_BU_LIST.
const RATE_LIMIT_CLEANUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ENFORCE_APP_CHECK = typeof process !== 'undefined'
  && process.env.FUNCTIONS_ENFORCE_APP_CHECK === 'true';
const callableOptions = ENFORCE_APP_CHECK ? { enforceAppCheck: true } : {};

function envPositiveInt(name, fallback) {
  const raw = typeof process !== 'undefined' ? process.env[name] : undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const USER_RATE_LIMIT_MS = envPositiveInt('FUNCTIONS_USER_RATE_LIMIT_MS', 3000);
const ALLOWED_EMAIL_SUFFIX = '@cyberlogitec.com';

function isAllowedCompanyEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return normalized.endsWith(ALLOWED_EMAIL_SUFFIX)
    && normalized.slice(0, -ALLOWED_EMAIL_SUFFIX.length).length > 0;
}

function assertSignedIn(request) {
  const email = request.auth?.token?.email;
  if (!email) throw new HttpsError('unauthenticated', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  if (!isAllowedCompanyEmail(email)) {
    throw new HttpsError('permission-denied', `Chỉ chấp nhận tài khoản Google có email ${ALLOWED_EMAIL_SUFFIX}.`);
  }
  return String(email).trim().toLowerCase();
}

async function assertAdmin(request) {
  const email = assertSignedIn(request).toLowerCase();
  const cfgSnap = await db.doc('config/main').get();
  const adminEmails = cfgSnap.exists ? (cfgSnap.data().adminEmails || []) : [];
  if (adminEmails.map((e) => String(e).toLowerCase()).includes(email)) return email;
  throw new HttpsError('permission-denied', 'Bạn không có quyền admin.');
}

async function addAudit(email, event, detail = {}) {
  try {
    await db.collection('auditLogs').add({
      timestamp: Timestamp.now(),
      email,
      event,
      detail,
    });
  } catch (e) {
    console.warn('Audit log failed:', e);
  }
}

const bookingHandlerDeps = {
  db,
  Timestamp,
  HttpsError,
  assertSignedIn,
  addAudit,
  defaultMaxChanges: DEFAULT_MAX_CHANGES,
  defaultAssessmentName: DEFAULT_ASSESSMENT_NAME,
  defaultBuList: DEFAULT_BU_LIST,
  userRateLimitMs: USER_RATE_LIMIT_MS,
};

exports.bookRegistration = onCall(callableOptions, createBookRegistrationHandler(bookingHandlerDeps));
exports.cancelRegistration = onCall(callableOptions, createCancelRegistrationHandler(bookingHandlerDeps));

exports.repairEmpCodeClaimsNow = onCall(callableOptions, async (request) => {
  const email = await assertAdmin(request);
  const result = await repairClaims(db);
  await addAudit(email, 'admin.backfillEmpCodeClaims', result);
  return result;
});

exports.cleanupRegistrationEmailFieldsNow = onCall(callableOptions, async (request) => {
  const email = await assertAdmin(request);
  const result = await cleanupRegistrationEmailFields(db, FieldValue);
  await addAudit(email, 'admin.cleanupRegistrationEmailFields', result);
  return result;
});

exports.scheduledRepairEmpCodeClaims = onSchedule('every 5 minutes', async () => {
  const result = await repairClaims(db);
  if (result.skippedDuplicates.length || result.conflicts.length) {
    await addAudit('system', 'admin.backfillEmpCodeClaims', result);
  }
});

exports.scheduledCleanupFunctionRateLimits = onSchedule('every 24 hours', async () => {
  const result = await cleanupFunctionRateLimits(db, Timestamp, RATE_LIMIT_CLEANUP_MAX_AGE_MS);
  if (result.deleted > 0) {
    await addAudit('system', 'admin.cleanupFunctionRateLimits', result);
  }
});

const { minToHHmm } = require('./format-helpers');

// Defaults mirror src/lib/db.ts and functions/index.js. Sync if changed there.
const DEFAULT_MAX_CHANGES = 3;
const DEFAULT_ASSESSMENT_NAME = 'Assessment Q2 2026';
const DEFAULT_BU_LIST = ['BSG', 'CHORUS', 'LBU', 'MOC', 'ONC', 'POC', 'TBU'];

function tsToIso(value) {
  return value && typeof value.toDate === 'function' ? value.toDate().toISOString() : null;
}

// Mirror of slotFromDoc() in src/lib/slot-helpers.ts — keep the shape identical
// so the state returned by the callable equals what initDb() would have produced.
function normalizeSlot(id, data) {
  return {
    slotId: id,
    type: data.type,
    date: data.date,
    session: data.session ?? '',
    startMin: data.startMin,
    endMin: data.endMin,
    capacity: data.capacity,
    remaining: data.remaining ?? data.capacity,
    location: data.location ?? '',
    display: data.display ?? `${data.type} | ${data.date} | ${minToHHmm(data.startMin)}–${minToHHmm(data.endMin)}`,
  };
}

// Mirror of getConfig() in src/lib/db.ts (minus emailConfirm, which the client
// does not surface in InitResult).
function normalizeConfig(d) {
  const deadline = tsToIso(d.deadline);
  return {
    deadline,
    deadlinePassed: deadline ? new Date() > new Date(deadline) : false,
    allowEnrollment: d.allowEnrollment !== false,
    maxChanges: typeof d.maxChanges === 'number' ? d.maxChanges : DEFAULT_MAX_CHANGES,
    buList: Array.isArray(d.buList) && d.buList.length > 0 ? d.buList.map(String) : DEFAULT_BU_LIST,
    assessmentName: typeof d.assessmentName === 'string' && d.assessmentName.trim()
      ? d.assessmentName.trim()
      : DEFAULT_ASSESSMENT_NAME,
  };
}

// Mirror of getMyBooking() in src/lib/db.ts.
function normalizeMyBooking(d) {
  return {
    empCode: d.empCode ?? '',
    fullName: d.fullName ?? '',
    bu: d.bu ?? '',
    speakingSlotId: d.speakingSlotId ?? null,
    skillsSlotId: d.skillsSlotId ?? null,
    createdAt: tsToIso(d.createdAt),
    updatedAt: tsToIso(d.updatedAt),
    changeCount: d.changeCount ?? 0,
  };
}

/**
 * Build the fresh client state (InitResult shape, minus `clientNow`) server-side,
 * co-located with Firestore. Returned by bookRegistration/cancelRegistration so the
 * client does not have to round-trip back to Firestore via initDb() after a write.
 *
 * `clientNow` is intentionally omitted — the client stamps it locally to preserve
 * the existing skew≈0 behaviour in App.tsx.
 */
async function buildClientState(db, email) {
  const [cfgSnap, slotsSnap, regSnap] = await Promise.all([
    db.doc('config/main').get(),
    db.collection('slots').get(),
    db.doc(`registrations/${email}`).get(),
  ]);

  const cfg = normalizeConfig(cfgSnap.exists ? cfgSnap.data() : {});
  const slots = slotsSnap.docs.map((doc) => normalizeSlot(doc.id, doc.data()));
  slots.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.startMin - b.startMin;
  });
  const myBooking = regSnap.exists ? normalizeMyBooking(regSnap.data()) : null;

  return {
    email,
    myBooking,
    slots,
    deadline: cfg.deadline,
    deadlinePassed: cfg.deadlinePassed,
    allowEnrollment: cfg.allowEnrollment,
    maxChanges: cfg.maxChanges,
    buList: cfg.buList,
    assessmentName: cfg.assessmentName,
  };
}

module.exports = { buildClientState };

async function cleanupRegistrationEmailFields(db, FieldValue) {
  const snap = await db.collection('registrations').get();
  let scanned = 0;
  let cleaned = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const docSnap of snap.docs) {
    scanned += 1;
    if (!Object.prototype.hasOwnProperty.call(docSnap.data(), 'email')) continue;
    batch.update(db.doc(`registrations/${docSnap.id}`), { email: FieldValue.delete() });
    cleaned += 1;
    batchCount += 1;
    if (batchCount % 500 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (cleaned > 0 && batchCount % 500 !== 0) await batch.commit();

  return { scanned, cleaned };
}

async function cleanupFunctionRateLimits(db, Timestamp, maxAgeMs) {
  const snap = await db.collection('functionRateLimits').get();
  const cutoffMs = Date.now() - maxAgeMs;
  let scanned = 0;
  let deleted = 0;

  for (const doc of snap.docs) {
    scanned += 1;
    const lastCallAt = doc.data().lastCallAt;
    const lastMs = typeof lastCallAt?.toDate === 'function' ? lastCallAt.toDate().getTime() : 0;
    if (!lastMs || lastMs >= cutoffMs) continue;
    await db.doc(`functionRateLimits/${doc.id}`).delete();
    deleted += 1;
  }

  return {
    scanned,
    deleted,
    cutoff: Timestamp.fromMillis(cutoffMs),
  };
}

module.exports = { cleanupFunctionRateLimits, cleanupRegistrationEmailFields };

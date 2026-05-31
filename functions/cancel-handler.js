const { buildClientState } = require('./client-state');

function createCancelRegistrationHandler({ db, Timestamp, HttpsError, assertSignedIn, addAudit, userRateLimitMs }) {
  function businessError(message) {
    return new HttpsError('failed-precondition', message);
  }

  function rateLimitRef(operation, email) {
    const key = String(email).toLowerCase().replace(/[/.#[\]$]/g, '_');
    return db.doc(`functionRateLimits/${operation}_${key}`);
  }

  function assertNotRateLimited(rateSnap) {
    if (!rateSnap.exists) return;
    const lastCallAt = rateSnap.data().lastCallAt;
    const lastMs = typeof lastCallAt?.toDate === 'function' ? lastCallAt.toDate().getTime() : 0;
    if (lastMs && Date.now() - lastMs < userRateLimitMs) {
      throw new HttpsError('resource-exhausted', 'Bạn thao tác quá nhanh. Vui lòng thử lại sau vài giây.');
    }
  }

  return async function cancelRegistration(request) {
    const email = assertSignedIn(request);

    await db.runTransaction(async (tx) => {
      const regRef = db.doc(`registrations/${email}`);
      const userRateRef = rateLimitRef('cancelRegistration', email);
      const [cfgSnap, regSnap, rateSnap] = await Promise.all([
        tx.get(db.doc('config/main')),
        tx.get(regRef),
        tx.get(userRateRef),
      ]);

      const cfg = cfgSnap.exists ? cfgSnap.data() : {};
      if (cfg.allowEnrollment === false) throw businessError('Đăng ký hiện đang bị khoá. Vui lòng liên hệ Ban tổ chức.');
      if (cfg.deadline && Date.now() > cfg.deadline.toDate().getTime()) throw businessError('Đã hết hạn đăng ký. Không thể hủy.');
      assertNotRateLimited(rateSnap);
      if (!regSnap.exists) throw businessError('Bạn chưa có đăng ký nào để hủy.');
      const reg = regSnap.data();

      const claimRef = typeof reg.empCode === 'string' ? db.doc(`empCodeClaims/${reg.empCode}`) : null;
      const [spSnap, skSnap, claimSnap] = await Promise.all([
        reg.speakingSlotId ? tx.get(db.doc(`slots/${reg.speakingSlotId}`)) : Promise.resolve(null),
        reg.skillsSlotId ? tx.get(db.doc(`slots/${reg.skillsSlotId}`)) : Promise.resolve(null),
        claimRef ? tx.get(claimRef) : Promise.resolve(null),
      ]);

      if (spSnap?.exists) tx.update(spSnap.ref, { remaining: (spSnap.data().remaining ?? 0) + 1 });
      if (skSnap?.exists) tx.update(skSnap.ref, { remaining: (skSnap.data().remaining ?? 0) + 1 });
      tx.set(userRateRef, { lastCallAt: Timestamp.now() });
      tx.delete(regRef);
      if (claimRef && claimSnap?.exists && claimSnap.data().email === email) tx.delete(claimRef);
      tx.set(db.doc(`cancelledQuota/${email}`), {
        changeCount: reg.changeCount ?? 0,
        cancelledAt: Timestamp.now(),
      });
    });

    // Audit + fresh state in parallel; state is returned so the client skips
    // a post-cancel initDb() round-trip.
    const [, state] = await Promise.all([
      addAudit(email, 'book.cancel', {}),
      buildClientState(db, email),
    ]);
    return { ok: true, state };
  };
}

module.exports = { createCancelRegistrationHandler };

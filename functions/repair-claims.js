async function repairClaims(db) {
  const regsSnap = await db.collection('registrations').get();
  const byCode = new Map();
  regsSnap.forEach((doc) => {
    const reg = doc.data();
    if (!/^\d{6}$/.test(String(reg.empCode || ''))) return;
    const arr = byCode.get(reg.empCode) || [];
    arr.push({ ...reg, email: doc.id });
    byCode.set(reg.empCode, arr);
  });

  const result = { created: 0, kept: 0, skippedDuplicates: [], conflicts: [] };
  for (const [empCode, regs] of byCode) {
    if (regs.length > 1) {
      result.skippedDuplicates.push({ empCode, emails: regs.map((r) => r.email) });
      continue;
    }
    const registrationEmail = regs[0].email;
    const claimRef = db.doc(`empCodeClaims/${empCode}`);
    const claimSnap = await claimRef.get();
    if (claimSnap.exists) {
      const claimEmail = claimSnap.data().email;
      if (claimEmail === registrationEmail) result.kept += 1;
      else result.conflicts.push({ empCode, claimEmail, registrationEmail });
      continue;
    }
    await claimRef.set({ email: registrationEmail });
    result.created += 1;
  }
  return result;
}

module.exports = { repairClaims };

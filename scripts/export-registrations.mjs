/**
 * Export all registrations to CSV.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/export-registrations.mjs
 *
 * Output: registrations-YYYY-MM-DD.csv (in current directory)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) {
  console.error('❌  Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(credPath), 'utf8'))) });
const db = getFirestore();

const minToHHmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const formatDateVi = (s) => { const [y, mo, d] = s.split('-'); return `${d}/${mo}/${y}`; };
const csv = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
};

async function run() {
  const [slotsSnap, regsSnap] = await Promise.all([
    db.collection('slots').get(),
    db.collection('registrations').get(),
  ]);

  const slots = new Map();
  slotsSnap.forEach((d) => {
    const data = d.data();
    slots.set(d.id, `${formatDateVi(data.date)} ${minToHHmm(data.startMin)}-${minToHHmm(data.endMin)}`);
  });

  const rows = [
    ['Email', 'Mã NV', 'Họ tên', 'BU', 'Speaking', 'Speaking ID', '3 Skills', '3 Skills ID', 'Số lần đổi', 'Đăng ký lúc', 'Cập nhật lúc'],
  ];
  regsSnap.forEach((d) => {
    const r = d.data();
    rows.push([
      d.id,
      r.empCode ?? '',
      r.fullName ?? '',
      r.bu ?? '',
      slots.get(r.speakingSlotId) ?? '',
      r.speakingSlotId ?? '',
      slots.get(r.skillsSlotId) ?? '',
      r.skillsSlotId ?? '',
      r.changeCount ?? 0,
      r.createdAt ? r.createdAt.toDate().toLocaleString('vi-VN') : '',
      r.updatedAt ? r.updatedAt.toDate().toLocaleString('vi-VN') : '',
    ]);
  });

  // UTF-8 BOM so Excel reads Vietnamese chars correctly
  const text = '﻿' + rows.map((row) => row.map(csv).join(',')).join('\n');
  const fname = `registrations-${new Date().toISOString().slice(0, 10)}.csv`;
  writeFileSync(fname, text, 'utf8');
  console.log(`✅  Exported ${regsSnap.size} registrations → ${fname}`);
}

run().catch((e) => { console.error('❌', e.message); process.exit(1); });

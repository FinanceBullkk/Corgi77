import { minToHHmm, type Slot } from './types';
import {
  REGISTRATIONS_PAGE_SIZE,
  listRegistrationsPage,
  type Registration,
  type RegistrationPageCursor,
} from './admin-registrations';

export type CsvExportProgress = {
  loaded: number;
  total: number;
};

const CSV_HEADER = ['Email', 'Mã NV', 'Họ tên', 'BU', 'Speaking', 'Speaking ID', '3 Skills', '3 Skills ID', 'Số lần đổi', 'Đăng ký lúc', 'Cập nhật lúc'];

function makeSlotFormatter(slots: Slot[]) {
  const slotMap = new Map(slots.map((s) => [s.slotId, s]));
  return (id: string | null) => {
    if (!id) return '';
    const s = slotMap.get(id);
    if (!s) return id;
    const [y, mo, d] = s.date.split('-');
    return `${d}/${mo}/${y} ${minToHHmm(s.startMin)}-${minToHHmm(s.endMin)}`;
  };
}

function csv(v: unknown) {
  if (v == null) return '';
  let s = String(v);
  // Prevent CSV formula injection (CWE-1236): escape prefixes that Excel/Sheets evaluate as formulas.
  if (/^[=+\-@\t|]/.test(s)) s = "'" + s;
  s = s.replace(/\r?\n/g, ' ');
  return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function rowForRegistration(r: Registration, fmtSlot: (id: string | null) => string) {
  return [
    r.email,
    r.empCode,
    r.fullName,
    r.bu,
    fmtSlot(r.speakingSlotId),
    r.speakingSlotId ?? '',
    fmtSlot(r.skillsSlotId),
    r.skillsSlotId ?? '',
    r.changeCount,
    r.createdAt ? new Date(r.createdAt).toLocaleString('vi-VN') : '',
    r.updatedAt ? new Date(r.updatedAt).toLocaleString('vi-VN') : '',
  ];
}

function downloadCsvChunks(chunks: BlobPart[], filenamePrefix: string) {
  const blob = new Blob(chunks, { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadRegistrationsCsv(regs: Registration[], slots: Slot[]) {
  const fmtSlot = makeSlotFormatter(slots);
  const rows = [
    CSV_HEADER,
    ...regs.map((r) => rowForRegistration(r, fmtSlot)),
  ];
  downloadCsvChunks(['﻿', rows.map((row) => row.map(csv).join(',')).join('\n')], 'registrations');
}

export async function downloadAllRegistrationsCsv(
  slots: Slot[],
  onProgress?: (progress: CsvExportProgress) => void,
) {
  const fmtSlot = makeSlotFormatter(slots);
  const chunks: BlobPart[] = ['﻿', CSV_HEADER.map(csv).join(',')];
  let cursor: RegistrationPageCursor | null = null;
  let loaded = 0;
  let total = 0;

  do {
    const page = await listRegistrationsPage(cursor, REGISTRATIONS_PAGE_SIZE);
    total = page.total;
    loaded += page.items.length;
    if (page.items.length > 0) {
      chunks.push('\n', page.items.map((r) => rowForRegistration(r, fmtSlot).map(csv).join(',')).join('\n'));
    }
    onProgress?.({ loaded, total });
    cursor = page.nextCursor;
  } while (cursor);

  downloadCsvChunks(chunks, 'registrations');
}

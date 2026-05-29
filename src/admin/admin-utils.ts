import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatDateVi, minToHHmm, type Slot, type SlotType } from '../lib/types';

export type Tab = 'overview' | 'registrations' | 'slots' | 'ineligibility' | 'config' | 'audit';

export const NAV: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'registrations', label: 'Đăng ký' },
  { id: 'slots', label: 'Ca thi' },
  { id: 'ineligibility', label: 'Danh sách chặn' },
  { id: 'config', label: 'Cấu hình' },
  { id: 'audit', label: 'Audit' },
];

export const HEADER: Record<Tab, { t: string; s: string }> = {
  overview: { t: 'Tổng quan', s: 'Tình hình đăng ký · Assessment Q2 2026' },
  registrations: { t: 'Đăng ký', s: 'Danh sách nhân viên đã đăng ký ca thi' },
  slots: { t: 'Ca thi', s: 'Quản lý ca · phòng · sức chứa' },
  ineligibility: { t: 'Danh sách chặn', s: 'Nhân viên không đủ điều kiện đăng ký' },
  config: { t: 'Cấu hình', s: 'Đăng ký · thông báo · phân quyền' },
  audit: { t: 'Audit log', s: 'Lịch sử thao tác · immutable' },
};

export interface ConfigState {
  allowEnrollment: boolean;
  maxChanges: number;
  deadline: Date | null;
  emailConfirm: boolean;
  adminEmails: string[];
}

export async function loadConfig(): Promise<ConfigState> {
  const snap = await getDoc(doc(db, 'config', 'main'));
  const d = snap.exists() ? snap.data() : {};
  return {
    allowEnrollment: d.allowEnrollment !== false,
    maxChanges: typeof d.maxChanges === 'number' ? d.maxChanges : 3,
    deadline: d.deadline ? (d.deadline as Timestamp).toDate() : null,
    emailConfirm: d.emailConfirm === true,
    adminEmails: Array.isArray(d.adminEmails) ? d.adminEmails : [],
  };
}

// ── Shared helpers ──────────────────────────────────────────────────────────

const VI_DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export function dowVi(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  return isNaN(d.getTime()) ? '' : VI_DOW[d.getDay()];
}

export function typClass(type: SlotType): 'sp' | 'sk' {
  return type === 'Speaking' ? 'sp' : 'sk';
}

type SlotStatus = 'ok' | 'warn' | 'full' | 'closed';
export function slotStatus(s: Slot, allowEnrollment: boolean): SlotStatus {
  if (!allowEnrollment) return 'closed';
  if (s.remaining <= 0) return 'full';
  if (s.capacity > 0 && s.remaining / s.capacity <= 0.25) return 'warn';
  return 'ok';
}
export const STATUS_LABEL: Record<SlotStatus, string> = { ok: 'Còn chỗ', warn: 'Sắp đầy', full: 'Đã đầy', closed: 'Đã đóng' };

export function slotLabel(slotMap: Map<string, Slot>, id: string | null): string {
  if (!id) return '—';
  const s = slotMap.get(id);
  if (s) return `${formatDateVi(s.date)} · ${minToHHmm(s.startMin)}–${minToHHmm(s.endMin)}`;
  const m = /^(?:SP|3S)-(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(id);
  if (m) return `${m[1]}/${m[2]} · ${m[3]}:${m[4]}`;
  return id;
}

export function addMin(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function initials(email: string): string {
  const name = email.split('@')[0] ?? '';
  const parts = name.split(/[._-]/).filter(Boolean);
  const s = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return (s || name.slice(0, 2)).toUpperCase();
}

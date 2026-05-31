import { minToHHmm, overlaps, type Slot } from '../lib/types';

// ─── Types ────────────────────────────────────────────────────────────────

export type FlowState = 'step1' | 'step2' | 'confirm' | 'success' | 'display';
export type Step1Data = { empCode: string; fullName: string; bu: string };
export type Selection = { speakingId: string | null; skillsId: string | null };

export interface DeadlineInfo {
  daysLeft: number;
  hoursLeft: number;
  urgent: boolean;
  text: string;
  passed: boolean;
}

export type SlotSt = 'sel' | 'full' | 'conflict' | 'ok';

// px per hour row · MUST match --row-h in .cal (styles.css)
export const ROW_H = 64;

// ─── Helpers ──────────────────────────────────────────────────────────────

export function emailInitials(email: string): string {
  return email.split('@')[0].slice(0, 2).toUpperCase();
}

export function emailShortName(email: string): string {
  return email.split('@')[0];
}

export function computeDeadline(
  deadline: string | null,
  _clientNow: string,
  deadlinePassed: boolean,
  skew: number,
): DeadlineInfo | null {
  if (!deadline) return null;
  if (deadlinePassed)
    return { daysLeft: 0, hoursLeft: 0, urgent: true, text: 'Đã đóng đăng ký', passed: true };
  const diffMs = new Date(deadline).getTime() - (Date.now() + skew);
  if (diffMs <= 0)
    return { daysLeft: 0, hoursLeft: 0, urgent: true, text: 'Đã đóng đăng ký', passed: true };
  const totalMin = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  let text: string;
  if (totalMin < 60) text = `Còn ${mins} phút`;
  else if (days > 0) text = `Còn ${days} ngày ${hours} giờ`;
  else text = `Còn ${hours} giờ ${mins} phút`;
  return { daysLeft: days, hoursLeft: hours, urgent: totalMin < 60, text, passed: false };
}

export function uniqueSortedDates(slots: Slot[]): string[] {
  return [...new Set(slots.map((s) => s.date))].sort();
}

export function dayHeader(date: string): { abbr: string; label: string } {
  const d = new Date(date + 'T00:00:00');
  const abbrs = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const dd = d.getDate().toString().padStart(2, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  return { abbr: abbrs[d.getDay()], label: `${dd}/${mm}` };
}

export function weekRangeLabel(dates: string[]): string {
  if (!dates.length) return '';
  const a = new Date(dates[0] + 'T00:00:00');
  const b = new Date(dates[dates.length - 1] + 'T00:00:00');
  return `Tuần ${a.getDate()}/${a.getMonth() + 1} – ${b.getDate()}/${b.getMonth() + 1}/${b.getFullYear()}`;
}

export function daysUntil(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(isoDate + 'T00:00:00');
  return Math.max(0, Math.ceil((d.getTime() - today.getTime()) / 86_400_000));
}

export function slotSt(
  s: Slot,
  spSel: Slot | null,
  skSel: Slot | null,
  curSpId: string | null,
  curSkId: string | null,
): SlotSt {
  if (s.slotId === spSel?.slotId || s.slotId === skSel?.slotId) return 'sel';
  const isCur = s.slotId === curSpId || s.slotId === curSkId;
  if (s.remaining <= 0 && !isCur) return 'full';
  const other = s.type === 'Speaking' ? skSel : spSel;
  if (other && overlaps(s, other)) return 'conflict';
  return 'ok';
}

/** Accessible label for a slot button (replaces the inconsistently announced `title`). */
export function slotAriaLabel(slot: Slot, st: SlotSt, deadlinePassed: boolean): string {
  const time = `${minToHHmm(slot.startMin)}–${minToHHmm(slot.endMin)}`;
  const loc = slot.location ? ` · ${slot.location}` : '';
  const seats = `Còn ${slot.remaining}/${slot.capacity} chỗ`;
  if (deadlinePassed && st !== 'sel') return `Ca ${slot.type} ${time}${loc} · ${seats} (đã hết hạn đăng ký)`;
  switch (st) {
    case 'sel': return `Đang chọn ca ${slot.type} ${time}${loc} · ${seats} · Bấm để bỏ chọn`;
    case 'full': return `Ca ${slot.type} ${time}${loc} · Đã hết chỗ`;
    case 'conflict': return `Ca ${slot.type} ${time}${loc} · Trùng giờ với ca đã chọn`;
    default: return `Chọn ca ${slot.type} ${time}${loc} · ${seats}`;
  }
}

/** Remove Vietnamese diacritics and convert to uppercase. */
export function toUpperNoAccent(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // remove combining diacritical marks
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase();
}

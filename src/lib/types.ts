/**
 * Shared types and utility functions for the Assessment Booking app.
 *
 * Originally lived in gas.ts when the backend was Google Apps Script.
 * Extracted here after migrating to Firebase (2026-05).
 */

export type SlotType = 'Speaking' | '3 Skills';

export interface Slot {
  slotId: string;
  type: SlotType;
  date: string;
  session?: string;
  startMin: number;
  endMin: number;
  capacity: number;
  remaining: number;
  location: string;
  display: string;
}

export interface MyBooking {
  empCode: string;
  fullName: string;
  bu: string;
  speakingSlotId: string | null;
  skillsSlotId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  changeCount: number;
}

export interface InitResult {
  email: string;
  myBooking: MyBooking | null;
  slots: Slot[];
  deadline: string | null;
  deadlinePassed: boolean;
  allowEnrollment: boolean;
  clientNow: string;
  maxChanges: number;
  buList: string[];
  assessmentName: string;
}

export interface BookPayload {
  empCode: string;
  fullName: string;
  bu: string;
  speakingSlotId: string;
  skillsSlotId: string;
}

export interface BookResult {
  ok: boolean;
  error?: string;
  emailSent?: boolean;
  state?: InitResult;
}

export interface CancelResult {
  ok: boolean;
  error?: string;
  state?: InitResult;
}

export function overlaps(a: Slot, b: Slot): boolean {
  return a.date === b.date && a.startMin < b.endMin && a.endMin > b.startMin;
}

export function formatDateVi(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-');
  return `${d}/${m}/${y}`;
}

export function minToHHmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

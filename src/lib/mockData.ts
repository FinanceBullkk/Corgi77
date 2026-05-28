import type { BookPayload, BookResult, CancelResult, InitResult, Slot } from './gas';

const STORAGE_KEY = 'mock_booking_state_v1';

interface MockState {
  speakingSlotId: string | null;
  skillsSlotId: string | null;
  empCode: string;
  fullName: string;
  bu: string;
  updatedAt: string | null;
  remaining: Record<string, number>;
}

function makeSlot(
  id: string,
  type: 'Speaking' | '3 Skills',
  date: string,
  startMin: number,
  endMin: number,
  capacity: number,
): Slot {
  const [, mm, dd] = date.split('-');
  const hhmm = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return {
    slotId: id,
    type,
    date,
    session: startMin < 12 * 60 ? 'AM' : 'PM',
    startMin,
    endMin,
    capacity,
    remaining: capacity,
    location: type === 'Speaking' ? 'Phòng A' : 'Phòng B',
    display: `${type} | ${dd}/${mm} | ${hhmm(startMin)}–${hhmm(endMin)} | ${type === 'Speaking' ? 'Phòng A' : 'Phòng B'}`,
  };
}

const BASE_SLOTS: Slot[] = [
  makeSlot('SP-2206-1330', 'Speaking', '2026-06-22', 13 * 60 + 30, 14 * 60 + 30, 8),
  makeSlot('SP-2206-1500', 'Speaking', '2026-06-22', 15 * 60, 16 * 60, 8),
  makeSlot('SP-2306-0900', 'Speaking', '2026-06-23', 9 * 60, 10 * 60, 8),
  makeSlot('SP-2306-1030', 'Speaking', '2026-06-23', 10 * 60 + 30, 11 * 60 + 30, 8),
  makeSlot('3S-2206-0900', '3 Skills', '2026-06-22', 9 * 60, 11 * 60 + 30, 14),
  makeSlot('3S-2306-1330', '3 Skills', '2026-06-23', 13 * 60 + 30, 16 * 60, 14),
  makeSlot('3S-2406-0900', '3 Skills', '2026-06-24', 9 * 60, 11 * 60 + 30, 14),
  makeSlot('3S-2406-1330', '3 Skills', '2026-06-24', 13 * 60 + 30, 16 * 60, 14),
];

function loadState(): MockState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {
    speakingSlotId: null,
    skillsSlotId: null,
    empCode: '',
    fullName: '',
    bu: '',
    updatedAt: null,
    remaining: Object.fromEntries(BASE_SLOTS.map((s) => [s.slotId, s.capacity])),
  };
}

function saveState(s: MockState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function withRemaining(state: MockState): Slot[] {
  return BASE_SLOTS.map((s) => ({
    ...s,
    remaining: state.remaining[s.slotId] ?? s.capacity,
  }));
}

const MOCK_EMAIL = 'devuser@cyberlogitec.com';
const MOCK_DEADLINE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

export async function mockInit(): Promise<InitResult> {
  await delay(200);
  const s = loadState();
  const hasBooking = !!(s.speakingSlotId && s.skillsSlotId);
  return {
    email: MOCK_EMAIL,
    myBooking: hasBooking
      ? {
          empCode: s.empCode,
          fullName: s.fullName,
          bu: s.bu,
          speakingSlotId: s.speakingSlotId,
          skillsSlotId: s.skillsSlotId,
          createdAt: s.updatedAt,
          updatedAt: s.updatedAt,
          changeCount: 0,
        }
      : null,
    slots: withRemaining(s),
    deadline: MOCK_DEADLINE,
    deadlinePassed: new Date() > new Date(MOCK_DEADLINE),
    allowEnrollment: true,
    serverNow: new Date().toISOString(),
    maxChanges: 3,
  };
}

export async function mockBook(payload: BookPayload): Promise<BookResult> {
  await delay(400);
  const state = loadState();
  const slots = withRemaining(state);
  const byId = Object.fromEntries(slots.map((s) => [s.slotId, s]));

  const sp = byId[payload.speakingSlotId];
  const sk = byId[payload.skillsSlotId];
  if (!sp || sp.type !== 'Speaking') return { ok: false, error: 'Ca Speaking không hợp lệ.' };
  if (!sk || sk.type !== '3 Skills') return { ok: false, error: 'Ca 3 Skills không hợp lệ.' };

  const oldSp = state.speakingSlotId;
  const oldSk = state.skillsSlotId;

  const spRemain = (state.remaining[sp.slotId] ?? sp.capacity) + (oldSp === sp.slotId ? 1 : 0);
  const skRemain = (state.remaining[sk.slotId] ?? sk.capacity) + (oldSk === sk.slotId ? 1 : 0);
  if (spRemain <= 0)
    return { ok: false, error: `Ca Speaking "${sp.display}" đã hết chỗ.`, state: await mockInit() };
  if (skRemain <= 0)
    return { ok: false, error: `Ca 3 Skills "${sk.display}" đã hết chỗ.`, state: await mockInit() };

  if (sp.date === sk.date && sp.startMin < sk.endMin && sp.endMin > sk.startMin)
    return { ok: false, error: 'Hai ca thi bị trùng giờ. Vui lòng chọn ca không trùng.' };

  if (oldSp && oldSp !== sp.slotId)
    state.remaining[oldSp] = (state.remaining[oldSp] ?? 0) + 1;
  if (oldSk && oldSk !== sk.slotId)
    state.remaining[oldSk] = (state.remaining[oldSk] ?? 0) + 1;
  if (oldSp !== sp.slotId)
    state.remaining[sp.slotId] = (state.remaining[sp.slotId] ?? sp.capacity) - 1;
  if (oldSk !== sk.slotId)
    state.remaining[sk.slotId] = (state.remaining[sk.slotId] ?? sk.capacity) - 1;

  state.speakingSlotId = sp.slotId;
  state.skillsSlotId = sk.slotId;
  state.empCode = payload.empCode;
  state.fullName = payload.fullName;
  state.bu = payload.bu;
  state.updatedAt = new Date().toISOString();
  saveState(state);
  return { ok: true, emailSent: true, state: await mockInit() };
}

export async function mockCancel(): Promise<CancelResult> {
  await delay(300);
  const state = loadState();
  if (state.speakingSlotId)
    state.remaining[state.speakingSlotId] =
      (state.remaining[state.speakingSlotId] ?? 0) + 1;
  if (state.skillsSlotId)
    state.remaining[state.skillsSlotId] =
      (state.remaining[state.skillsSlotId] ?? 0) + 1;
  state.speakingSlotId = null;
  state.skillsSlotId = null;
  state.updatedAt = null;
  saveState(state);
  return { ok: true, state: await mockInit() };
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

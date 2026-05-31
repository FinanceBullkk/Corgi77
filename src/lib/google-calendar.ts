import { GoogleAuthProvider, reauthenticateWithPopup } from 'firebase/auth';
import { auth } from './firebase';
import type { Slot } from './types';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export interface GoogleCalendarEventInput {
  empCode: string;
  sp: Slot;
  sk: Slot;
  sequence: number;
  assessmentName: string;
}

export interface GoogleCalendarAddResult {
  htmlLinks: string[];
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function slotDateTime(slot: Slot, min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${slot.date}T${pad(h)}:${pad(m)}:00+07:00`;
}

export function googleCalendarEventId(empCode: string, type: Slot['type']): string {
  const suffix = type === 'Speaking' ? 'sp' : '3s';
  return `assessment${empCode}${suffix}`.toLowerCase();
}

export function buildGoogleCalendarEvents({
  empCode,
  sp,
  sk,
  sequence,
  assessmentName,
}: GoogleCalendarEventInput) {
  const seq = Number.isFinite(sequence) && sequence >= 0 ? sequence : 0;
  const build = (slot: Slot, label: 'Speaking' | '3 Skills') => ({
    id: googleCalendarEventId(empCode, label),
    summary: `${assessmentName} — ${label}`,
    location: slot.location || undefined,
    description: `Ca thi ${label}. Mang theo CCCD/Thẻ NV.`,
    start: {
      dateTime: slotDateTime(slot, slot.startMin),
      timeZone: 'Asia/Ho_Chi_Minh',
    },
    end: {
      dateTime: slotDateTime(slot, slot.endMin),
      timeZone: 'Asia/Ho_Chi_Minh',
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 24 * 60 },
        { method: 'popup', minutes: 60 },
      ],
    },
    extendedProperties: {
      private: {
        app: 'corgi7-assessment-booking',
        empCode,
        sequence: String(seq),
        slotId: slot.slotId,
      },
    },
  });

  return [build(sp, 'Speaking'), build(sk, '3 Skills')];
}

async function calendarFetch(accessToken: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (res.ok) return res.json();
  const body = await res.text();
  const err = new Error(body || `Google Calendar API failed (${res.status})`);
  Object.assign(err, { status: res.status });
  throw err;
}

async function upsertGoogleCalendarEvent(accessToken: string, event: ReturnType<typeof buildGoogleCalendarEvents>[number]) {
  const eventUrl = `${CALENDAR_API}/${encodeURIComponent(event.id)}`;
  try {
    return await calendarFetch(accessToken, eventUrl, {
      method: 'PUT',
      body: JSON.stringify(event),
    });
  } catch (err) {
    if ((err as { status?: number }).status !== 404) throw err;
    return calendarFetch(accessToken, CALENDAR_API, {
      method: 'POST',
      body: JSON.stringify(event),
    });
  }
}

export async function addBookingToGoogleCalendar(input: GoogleCalendarEventInput): Promise<GoogleCalendarAddResult> {
  const user = auth.currentUser;
  if (!user) throw new Error('Bạn cần đăng nhập lại trước khi thêm vào Google Calendar.');

  const provider = new GoogleAuthProvider();
  provider.addScope(CALENDAR_SCOPE);
  const customParameters: Record<string, string> = {};
  if (user.email) customParameters.login_hint = user.email;
  provider.setCustomParameters(customParameters);

  const credential = await reauthenticateWithPopup(user, provider);
  const googleCredential = GoogleAuthProvider.credentialFromResult(credential);
  const accessToken = googleCredential?.accessToken;
  if (!accessToken) throw new Error('Không lấy được quyền Google Calendar. Vui lòng thử lại.');

  const events = buildGoogleCalendarEvents(input);
  const results = await Promise.all(events.map((event) => upsertGoogleCalendarEvent(accessToken, event)));
  return { htmlLinks: results.map((event) => event.htmlLink).filter(Boolean) };
}

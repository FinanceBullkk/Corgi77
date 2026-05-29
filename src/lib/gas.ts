import { mockBook, mockCancel, mockCheckBlocked, mockInit } from './mockData';

type GasFn = 'init' | 'book' | 'cancel' | 'checkBlocked';

declare global {
  interface Window {
    google?: {
      script?: {
        run?: any;
      };
    };
  }
}

const isInHtmlService = (): boolean =>
  typeof window !== 'undefined' && !!window.google?.script?.run;

function callGas<T>(fn: GasFn, ...args: unknown[]): Promise<T> {
  if (!isInHtmlService()) {
    console.warn(`[mock gas.${fn}]`, args);
    if (fn === 'init') return mockInit() as Promise<T>;
    if (fn === 'book') return mockBook(args[0] as any) as Promise<T>;
    if (fn === 'cancel') return mockCancel() as Promise<T>;
    if (fn === 'checkBlocked') return mockCheckBlocked(args[0] as string) as Promise<T>;
    return Promise.reject(new Error(`Unknown mock fn: ${fn}`));
  }

  return new Promise((resolve, reject) => {
    window
      .google!.script!.run!.withSuccessHandler(resolve)
      .withFailureHandler((err: unknown) => {
        const msg =
          (err && typeof err === 'object' && 'message' in err
            ? String((err as { message: unknown }).message)
            : String(err)) || 'Lỗi không xác định.';
        reject(new Error(msg));
      })
      [fn](...args);
  });
}

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
  serverNow: string;
  maxChanges: number;
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

/** Result of a blocklist pre-flight check by empCode. */
export interface BlockCheck {
  blocked: boolean;
  reason?: string;
}

export const init = () => callGas<InitResult>('init');
export const book = (payload: BookPayload) => callGas<BookResult>('book', payload);
export const cancel = () => callGas<CancelResult>('cancel');

/**
 * Pre-flight blocklist check (Step 1 → Step 2 gate). Reads the GAS
 * "Ineligibility" sheet server-side; book() enforces the same list as the
 * hard guarantee. Returns { blocked:false } for any non-6-digit code.
 */
export const checkBlocked = (empCode: string) => callGas<BlockCheck>('checkBlocked', empCode);

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

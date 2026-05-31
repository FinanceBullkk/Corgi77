import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InitResult, Slot } from '../lib/types';

// ── Hoisted mock fns (configurable per test) ───────────────────────────────
const h = vi.hoisted(() => ({
  initDb: vi.fn(),
  bookDb: vi.fn(),
  cancelDb: vi.fn(),
  checkIneligibility: vi.fn(),
  onAuth: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
  fetchAdminEmails: vi.fn(),
  isAdmin: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({
  auth: {},
  db: {},
  onAuth: h.onAuth,
  signInWithGoogle: h.signInWithGoogle,
  signOutUser: h.signOutUser,
}));
vi.mock('../lib/db', () => ({
  initDb: h.initDb,
  bookDb: h.bookDb,
  cancelDb: h.cancelDb,
  checkIneligibility: h.checkIneligibility,
}));
vi.mock('../lib/admin', () => ({
  fetchAdminEmails: h.fetchAdminEmails,
  isAdmin: h.isAdmin,
}));

import { App } from '../App';

// ── Fixtures ───────────────────────────────────────────────────────────────
const SP: Slot = {
  slotId: 'SP1', type: 'Speaking', date: '2026-06-22', startMin: 540, endMin: 600,
  capacity: 10, remaining: 8, location: 'Room A', display: 'SP1',
};
const SK: Slot = {
  slotId: 'SK1', type: '3 Skills', date: '2026-06-22', startMin: 660, endMin: 840,
  capacity: 15, remaining: 12, location: 'Room B', display: 'SK1',
};

const BOOKED: InitResult = {
  email: 'user@test.com',
  myBooking: {
    empCode: '262010', fullName: 'NGUYEN VAN A', bu: 'BSG',
    speakingSlotId: 'SP1', skillsSlotId: 'SK1',
    createdAt: '2026-05-01T00:00:00Z', updatedAt: null, changeCount: 0,
  },
  slots: [SP, SK],
  deadline: null,
  deadlinePassed: false,
  allowEnrollment: true,
  clientNow: new Date().toISOString(),
  maxChanges: 3,
  buList: ['BSG', 'CHORUS', 'LBU', 'MOC', 'ONC', 'POC', 'TBU'],
};

const FRESH: InitResult = { ...BOOKED, myBooking: null };

beforeEach(() => {
  vi.clearAllMocks();
  h.onAuth.mockImplementation((cb: (u: unknown) => void) => {
    cb({ email: 'user@test.com' });
    return () => {};
  });
  h.isAdmin.mockReturnValue(false);
  h.fetchAdminEmails.mockResolvedValue([]);
  h.checkIneligibility.mockResolvedValue(null);
});

// ═══════════════════════════════════════════════════════════════════════════
// Reproduce: "đổi ca" → back to Step 1 should retain Step-1 form fields.
// ═══════════════════════════════════════════════════════════════════════════
describe('Booking navigation — step-1 form retention', () => {
  it('NAV-1: editing an existing booking, going back to Step 1 keeps emp/name/BU', async () => {
    h.initDb.mockResolvedValue(BOOKED);
    const user = userEvent.setup();
    render(<App />);

    // Lands on display
    await screen.findByText('Lịch thi của bạn');

    // "↻ Đổi ca thi" → Step 2 calendar
    await user.click(screen.getByRole('button', { name: /Đổi ca thi/ }));
    await screen.findByText('Chọn 2 ca thi của bạn');

    // "← Sửa thông tin" → Step 1 form
    await user.click(screen.getByRole('button', { name: /Sửa thông tin/ }));
    await screen.findByText('Thông tin học viên');

    expect(screen.getByPlaceholderText('VD: 262010')).toHaveValue('262010');
    expect(screen.getByPlaceholderText('NGUYEN VAN AN')).toHaveValue('NGUYEN VAN A');
    expect(screen.getByRole('combobox')).toHaveValue('BSG');
  });

  it('NAV-3: after cancelling, the auto-returned Step 1 keeps identity (emp/name/BU)', async () => {
    h.initDb.mockResolvedValue(BOOKED);
    h.cancelDb.mockResolvedValue({ ok: true, state: { ...BOOKED, myBooking: null } });
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText('Lịch thi của bạn');

    // ⋮ Tùy chọn → 🗑 Hủy đăng ký → confirm dialog
    await user.click(screen.getByRole('button', { name: /Tùy chọn/ }));
    await user.click(screen.getByRole('menuitem', { name: /Hủy đăng ký/ }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /Hủy đăng ký/ }));

    // App auto-returns to Step 1 ("trang điền thông tin")
    await screen.findByText('Thông tin học viên');

    // Identity is the SAME person — should NOT have to be re-typed
    expect(screen.getByPlaceholderText('VD: 262010')).toHaveValue('262010');
    expect(screen.getByPlaceholderText('NGUYEN VAN AN')).toHaveValue('NGUYEN VAN A');
    expect(screen.getByRole('combobox')).toHaveValue('BSG');
  });

  it('NAV-2: fresh enrollment, Step 2 → back to Step 1 keeps typed values', async () => {
    h.initDb.mockResolvedValue(FRESH);
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText('Thông tin học viên');

    await user.type(screen.getByPlaceholderText('VD: 262010'), '262010');
    await user.type(screen.getByPlaceholderText('NGUYEN VAN AN'), 'NGUYEN VAN A');
    await user.selectOptions(screen.getByRole('combobox'), 'BSG');
    await screen.findByText('✓ Hợp lệ');

    await user.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    await screen.findByText('Chọn 2 ca thi của bạn');

    await user.click(screen.getByRole('button', { name: /Sửa thông tin/ }));
    await screen.findByText('Thông tin học viên');

    expect(screen.getByPlaceholderText('VD: 262010')).toHaveValue('262010');
    expect(screen.getByPlaceholderText('NGUYEN VAN AN')).toHaveValue('NGUYEN VAN A');
    expect(screen.getByRole('combobox')).toHaveValue('BSG');
  });
});

import type { ReactNode } from 'react';

export function EnrollmentLocked({ topbar }: { topbar: ReactNode }) {
  return (
    <div className="app">
      {topbar}
      <main className="container">
        <div className="banner warn mt-4">
          <span className="banner-icon">🔒</span>
          <div>Đăng ký hiện đang bị khoá. Vui lòng liên hệ Ban tổ chức.</div>
        </div>
      </main>
    </div>
  );
}

export function DeadlinePassed({ topbar }: { topbar: ReactNode }) {
  return (
    <div className="app">
      {topbar}
      <main className="container">
        <div className="banner danger mt-4">
          <span className="banner-icon">⏰</span>
          <div>Đã hết hạn đăng ký. Bạn chưa đăng ký ca thi — vui lòng liên hệ Ban tổ chức.</div>
        </div>
      </main>
    </div>
  );
}

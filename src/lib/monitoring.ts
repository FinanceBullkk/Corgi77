import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

/** Initialize Sentry once at app startup. No-op when DSN is not configured. */
export function initMonitoring(): void {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    // Only report errors, not performance traces (keeps free quota)
    tracesSampleRate: 0,
    // Ignore noise: popup-closed is user-initiated, not an error
    ignoreErrors: [/popup-closed/i, /cancelled-popup/i, /popup-blocked/i],
  });
}

/**
 * Report an error to Sentry (if configured) with optional context tags.
 * Never throws — safe to call from inside catch blocks.
 */
export function captureError(
  error: unknown,
  context?: { operation?: string; extra?: Record<string, unknown> }
): void {
  if (DSN) {
    Sentry.captureException(error, {
      tags: context?.operation ? { operation: context.operation } : undefined,
      extra: context?.extra,
    });
  } else {
    // Keep console.warn as local fallback (useful in dev / when DSN not set).
    console.warn(`[${context?.operation ?? 'error'}]`, error);
  }
}

/**
 * Map FirebaseError codes to user-friendly Vietnamese messages.
 * Falls back to the raw message for non-Firebase errors.
 */
export function friendlyFirestoreError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'permission-denied') return 'Bạn không có quyền thực hiện thao tác này.';
  if (code === 'unavailable' || code === 'deadline-exceeded')
    return 'Kết nối tạm thời gián đoạn. Vui lòng thử lại.';
  if (code === 'not-found') return 'Không tìm thấy dữ liệu yêu cầu.';
  if (code === 'unauthenticated') return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  return (e as Error)?.message || 'Đã xảy ra lỗi không xác định.';
}

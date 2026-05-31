export const ALLOWED_EMAIL_DOMAIN = 'cyberlogitec.com';
export const ALLOWED_EMAIL_SUFFIX = `@${ALLOWED_EMAIL_DOMAIN}`;

export function normalizeCompanyEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAllowedCompanyEmail(email: string | null | undefined): boolean {
  const normalized = email ? normalizeCompanyEmail(email) : '';
  if (!normalized?.endsWith(ALLOWED_EMAIL_SUFFIX)) return false;
  return normalized.slice(0, -ALLOWED_EMAIL_SUFFIX.length).length > 0;
}

export const COMPANY_EMAIL_REQUIRED_MESSAGE =
  `Chỉ chấp nhận tài khoản Google có email ${ALLOWED_EMAIL_SUFFIX}.`;

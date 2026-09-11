import type { SecurityHeaderName } from '@jongleberry/api-server'

type BaselineSecurityHeaderName = 'X-XSS-Protection' | 'X-Frame-Options' | 'X-Content-Type-Options'

export const BACKEND_BASELINE_SECURITY_HEADERS = {
  'X-XSS-Protection': '0',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
} as const satisfies Record<BaselineSecurityHeaderName, string>

export const BACKEND_BASELINE_RAW_SECURITY_HEADERS = {
  'x-xss-protection': BACKEND_BASELINE_SECURITY_HEADERS['X-XSS-Protection'],
  'x-frame-options': BACKEND_BASELINE_SECURITY_HEADERS['X-Frame-Options'],
  'x-content-type-options': BACKEND_BASELINE_SECURITY_HEADERS['X-Content-Type-Options'],
} as const satisfies Record<Lowercase<BaselineSecurityHeaderName>, string>

export const VOUCHA_API_SECURITY_HEADERS = {
  ...BACKEND_BASELINE_SECURITY_HEADERS,
  'Strict-Transport-Security': false,
  'Referrer-Policy': false,
  'X-DNS-Prefetch-Control': false,
  'X-Download-Options': false,
  'X-Permitted-Cross-Domain-Policies': false,
} as const satisfies Record<SecurityHeaderName, string | false>

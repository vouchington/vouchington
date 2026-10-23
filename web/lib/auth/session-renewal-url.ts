import { sanitizeLoginNext } from './login-url'

export const SESSION_RENEWAL_PATH = '/session-renewal'

export function getSessionRenewalNext(value: string | undefined): string {
  const next = sanitizeLoginNext(value)
  const pathname = decodeURIComponent(new URL(next, 'https://voucha.invalid').pathname).replace(
    /\/+$/u,
    '',
  )
  return pathname === SESSION_RENEWAL_PATH || pathname === '/login' ? '/' : next
}

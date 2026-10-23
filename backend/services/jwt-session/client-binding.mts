import { createCodedError } from '@modules/on-error/create-coded-error'
import { createHash } from 'node:crypto'
import { getSessionUserAgentFingerprint } from './session-device-name.mts'
import { SESSION_USER_AGENT_MISMATCH, SESSION_JA4_MISMATCH } from '@modules/on-error/error-codes'
import type { DeviceClass, DeviceContext, SessionClientBinding } from './types.mts'

export function createSessionClientBinding(
  deviceClass?: DeviceClass,
  context?: DeviceContext,
): SessionClientBinding {
  return deviceClass === 'attested'
    ? { client: 'native' }
    : {
        client: 'web',
        ua_hash: hashSessionUserAgent(context?.user_agent ?? ''),
        ...(context?.ja4 && { ja4_hash: hashSignal(context.ja4) }),
      }
}

export function assertSessionClientBinding(
  binding: { client?: string; ua_hash?: string; ja4_hash?: string },
  userAgent = '',
  ja4?: string,
): void {
  if (binding.client === 'web' && binding.ua_hash !== hashSessionUserAgent(userAgent)) {
    throw createCodedError(401, 'Session user agent changed', SESSION_USER_AGENT_MISMATCH)
  }
  if (binding.client === 'web' && binding.ja4_hash && ja4 && binding.ja4_hash !== hashSignal(ja4)) {
    throw createCodedError(401, 'Session JA4 changed', SESSION_JA4_MISMATCH)
  }
}

export function isSessionClientBindingError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === SESSION_USER_AGENT_MISMATCH || error.code === SESSION_JA4_MISMATCH)
  )
}

function hashSessionUserAgent(userAgent: string): string {
  return hashSignal(getSessionUserAgentFingerprint(userAgent))
}

function hashSignal(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

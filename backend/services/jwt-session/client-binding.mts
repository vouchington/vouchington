import { createCodedError } from '@modules/on-error/create-coded-error'
import { createHash } from 'node:crypto'
import { SESSION_USER_AGENT_MISMATCH } from '@modules/on-error/error-codes'
import type { DeviceClass, DeviceContext } from './types.mts'

export type SessionClientBinding = { client: 'web'; ua_hash: string } | { client: 'native' }

export function createSessionClientBinding(
  deviceClass?: DeviceClass,
  context?: DeviceContext,
): SessionClientBinding {
  return context?.isNativeClient || deviceClass === 'attested'
    ? { client: 'native' }
    : { client: 'web', ua_hash: hashSessionUserAgent(context?.user_agent ?? '') }
}

export function assertSessionUserAgent(
  binding: { client?: string; ua_hash?: string },
  userAgent = '',
): void {
  if (binding.client === 'web' && binding.ua_hash !== hashSessionUserAgent(userAgent)) {
    throw createCodedError(401, 'Session user agent changed', SESSION_USER_AGENT_MISMATCH)
  }
}

function hashSessionUserAgent(userAgent: string): string {
  return createHash('sha256').update(userAgent).digest('hex')
}

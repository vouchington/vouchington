import createHttpError from 'http-errors'
import type { BrokerCallbackMode, BrokerOAuthProvider, BrokerPurpose } from './broker-config.mts'

export function assertBeginOwnership(purpose: BrokerPurpose, currentUserId?: string): void {
  if (purpose !== 'authenticate' && !currentUserId) {
    throw createHttpError(401, 'Authentication required')
  }
  if (purpose === 'authenticate' && currentUserId) {
    throw createHttpError(409, 'Already authenticated')
  }
}

export function assertCompletionProofChallenge(
  callbackMode: BrokerCallbackMode,
  challenge?: string,
): void {
  const valid = challenge !== undefined && /^[A-Za-z0-9_-]{43}$/.test(challenge)
  if (
    (callbackMode === 'native' && !valid) ||
    (callbackMode === 'web' && challenge !== undefined)
  ) {
    throw createHttpError(422, 'Invalid completion proof challenge')
  }
}

export function getBrokerCallbackUri(
  expectedOrigin: string,
  provider: BrokerOAuthProvider,
): string {
  const origin = new URL(expectedOrigin).origin
  return `${origin}/auth/callback/${provider}/broker`
}

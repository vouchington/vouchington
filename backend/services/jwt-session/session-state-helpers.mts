import { filterSessionRoles } from './assurance.mts'
import type { DeviceContext, SessionClientBinding } from './types.mts'
import { registerAuthenticatedSession } from './user-sessions.mts'
import { registerPostCommitAction, type TransactionQuery } from '@data-stores/psql'
import { trackAuthSessionEvent } from '@services/analytics'
import {
  verifyDeviceJwt,
  RECHECK_AFTER_SECONDS,
  SESSION_CHECK_AFTER_SECONDS,
  type DeviceClass,
  DEVICE_EXPIRATION_SECONDS,
} from '@ts-shared/session-jwt'
import { mintUuidv7 as mintUUIDv7 } from '@vouchington/session-jwt'
import { getUserSessionsRevokedBefore } from './session-revocation-keys.mts'

type DeviceState = {
  did: string
  token?: string
  valid: boolean
  dc?: DeviceClass
}

export async function resolveDeviceState(deviceToken?: string): Promise<DeviceState> {
  if (!deviceToken) return { did: mintUUIDv7(), valid: false }

  const payload = await verifyDeviceJwt(deviceToken)
  if (!payload) return { did: mintUUIDv7(), valid: false }

  return { did: payload.did, token: deviceToken, valid: true, dc: payload.dc }
}

export function getMembershipExpiryClaim(membershipExpiresAt?: Date | null): { mpe?: number } {
  return membershipExpiresAt ? { mpe: Math.floor(membershipExpiresAt.getTime() / 1000) } : {}
}

export async function getSessionIssuedAt(
  uid: string | null,
  clock: () => number = Date.now,
): Promise<number> {
  const now = Math.floor(clock() / 1000)
  if (uid === null) return now
  const revokedBeforeSeconds = await getUserSessionsRevokedBefore(uid)
  return revokedBeforeSeconds !== null && revokedBeforeSeconds >= now
    ? revokedBeforeSeconds + 1
    : now
}

export function getSessionEnrichment(options: {
  uid: string | null
  roles?: readonly string[]
  mfaVerifiedAt?: number
  membershipPlan?: string | null
  membershipExpiresAt?: Date | null
  trustTier?: number
  uiLocale?: string | null
  recheckAfter?: number
  now: number
}) {
  if (options.uid === null) return {}
  return {
    ...(options.roles !== undefined && {
      rol: filterSessionRoles(options.roles, options.mfaVerifiedAt),
    }),
    ...(options.membershipPlan !== undefined && { mpl: options.membershipPlan }),
    ...getMembershipExpiryClaim(options.membershipExpiresAt),
    ...(options.trustTier !== undefined && { tt: options.trustTier }),
    ...(options.uiLocale !== undefined && options.uiLocale !== null && { uil: options.uiLocale }),
    rca: options.recheckAfter ?? options.now + RECHECK_AFTER_SECONDS,
    sca: options.now + SESSION_CHECK_AFTER_SECONDS,
  }
}

/** Joined mints become observable only after their producer-owned transaction commits. */
export function recordSessionMintEvent(
  event: Parameters<typeof trackAuthSessionEvent>[0],
  query?: TransactionQuery,
): void {
  if (query) registerPostCommitAction(query, async () => trackAuthSessionEvent(event))
  else trackAuthSessionEvent(event)
}

export async function registerSessionMintMetadata(
  options: {
    did: string
    sid: string
    uid: string | null
    deviceClass?: DeviceClass
    deviceContext?: DeviceContext
    authOrigin?: 'web' | 'native'
    sessionExpiresAt?: Date
    binding?: SessionClientBinding
  },
  query?: TransactionQuery,
): Promise<void> {
  await registerAuthenticatedSession(
    {
      did: options.did,
      sid: options.sid,
      uid: options.uid,
      deviceClass: options.deviceClass,
      deviceContext: options.deviceContext,
      authOrigin: options.authOrigin,
      expiresAt:
        options.sessionExpiresAt ??
        (options.binding?.client === 'web'
          ? new Date(Date.now() + DEVICE_EXPIRATION_SECONDS * 1000)
          : undefined),
    },
    { query },
  )
}

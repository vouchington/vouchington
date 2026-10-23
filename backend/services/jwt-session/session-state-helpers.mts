import { registerPostCommitAction, type TransactionQuery } from '@data-stores/psql'
import { trackAuthSessionEvent } from '@services/analytics'
import {
  verifyDeviceJwt,
  RECHECK_AFTER_SECONDS,
  SESSION_CHECK_AFTER_SECONDS,
  type DeviceClass,
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
  membershipPlan?: string | null
  membershipExpiresAt?: Date | null
  trustTier?: number
  uiLocale?: string | null
  recheckAfter?: number
  now: number
}) {
  if (options.uid === null) return {}
  return {
    ...(options.roles !== undefined && { rol: options.roles }),
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

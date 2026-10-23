import { v7 } from 'uuid'
import {
  createDeviceAndSessionTokens,
  getEnrichedSessionClaims,
} from '../services/jwt-session/index.mts'
import type { PrivateUser } from '@voucha/types/entities/user'

/** Authenticated API fixtures model a completed flow with explicit original factor proof. */
export async function createAuthenticatedTestSession(user: PrivateUser) {
  const did = v7()
  const mfaVerifiedAt = Math.floor(Date.now() / 1000)
  const claims = await getEnrichedSessionClaims(user, { mfaVerifiedAt })
  return createDeviceAndSessionTokens({ did, uid: user.id, ...claims, mfaVerifiedAt })
}

import type http from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { parseCookie as parseCookieHeader } from 'cookie'
import {
  isSessionRevoked,
  verifyDeviceAndSessionTokens,
  assertSessionClientBinding,
  getSessionAuthorizedUser,
} from '@services/jwt-session'
import { getPrivateUserByAny } from '@services/users/get'
import { currentUserCanAccessQueueStats } from '@services/queue-monitoring'

const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'

export function createWorkerSecretValidator(secret = process.env.CF_WORKER_SECRET) {
  const secretHash = secret ? createHash('sha256').update(secret).digest() : null
  return function isWorkerSecretValid(req: http.IncomingMessage): boolean {
    if (!secretHash) return isDev
    const headerVal = req.headers['x-cf-worker-secret']
    const headerHash = createHash('sha256')
      .update(typeof headerVal === 'string' ? headerVal : '')
      .digest()
    return timingSafeEqual(headerHash, secretHash)
  }
}

type DashboardAuthDependencies = {
  verifyDeviceAndSessionTokens: typeof verifyDeviceAndSessionTokens
  isSessionRevoked: typeof isSessionRevoked
  getPrivateUserByAny: typeof getPrivateUserByAny
  currentUserCanAccessQueueStats: typeof currentUserCanAccessQueueStats
}

const defaultDashboardAuthDependencies = {
  verifyDeviceAndSessionTokens,
  isSessionRevoked,
  getPrivateUserByAny,
  currentUserCanAccessQueueStats,
} satisfies DashboardAuthDependencies

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/backend/README.md`.
 */
export function createIsAdminDashboardRequest(
  dependencies: DashboardAuthDependencies = defaultDashboardAuthDependencies,
) {
  return async function isAdminDashboardRequest(req: http.IncomingMessage): Promise<boolean> {
    const cookies = parseCookieHeader(req.headers.cookie ?? '')
    const dt = cookies.dt
    const st = cookies.st
    if (!dt || !st) return false
    const sessionData = await dependencies.verifyDeviceAndSessionTokens({
      deviceToken: dt,
      sessionToken: st,
    })
    if (!sessionData || !sessionData.uid) return false
    try {
      assertSessionClientBinding(sessionData, req.headers['user-agent'])
    } catch {
      return false
    }
    if (
      await dependencies.isSessionRevoked(sessionData.sid, {
        userId: sessionData.uid,
        deviceId: sessionData.did,
        issuedAt: sessionData.device_iat,
        mfaVerifiedAt: sessionData.mfa_at ?? null,
      })
    ) {
      return false
    }
    const user = await dependencies.getPrivateUserByAny(sessionData.uid, { readOnly: false })
    return dependencies.currentUserCanAccessQueueStats(
      user ? getSessionAuthorizedUser(user, { mfaVerifiedAt: sessionData.mfa_at }) : null,
    )
  }
}

export const isAdminDashboardRequest = createIsAdminDashboardRequest()

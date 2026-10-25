import type http from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { parseCookie as parseCookieHeader } from 'cookie'
import { isSessionRevoked, verifyDeviceAndSessionTokens } from '@services/jwt-session'
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

export async function isAdminDashboardRequest(req: http.IncomingMessage): Promise<boolean> {
  const cookies = parseCookieHeader(req.headers.cookie ?? '')
  const dt = cookies.dt
  const st = cookies.st
  if (!dt || !st) return false
  const sessionData = await verifyDeviceAndSessionTokens({
    deviceToken: dt,
    sessionToken: st,
  })
  if (!sessionData || !sessionData.uid) return false
  if (
    await isSessionRevoked(sessionData.sid, {
      userId: sessionData.uid,
      issuedAt: sessionData.iat,
    })
  ) {
    return false
  }
  const user = await getPrivateUserByAny(sessionData.uid)
  return currentUserCanAccessQueueStats(user)
}

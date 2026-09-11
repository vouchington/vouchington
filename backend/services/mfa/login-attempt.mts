import { randomUUID } from 'node:crypto'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { getAndDelete } from '@data-stores/valkey/idempotency-key'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import { TimeUnit } from '@valkey/valkey-glide'
import onError from '@modules/on-error'
import type { DeviceClass } from '@services/jwt-session'
import { isUUID } from '@ts-shared/utils/validation-core'

const LOGIN_ATTEMPT_TTL_SECONDS = 300 // 5 minutes
const KEY_PREFIX = 'mfa-login-attempt'
const FAILED_ATTEMPT_THRESHOLD = 6

export const failedMfaLoginAttemptRateLimiter = new RateLimiter({
  prefix: 'mfa-login-attempt-failures',
  ttlSeconds: LOGIN_ATTEMPT_TTL_SECONDS,
})

export type LoginAttempt = {
  userId: string
  deviceId: string
  sessionId: string
  deviceClass?: DeviceClass
}

export async function createLoginAttempt(
  attempt: LoginAttempt,
  options: { id?: string } = {},
): Promise<string> {
  const id = options.id ?? randomUUID()
  if (!isUUID(id)) throw new Error('MFA login attempt ID must be a UUID')
  await sessionValkeyClient.set(`${KEY_PREFIX}:${id}`, JSON.stringify(attempt), {
    expiry: { type: TimeUnit.Seconds, count: LOGIN_ATTEMPT_TTL_SECONDS },
  })
  return id
}

export async function getAndDeleteLoginAttempt(attemptId: string): Promise<LoginAttempt | null> {
  if (!isUUID(attemptId)) return null

  const result = await getAndDelete(`${KEY_PREFIX}:${attemptId}`, {
    client: sessionValkeyClient,
  })
  if (result === null) return null
  return JSON.parse(result) as LoginAttempt
}

export async function peekLoginAttempt(attemptId: string): Promise<LoginAttempt | null> {
  if (!isUUID(attemptId)) return null

  const result = await sessionValkeyClient.get(`${KEY_PREFIX}:${attemptId}`)
  if (!result) return null
  return JSON.parse(result as string) as LoginAttempt
}

export async function recordFailedMfaLoginAttempt(
  attemptId: string,
  attempt: LoginAttempt,
): Promise<boolean> {
  if (!isUUID(attemptId)) return false

  try {
    const result = await failedMfaLoginAttemptRateLimiter.addAndCheck(
      getMfaLoginAttemptRateLimitIds(attemptId, attempt),
      FAILED_ATTEMPT_THRESHOLD,
      LOGIN_ATTEMPT_TTL_SECONDS,
    )
    return result.limited
  } catch (error) /* v8 ignore next 3 */ {
    onError(error instanceof Error ? error : new Error(String(error)))
    return false
  }
}

export async function isMfaLoginAttemptLimited(
  attemptId: string,
  attempt: LoginAttempt,
): Promise<boolean> {
  if (!isUUID(attemptId)) return false

  try {
    return await failedMfaLoginAttemptRateLimiter.isRateLimited(
      getMfaLoginAttemptRateLimitIds(attemptId, attempt),
      FAILED_ATTEMPT_THRESHOLD,
      LOGIN_ATTEMPT_TTL_SECONDS,
    )
  } catch (error) /* v8 ignore next 3 */ {
    onError(error instanceof Error ? error : new Error(String(error)))
    return false
  }
}

function getMfaLoginAttemptRateLimitIds(attemptId: string, attempt: LoginAttempt): string[] {
  return [
    `attempt:${attemptId}`,
    `uid:${attempt.userId}`,
    `did:${attempt.deviceId}`,
    `sid:${attempt.sessionId}`,
  ]
}

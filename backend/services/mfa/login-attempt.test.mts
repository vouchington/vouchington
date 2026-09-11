import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createLoginAttempt,
  getAndDeleteLoginAttempt,
  isMfaLoginAttemptLimited,
  peekLoginAttempt,
  recordFailedMfaLoginAttempt,
  type LoginAttempt,
} from './login-attempt.mts'

describe('login-attempt', () => {
  it('consumes login attempts exactly once', async () => {
    const attempt: LoginAttempt = {
      userId: randomUUID(),
      deviceId: randomUUID(),
      sessionId: randomUUID(),
    }

    const attemptId = await createLoginAttempt(attempt)

    await expect(peekLoginAttempt(attemptId)).resolves.toEqual(attempt)
    await expect(getAndDeleteLoginAttempt(attemptId)).resolves.toEqual(attempt)
    await expect(getAndDeleteLoginAttempt(attemptId)).resolves.toBeNull()
    await expect(peekLoginAttempt(attemptId)).resolves.toBeNull()
  })

  it('round-trips deviceClass captured at attempt creation', async () => {
    const attempt: LoginAttempt = {
      userId: randomUUID(),
      deviceId: randomUUID(),
      sessionId: randomUUID(),
      deviceClass: 'attested',
    }

    const attemptId = await createLoginAttempt(attempt)

    await expect(peekLoginAttempt(attemptId)).resolves.toEqual(attempt)
    await expect(getAndDeleteLoginAttempt(attemptId)).resolves.toEqual(attempt)
  })

  it('rejects non-UUID login attempt IDs before lookup', async () => {
    const attempt: LoginAttempt = {
      userId: randomUUID(),
      deviceId: randomUUID(),
      sessionId: randomUUID(),
    }

    const attemptId = await createLoginAttempt(attempt)

    await expect(peekLoginAttempt('not-a-uuid')).resolves.toBeNull()
    await expect(getAndDeleteLoginAttempt('not-a-uuid')).resolves.toBeNull()
    await expect(recordFailedMfaLoginAttempt('not-a-uuid', attempt)).resolves.toBe(false)
    await expect(isMfaLoginAttemptLimited('not-a-uuid', attempt)).resolves.toBe(false)

    // The malformed call must not pre-charge the shared uid/did/sid limiter.
    const validAttemptId = randomUUID()
    await expect(recordFailedMfaLoginAttempt(validAttemptId, attempt)).resolves.toBe(false)
    await expect(recordFailedMfaLoginAttempt(validAttemptId, attempt)).resolves.toBe(false)
    await expect(recordFailedMfaLoginAttempt(validAttemptId, attempt)).resolves.toBe(false)
    await expect(recordFailedMfaLoginAttempt(validAttemptId, attempt)).resolves.toBe(false)
    await expect(recordFailedMfaLoginAttempt(validAttemptId, attempt)).resolves.toBe(false)
    await expect(recordFailedMfaLoginAttempt(validAttemptId, attempt)).resolves.toBe(true)
    await expect(getAndDeleteLoginAttempt(attemptId)).resolves.toEqual(attempt)
  })

  it('limits repeated failures by login attempt and user context', async () => {
    const attempt: LoginAttempt = {
      userId: randomUUID(),
      deviceId: randomUUID(),
      sessionId: randomUUID(),
    }
    const attemptId = randomUUID()

    await expect(recordFailedMfaLoginAttempt(attemptId, attempt)).resolves.toBe(false)
    await expect(recordFailedMfaLoginAttempt(attemptId, attempt)).resolves.toBe(false)
    await expect(isMfaLoginAttemptLimited(attemptId, attempt)).resolves.toBe(false)
    await expect(recordFailedMfaLoginAttempt(attemptId, attempt)).resolves.toBe(false)
    await expect(recordFailedMfaLoginAttempt(attemptId, attempt)).resolves.toBe(false)
    await expect(recordFailedMfaLoginAttempt(attemptId, attempt)).resolves.toBe(false)
    await expect(recordFailedMfaLoginAttempt(attemptId, attempt)).resolves.toBe(true)
    await expect(isMfaLoginAttemptLimited(attemptId, attempt)).resolves.toBe(true)
  })
})

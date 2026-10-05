import { describe, expect, it, vi } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  expireContributionAdmissionClaimForTest,
  getContributionAdmissionReservationStateForTest,
  executeTestAdmittedPost,
} from '@voucha/test-helpers'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { DUPLICATE_TOPIC } from '@modules/on-error/error-codes'
import { runContributionAdmission } from './admission.mts'
import { getContributionAdmissionAttemptsForTest } from '@voucha/test-helpers/contribution-admission-attempts'

describe('contribution admission failure cleanup', () => {
  it('does not record a retryable failure after the precondition loses its lease', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const input = {
      actorId: user.id,
      idempotencyKey: crypto.randomUUID(),
      intent: { request: crypto.randomUUID() },
    }
    const failure = new Error('precondition failed after expiry')
    await expect(
      runContributionAdmission({
        ...input,
        beforeCapacity: async () => {
          await expireContributionAdmissionClaimForTest(input)
          throw failure
        },
        execute: executeTestAdmittedPost,
      }),
    ).rejects.toBe(failure)
    await expect(getContributionAdmissionAttemptsForTest(input)).resolves.toEqual([
      { attempt_number: 1, failure: null, committed: false, abandoned: false },
    ])
    await expect(getContributionAdmissionReservationStateForTest(input)).resolves.toBe(
      'in_progress',
    )
  })

  it.each([
    ['status', createCodedError(409, 'duplicate topic', DUPLICATE_TOPIC)],
    ['statusCode', Object.assign(new Error('invalid mutation'), { statusCode: 422 })],
  ] as const)('discards terminal mutation failures reported by %s', async (_name, error) => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const idempotencyKey = crypto.randomUUID()
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey,
        intent: { request: crypto.randomUUID() },
        execute: async () => {
          throw error
        },
      }),
    ).rejects.toBe(error)
    await expect(
      getContributionAdmissionReservationStateForTest({ actorId: user.id, idempotencyKey }),
    ).resolves.toBeNull()
  })

  it.each([408, 429, 500])('retains retryable HTTP %i mutation failures', async status => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const idempotencyKey = crypto.randomUUID()
    const error = Object.assign(new Error('retryable mutation failure'), { status })

    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey,
        intent: { request: crypto.randomUUID() },
        execute: async () => {
          throw error
        },
      }),
    ).rejects.toBe(error)
    await expect(
      getContributionAdmissionReservationStateForTest({ actorId: user.id, idempotencyKey }),
    ).resolves.toBe('in_progress')
  })

  it('discards a rejected precondition before the mutation begins', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const idempotencyKey = crypto.randomUUID()
    const error = createCodedError(422, 'precondition rejected', 'PRECONDITION_REJECTED')
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey,
        intent: { request: crypto.randomUUID() },
        beforeCapacity: async () => {
          throw error
        },
        execute: executeTestAdmittedPost,
      }),
    ).rejects.toBe(error)
    await expect(
      getContributionAdmissionReservationStateForTest({ actorId: user.id, idempotencyKey }),
    ).resolves.toBeNull()
  })

  it('returns in progress after preconditions lose the lease', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const idempotencyKey = crypto.randomUUID()
    const input = {
      actorId: user.id,
      idempotencyKey,
      intent: { request: crypto.randomUUID() },
    }
    const execute = vi.fn<() => Promise<{ post: { id: string } }>>(async () => ({
      post: { id: crypto.randomUUID() },
    }))

    await expect(
      runContributionAdmission({
        ...input,
        beforeCapacity: () => expireContributionAdmissionClaimForTest(input),
        execute,
      }),
    ).resolves.toEqual({ kind: 'in_progress', retryAfterSeconds: 1 })

    expect(execute).not.toHaveBeenCalled()
  })
})

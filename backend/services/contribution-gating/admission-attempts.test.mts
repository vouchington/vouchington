import { describe, expect, it } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  executeTestAdmittedPost,
  getContributionAdmissionReservationStateForTest,
} from '@voucha/test-helpers'
import { getContributionAdmissionAttemptsForTest } from '@voucha/test-helpers/contribution-admission-attempts'
import { runContributionAdmission } from './admission.mts'

describe('contribution admission attempt history', () => {
  it('keeps a failed mutation retryable without committing its response', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const input = {
      actorId: user.id,
      idempotencyKey: crypto.randomUUID(),
      intent: { title: crypto.randomUUID() },
    }
    await expect(
      runContributionAdmission({
        ...input,
        execute: async () => {
          throw new Error('injected failure')
        },
      }),
    ).rejects.toThrow('injected failure')
    await expect(
      getContributionAdmissionReservationStateForTest({
        actorId: input.actorId,
        idempotencyKey: input.idempotencyKey,
      }),
    ).resolves.toBe('in_progress')
    await expect(
      runContributionAdmission({
        ...input,
        execute: executeTestAdmittedPost,
      }),
    ).resolves.toMatchObject({ kind: 'created' })
    await expect(getContributionAdmissionAttemptsForTest(input)).resolves.toEqual([
      {
        attempt_number: 1,
        failure: { message: 'injected failure' },
        committed: false,
        abandoned: false,
      },
      { attempt_number: 2, failure: null, committed: true, abandoned: false },
    ])
  })
})

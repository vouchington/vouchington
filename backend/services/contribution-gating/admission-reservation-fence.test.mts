import { describe, expect, it } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  deleteContributionAdmissionReservationDuringMutationForTest,
  getContributionAdmissionReservationStateForTest,
} from '@voucha/test-helpers'
import { runContributionAdmission } from './admission.mts'

describe('contribution admission reservation fence', () => {
  it('rolls back the mutation when its reservation disappears before finalization', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const idempotencyKey = crypto.randomUUID()
    const input = {
      actorId: user.id,
      idempotencyKey,
      intent: { request: crypto.randomUUID() },
    }

    await expect(
      runContributionAdmission({
        ...input,
        execute: async query => {
          await deleteContributionAdmissionReservationDuringMutationForTest(query, input)
          return { post: { id: crypto.randomUUID() } }
        },
      }),
    ).resolves.toEqual({ kind: 'in_progress', retryAfterSeconds: 1 })
    await expect(getContributionAdmissionReservationStateForTest(input)).resolves.toBe(
      'in_progress',
    )
  })
})

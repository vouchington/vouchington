import { describe, expect, it } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  getContributionAdmissionPolicyRevisionForTest,
  executeTestAdmittedPost,
} from '@voucha/test-helpers'
import { runContributionAdmission } from './admission.mts'

type ContributionAdmissionAudit = NonNullable<
  Parameters<typeof runContributionAdmission>[0]['audit']
>

describe('contribution admission policy revision', () => {
  it('records the current policy revision when retrying a failed admission', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const input = {
      actorId: user.id,
      idempotencyKey: crypto.randomUUID(),
      intent: { title: crypto.randomUUID() },
    }
    const oldAudit = admissionAudit('old-policy-revision')

    await expect(
      runContributionAdmission({
        ...input,
        audit: oldAudit,
        execute: async () => {
          throw new Error('injected failure')
        },
      }),
    ).rejects.toThrow('injected failure')

    await expect(
      runContributionAdmission({
        ...input,
        audit: admissionAudit('new-policy-revision'),
        execute: executeTestAdmittedPost,
      }),
    ).resolves.toMatchObject({ kind: 'created' })

    expect(await getContributionAdmissionPolicyRevisionForTest(input)).toBe('new-policy-revision')
  })
})

function admissionAudit(policyRevision: string): ContributionAdmissionAudit {
  return {
    route: 'test',
    scope: 'test',
    source: 'discussion',
    postType: 'discussion',
    policyRevision,
  }
}

import { describe, expect, it } from 'vitest'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import type { AppealTargetContext } from './create-target-types.mts'
import { insertModerationAppeal } from './create-insert.mts'

type Query = Parameters<typeof insertModerationAppeal>[0]

const NO_TARGET: AppealTargetContext = {
  communityId: null,
  userWarningId: null,
  communityBanId: null,
  postId: null,
  userSuspensionId: null,
  postRemovalKind: null,
  caseId: crypto.randomUUID(),
  originalDecisionReason: null,
  originalDecisionActorId: null,
  originalDecisionAt: new Date(),
}

describe('insertModerationAppeal when no appeal can be read back', () => {
  // The conflicting open appeal was resolved between the insert and the read: nothing was
  // inserted and nothing is open, so the caller gets a retryable error, not a made-up duplicate.
  it.each([
    ['warning', { userWarningId: crypto.randomUUID() }],
    ['ban', { communityBanId: crypto.randomUUID() }],
    ['post removal', { postId: crypto.randomUUID(), postRemovalKind: 'community' as const }],
    ['suspension', { userSuspensionId: crypto.randomUUID() }],
  ])('fails with a 500 for a %s target', async (_kind, ids) => {
    const user: PrivateUser = await createTestUser()
    const statements: unknown[] = []
    const query = (async (statement: unknown) => {
      statements.push(statement)
      return { rows: [] }
    }) as unknown as Query

    await expect(
      insertModerationAppeal(query, user, WEB_PROVENANCE, 'Please review.', {
        ...NO_TARGET,
        ...ids,
      }),
    ).rejects.toMatchObject({ status: 500, message: 'Failed to create appeal' })

    // The insert, then the read of the open appeal that should have won.
    expect(statements).toHaveLength(2)
  })
})

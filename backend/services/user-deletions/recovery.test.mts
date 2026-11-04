import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createUserDeletionRequest } from './create.mts'
import { claimRecoverableUserDeletions, renewUserDeletionAttempt } from './lifecycle.mts'
import {
  getUserDeletionRequestForTest,
  makeUserDeletionRecoverableForTest,
  markUserDeletionAttemptStartedForTest,
} from '@voucha/test-helpers/services/user-deletions/user-deletion-lifecycle'
import {
  createUserDeletionSweepNeighbor,
  readUserDeletionSweepNeighbor,
} from '../../user-deletion-sweep-neighbor.mts'

describe('user deletion recovery eligibility', () => {
  it('leaves a renewed attempt running while recovering its due sibling', async () => {
    const neighbor = await createUserDeletionSweepNeighbor()
    const user = await createTestUser()
    const running = await createUserDeletionRequest(user.id, user.id)
    await markUserDeletionAttemptStartedForTest(running.id, running.processingAttemptId)
    await makeUserDeletionRecoverableForTest(running.id, 'stale')
    await expect(renewUserDeletionAttempt(running.id, running.processingAttemptId)).resolves.toBe(
      true,
    )
    const before = await getUserDeletionRequestForTest(running.id)
    const siblingUser = await createTestUser()
    const sibling = await createUserDeletionRequest(siblingUser.id, siblingUser.id)
    await makeUserDeletionRecoverableForTest(sibling.id, 'unstarted')

    await expect(claimRecoverableUserDeletions([running.id, sibling.id], 1)).resolves.toEqual([
      { requestId: sibling.id, processingAttemptId: sibling.processingAttemptId },
    ])
    expect(await getUserDeletionRequestForTest(running.id)).toEqual(before)
    expect(await readUserDeletionSweepNeighbor(neighbor.id)).toEqual(neighbor.before)
  })
})

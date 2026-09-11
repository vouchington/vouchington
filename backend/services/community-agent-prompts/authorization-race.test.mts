import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUser,
  getTestPostgresBackendProcessId,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestCommunityMember,
  lockTestCommunityMemberForUpdate,
  removeTestCommunityMember,
  updateTestCommunityMemberRole,
  waitForTestPostgresLockWaiter,
} from '@voucha/test-helpers'
import { deleteCommunityAgentPrompt } from './delete.mts'
import { getCommunityAgentPrompt } from './get.mts'
import { updateCommunityAgentPrompt } from './update.mts'

describe('community agent prompt authorization races', () => {
  it('does not update a prompt after the creator membership is removed while waiting for its lock', async () => {
    const { community, creator, prompt } = await createActiveCreatorPrompt()
    const { holder, releaseRemoval } = holdCreatorRowLockUntilMembershipRemoval(
      community.id,
      creator.id,
    )
    await holder.ready

    const update = updateCommunityAgentPrompt(creator, prompt.id, { prompt: 'Raced update' })
    const updateRejection = update.catch((error: unknown) => error)
    await waitForTestPostgresLockWaiter(await holder.processId, 'getLockedActiveCommunityMember')
    releaseRemoval.resolve()
    await holder.done

    await expect(updateRejection).resolves.toMatchObject({ status: 403 })
    expect((await getCommunityAgentPrompt(prompt.id))?.prompt).toBe(prompt.prompt)
  })

  it('does not delete a prompt after the creator membership is removed while waiting for its lock', async () => {
    const { community, creator, prompt } = await createActiveCreatorPrompt()
    const { holder, releaseRemoval } = holdCreatorRowLockUntilMembershipRemoval(
      community.id,
      creator.id,
    )
    await holder.ready

    const deletion = deleteCommunityAgentPrompt(creator, prompt.id)
    const deletionRejection = deletion.catch((error: unknown) => error)
    await waitForTestPostgresLockWaiter(await holder.processId, 'getLockedActiveCommunityMember')
    releaseRemoval.resolve()
    await holder.done

    await expect(deletionRejection).resolves.toMatchObject({ status: 403 })
    expect(await getCommunityAgentPrompt(prompt.id)).not.toBeNull()
  })
})

async function createActiveCreatorPrompt() {
  const creator = await createTestUser()
  const community = await insertTestCommunity({ createdById: creator.id })
  await insertTestCommunityMember({ communityId: community.id, userId: creator.id, role: 'owner' })
  const prompt = await insertTestCommunityAgentPrompt({
    communityId: community.id,
    createdById: creator.id,
    prompt: 'Original prompt',
  })
  await updateTestCommunityMemberRole(community.id, creator.id, 'member')
  return { community, creator, prompt }
}

function holdCreatorRowLockUntilMembershipRemoval(communityId: string, creatorId: string) {
  const ready = Promise.withResolvers<void>()
  const releaseRemoval = Promise.withResolvers<void>()
  const processId = Promise.withResolvers<number>()
  const done = removeCreatorMembershipAfterLock()

  async function removeCreatorMembershipAfterLock(): Promise<void> {
    await using query = await beginTransaction()
    processId.resolve(await getTestPostgresBackendProcessId(query))
    const options = { query }
    await lockTestCommunityMemberForUpdate(communityId, creatorId, options)
    ready.resolve()
    await releaseRemoval.promise
    await removeTestCommunityMember(communityId, creatorId, options)

    await query.commit()
  }
  return { holder: { ready: ready.promise, done, processId: processId.promise }, releaseRemoval }
}

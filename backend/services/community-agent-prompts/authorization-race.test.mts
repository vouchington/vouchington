import { describe, expect, it, onTestFinished } from 'vitest'
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
} from '@voucha/test-helpers'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { deleteCommunityAgentPrompt } from './delete.mts'
import { getCommunityAgentPrompt } from './get.mts'
import { updateCommunityAgentPrompt } from './update.mts'

describe('community agent prompt authorization races', () => {
  it('does not update a prompt after the creator membership is removed while waiting for its lock', async () => {
    const { community, creator, prompt } = await createActiveCreatorPrompt()
    const holder = holdCreatorRowLockUntilMembershipRemoval(community.id, creator.id)
    const holderProcessId = await holder.ready
    await withTestOwnedPostgresWait(
      {
        pool: 'write',
        holderProcessId,
        lock: { kind: 'transaction' },
        queryMarker: 'getLockedActiveCommunityMember',
        releaseHolder: holder.release,
      },
      async waitForLock => {
        const update = updateCommunityAgentPrompt(creator, prompt, { prompt: 'Raced update' })
        const rejection = update.catch((err: unknown) => err)
        await waitForLock(update)
        await holder.release()
        await expect(rejection).resolves.toMatchObject({ status: 403 })
        expect((await getCommunityAgentPrompt(prompt.id))?.prompt).toBe(prompt.prompt)
      },
    )
  })

  it('does not delete a prompt after the creator membership is removed while waiting for its lock', async () => {
    const { community, creator, prompt } = await createActiveCreatorPrompt()
    const holder = holdCreatorRowLockUntilMembershipRemoval(community.id, creator.id)
    const holderProcessId = await holder.ready
    await withTestOwnedPostgresWait(
      {
        pool: 'write',
        holderProcessId,
        lock: { kind: 'transaction' },
        queryMarker: 'getLockedActiveCommunityMember',
        releaseHolder: holder.release,
      },
      async waitForLock => {
        const deletion = deleteCommunityAgentPrompt(creator, prompt)
        const rejection = deletion.catch((err: unknown) => err)
        await waitForLock(deletion)
        await holder.release()
        await expect(rejection).resolves.toMatchObject({ status: 403 })
        expect(await getCommunityAgentPrompt(prompt.id)).not.toBeNull()
      },
    )
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
  const ready = Promise.withResolvers<number>()
  const releaseRemoval = Promise.withResolvers<void>()
  let released: Promise<void> | undefined
  let done: Promise<void>
  let cleanupReported = false
  const release = async () => {
    try {
      await (released ??= (async () => {
        releaseRemoval.resolve()
        await done
      })())
    } finally {
      cleanupReported = true
    }
  }
  onTestFinished(() => (cleanupReported ? undefined : release()))
  done = removeCreatorMembershipAfterLock()
  void done.catch(ready.reject)

  async function removeCreatorMembershipAfterLock(): Promise<void> {
    await using query = await beginTransaction()
    const processId = await getTestPostgresBackendProcessId(query)
    const options = { query }
    await lockTestCommunityMemberForUpdate(communityId, creatorId, options)
    ready.resolve(processId)
    await releaseRemoval.promise
    await removeTestCommunityMember(communityId, creatorId, options)
    await query.commit()
  }
  return { ready: ready.promise, release }
}

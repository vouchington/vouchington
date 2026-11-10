import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestCommunityMember,
  removeTestCommunityMember,
  updateTestCommunityMemberRole,
} from '@voucha/test-helpers'
import { deleteCommunityAgentPrompt } from './delete.mts'
import { getCommunityAgentPrompt } from './get.mts'
import { updateCommunityAgentPrompt } from './update.mts'

describe('community agent prompt authorization', () => {
  it('does not update a prompt after the creator membership is removed', async () => {
    const { creator, prompt } = await createActiveCreatorPrompt()
    await removeTestCommunityMember(prompt.community_id, creator.id)
    await expect(
      updateCommunityAgentPrompt(creator, prompt, { prompt: 'Raced update' }),
    ).rejects.toMatchObject({ status: 403 })
    expect((await getCommunityAgentPrompt(prompt.id))?.prompt).toBe(prompt.prompt)
  })

  it('does not delete a prompt after the creator membership is removed', async () => {
    const { creator, prompt } = await createActiveCreatorPrompt()
    await removeTestCommunityMember(prompt.community_id, creator.id)
    await expect(deleteCommunityAgentPrompt(creator, prompt)).rejects.toMatchObject({
      status: 403,
    })
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
  return { creator, prompt }
}

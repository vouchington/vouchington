import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestCommunityMember,
  updateTestCommunityMemberRole,
} from '@voucha/test-helpers'

describe('Community Agent Prompt active creator routes', () => {
  it('allows an active regular-member prompt creator to update their prompt', async () => {
    const { community, creator, prompt } = await createActiveRegularCreatorPrompt()
    const request = createRequest()
    await request.authenticateAs(creator)

    const response = await request
      .patch(`/api/v1/communities/${community.slug}/agent-prompts/${prompt.id}`)
      .send({ prompt: 'Member creator update' })
      .expect(200)

    expect(response.body.community_agent_prompt.prompt).toBe('Member creator update')
  })

  it('allows an active regular-member prompt creator to delete their prompt', async () => {
    const { community, creator, prompt } = await createActiveRegularCreatorPrompt()
    const request = createRequest()
    await request.authenticateAs(creator)

    await request
      .delete(`/api/v1/communities/${community.slug}/agent-prompts/${prompt.id}`)
      .expect(204)
  })
})

async function createActiveRegularCreatorPrompt() {
  const creator = await createTestUser()
  const community = await insertTestCommunity({
    createdById: creator.id,
    slug: `agent-prompt-member-creator-${createRandomString(8)}`,
  })
  await insertTestCommunityMember({ communityId: community.id, userId: creator.id, role: 'owner' })
  const prompt = await insertTestCommunityAgentPrompt({
    communityId: community.id,
    createdById: creator.id,
  })
  await updateTestCommunityMemberRole(community.id, creator.id, 'member')
  return { community, creator, prompt }
}

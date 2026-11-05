import { describe, expect, it, onTestFinished } from 'vitest'
import { COMMUNITY_AGENT_PROMPT_LIMIT_REACHED } from '@modules/on-error/error-codes'
import { communityAgentPromptsConfig } from '@services/community-agent-prompts/config'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'

describe('community agent prompt creation route', () => {
  it('returns the stable coded conflict when prompt creation reaches the configured cap', async () => {
    await communityAgentPromptsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(communityAgentPromptsConfig, {
        prompts_per_user_per_community: 1,
      }),
    )

    const owner = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `agent-prompt-cap-${createRandomString(8)}`,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const request = createRequest()
    await request.authenticateAs(owner)
    const path = `/api/v1/communities/${community.slug}/agent-prompts`

    await request.post(path).send({ prompt: 'First moderation prompt.' }).expect(201)
    const rejected = await request
      .post(path)
      .send({ prompt: 'Second moderation prompt.' })
      .expect(409)

    expect(rejected.body.code).toBe(COMMUNITY_AGENT_PROMPT_LIMIT_REACHED)
  })
})

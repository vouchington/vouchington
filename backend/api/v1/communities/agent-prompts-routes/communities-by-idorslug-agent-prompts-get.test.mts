import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'

describe('community agent prompt list route', () => {
  it('paginates community prompts with an opaque after cursor', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `agent-prompt-page-${createRandomString(8)}`,
    })
    const anotherCommunity = await insertTestCommunity({
      createdById: owner.id,
      slug: `agent-prompt-page-other-${createRandomString(8)}`,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityAgentPrompt({
      communityId: anotherCommunity.id,
      createdById: owner.id,
      slotAllocated: true,
    })
    const older = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
    })
    const newer = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
    })
    const request = createRequest()
    await request.authenticateAs(owner)

    const first = await request
      .get(`/api/v1/communities/${community.slug}/agent-prompts?limit=1`)
      .expect(200)

    expect(first.body.community_agent_prompts.map((prompt: { id: string }) => prompt.id)).toEqual([
      newer.id,
    ])
    expect(first.body.page_info).toMatchObject({ has_next_page: true })
    expect(typeof first.body.page_info.end_cursor).toBe('string')
    expect(first.body.slot_info.used).toBe(1)

    const second = await request
      .get(
        `/api/v1/communities/${community.slug}/agent-prompts?limit=1&after=${encodeURIComponent(
          first.body.page_info.end_cursor,
        )}`,
      )
      .expect(200)

    expect(second.body.community_agent_prompts.map((prompt: { id: string }) => prompt.id)).toEqual([
      older.id,
    ])
    expect(second.body.page_info.has_next_page).toBe(false)
    expect(second.body.slot_info).toEqual(first.body.slot_info)
  })
})

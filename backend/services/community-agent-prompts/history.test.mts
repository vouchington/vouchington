import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'
import { recordCommunityAgentPromptChange } from '@services/community-agent-prompt-audit'
import { listCommunityAgentPromptHistory } from './history.mts'

describe('listCommunityAgentPromptHistory', () => {
  let user: PrivateUser
  let community: Community

  beforeAll(async () => {
    user = await createTestUser()
    community = await insertTestCommunity({ createdById: user.id })
  })

  it('returns history entries for a community', async () => {
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: user.id,
      prompt: 'history test prompt',
    })

    await recordCommunityAgentPromptChange(
      user.id,
      community.id,
      prompt.id,
      'created',
      {},
      {
        prompt: 'history test prompt',
        slot_allocated: false,
      },
    )

    const result = await listCommunityAgentPromptHistory(community.id, { promptId: prompt.id })

    expect(result.entries.length).toBeGreaterThanOrEqual(1)
    const entry = result.entries[0]!
    expect(entry.agent_prompt_id).toBe(prompt.id)
    expect(entry.community_id).toBe(community.id)
    expect(entry.action).toBe('created')
    expect(entry.changed_by).not.toBeNull()
    expect(entry.changed_by!.id).toBe(user.id)
    expect(entry.next_fields).toMatchObject({ prompt: 'history test prompt' })
    expect(entry.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('computes changed_fields correctly', async () => {
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: user.id,
    })

    await recordCommunityAgentPromptChange(
      user.id,
      community.id,
      prompt.id,
      'updated',
      { prompt: 'old text', slot_allocated: false },
      { prompt: 'new text', slot_allocated: false },
    )

    const result = await listCommunityAgentPromptHistory(community.id, { promptId: prompt.id })

    expect(result.entries.length).toBeGreaterThanOrEqual(1)
    const entry = result.entries[0]!
    expect(entry.changed_fields).toHaveProperty('prompt')
    expect(entry.changed_fields['prompt']).toEqual({ previous: 'old text', next: 'new text' })
    expect(entry.changed_fields).not.toHaveProperty('slot_allocated')
  })

  it('filters by promptId', async () => {
    const otherCommunity = await insertTestCommunity({ createdById: user.id })
    const promptA = await insertTestCommunityAgentPrompt({
      communityId: otherCommunity.id,
      createdById: user.id,
    })
    const promptB = await insertTestCommunityAgentPrompt({
      communityId: otherCommunity.id,
      createdById: user.id,
    })

    await recordCommunityAgentPromptChange(
      user.id,
      otherCommunity.id,
      promptA.id,
      'created',
      {},
      {
        prompt: 'a',
      },
    )
    await recordCommunityAgentPromptChange(
      user.id,
      otherCommunity.id,
      promptB.id,
      'created',
      {},
      {
        prompt: 'b',
      },
    )

    const result = await listCommunityAgentPromptHistory(otherCommunity.id, {
      promptId: promptA.id,
    })

    const ids = result.entries.map(e => e.agent_prompt_id)
    expect(ids).toContain(promptA.id)
    expect(ids).not.toContain(promptB.id)
  })

  it('paginates with before cursor', async () => {
    const pageCommunity = await insertTestCommunity({ createdById: user.id })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: pageCommunity.id,
      createdById: user.id,
    })

    for (let i = 0; i < 3; i++) {
      await recordCommunityAgentPromptChange(
        user.id,
        pageCommunity.id,
        prompt.id,
        'updated',
        { prompt: `v${i}` },
        { prompt: `v${i + 1}` },
      )
    }

    const page1 = await listCommunityAgentPromptHistory(pageCommunity.id, { limit: 2 })
    expect(page1.entries).toHaveLength(2)
    expect(page1.next_cursor).not.toBeNull()

    const page2 = await listCommunityAgentPromptHistory(pageCommunity.id, {
      limit: 2,
      before: page1.next_cursor!,
    })
    expect(page2.entries.length).toBeGreaterThanOrEqual(1)
    const page1Ids = page1.entries.map(e => e.id)
    const page2Ids = page2.entries.map(e => e.id)
    for (const id of page2Ids) {
      expect(page1Ids).not.toContain(id)
    }
  })

  it('returns null next_cursor when no more entries', async () => {
    const smallCommunity = await insertTestCommunity({ createdById: user.id })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: smallCommunity.id,
      createdById: user.id,
    })

    await recordCommunityAgentPromptChange(
      user.id,
      smallCommunity.id,
      prompt.id,
      'created',
      {},
      { prompt: 'once' },
    )

    const result = await listCommunityAgentPromptHistory(smallCommunity.id, { limit: 50 })
    expect(result.next_cursor).toBeNull()
  })
})

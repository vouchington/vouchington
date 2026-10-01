import { describe, expect, it } from 'vitest'
import {
  createTestMembership,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
} from '@voucha/test-helpers'
import { setTestCommunityAutomodAction } from '@voucha/test-helpers/data-stores/psql/classifier-runs/community-moderation-fixture'
import {
  MAX_COMMUNITY_MODERATION_QUESTIONS,
  MAX_COMMUNITY_MODERATION_RULE_CHARACTERS,
  resolveCommunityModerationRunConfiguration,
  selectCommunityModerationPrompts,
} from './moderation-run-configuration.mts'

const promptWith = (index: number, characters = 10) => ({
  id: `prompt-${String(index).padStart(3, '0')}`,
  text: 'r'.repeat(characters),
})

describe('selectCommunityModerationPrompts', () => {
  it('keeps every prompt under the caps', () => {
    const prompts = Array.from({ length: 10 }, (_, index) => promptWith(index))

    expect(selectCommunityModerationPrompts(prompts)).toEqual(prompts)
  })

  it('caps one call at thirty questions and drops the ones past the cap', () => {
    const prompts = Array.from({ length: MAX_COMMUNITY_MODERATION_QUESTIONS + 5 }, (_, index) =>
      promptWith(index),
    )

    const selected = selectCommunityModerationPrompts(prompts)

    expect(selected).toHaveLength(30)
    expect(selected.map(prompt => prompt.id)).toEqual(prompts.slice(0, 30).map(prompt => prompt.id))
  })

  it('caps the rule characters of one call, keeping the prefix that fits', () => {
    const prompts = Array.from({ length: 6 }, (_, index) => promptWith(index, 10_000))

    expect(selectCommunityModerationPrompts(prompts).map(prompt => prompt.id)).toEqual(
      prompts.slice(0, 4).map(prompt => prompt.id),
    )
  })

  it('accepts a call that is exactly at the character cap', () => {
    const half = MAX_COMMUNITY_MODERATION_RULE_CHARACTERS / 2
    const prompts = [promptWith(0, half), promptWith(1, half)]

    expect(selectCommunityModerationPrompts(prompts)).toHaveLength(2)
    expect(selectCommunityModerationPrompts([...prompts, promptWith(2, 1)])).toHaveLength(2)
  })

  it('stops at the first prompt that does not fit rather than skipping to a shorter later one', () => {
    const prompts = [promptWith(0, 30_000), promptWith(1, 20_000), promptWith(2, 5)]

    expect(selectCommunityModerationPrompts(prompts).map(prompt => prompt.id)).toEqual([
      'prompt-000',
    ])
  })

  it('returns the kept prompts sorted by id so the configuration is deterministic', () => {
    const prompts = [promptWith(3), promptWith(1), promptWith(2)]

    expect(selectCommunityModerationPrompts(prompts).map(prompt => prompt.id)).toEqual([
      'prompt-001',
      'prompt-002',
      'prompt-003',
    ])
    expect(prompts.map(prompt => prompt.id)).toEqual(['prompt-003', 'prompt-001', 'prompt-002'])
  })

  it('selects nothing from no prompts', () => {
    expect(selectCommunityModerationPrompts([])).toEqual([])
  })
})

describe('resolveCommunityModerationRunConfiguration', () => {
  async function communityWithPrompt(prompt = 'No spam') {
    const owner = await createTestUser()
    await createTestMembership({ user_id: owner.id, plan: 'pro' })
    const community = await insertTestCommunity({ createdById: owner.id })
    const rule = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
      prompt,
      slotAllocated: true,
    })
    return { owner, community, rule }
  }

  it('resolves nothing for a community with no active prompt, which is a deliberate no-work', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })

    await expect(resolveCommunityModerationRunConfiguration(community.id)).resolves.toBeNull()
  })

  it('pins exactly the prompts the provider call asks', async () => {
    const { community, rule } = await communityWithPrompt('Be kind')

    const resolved = await resolveCommunityModerationRunConfiguration(community.id)

    expect(resolved?.configuration.prompts).toEqual([{ id: rule.id, text: 'Be kind' }])
    expect(resolved?.remote).toMatchObject({
      candidateKind: 'community_prompt',
      promptIds: [rule.id],
      scope: { scopeCategory: 'community_ai', scopeCommunityId: community.id },
    })
  })

  it('does not include the community action, so changing it never re-keys the run', async () => {
    const { community } = await communityWithPrompt()
    const before = await resolveCommunityModerationRunConfiguration(community.id)

    await setTestCommunityAutomodAction(community.id, 'unpublish')
    const after = await resolveCommunityModerationRunConfiguration(community.id)

    expect(JSON.stringify(before?.configuration)).not.toContain('automod')
    expect(after?.configurationSha256.equals(before!.configurationSha256)).toBe(true)
  })

  it('is stable across resolutions of an unchanged community', async () => {
    const { community } = await communityWithPrompt()

    const [first, second] = await Promise.all([
      resolveCommunityModerationRunConfiguration(community.id),
      resolveCommunityModerationRunConfiguration(community.id),
    ])

    expect(first?.configurationSha256.equals(second!.configurationSha256)).toBe(true)
  })
})

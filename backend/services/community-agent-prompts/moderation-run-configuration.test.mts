import { describe, expect, it } from 'vitest'
import {
  createTestMembership,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
} from '@voucha/test-helpers'
import {
  editTestCommunityRule,
  setTestCommunityAutomodAction,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/community-moderation-fixture'
import { setTestCommunityModerationPromptActivatedAt } from '@voucha/test-helpers/community-moderation-prompt-activation'
import { getActiveCommunityAgentPrompts } from './get-active-prompts.mts'
import { resolveCommunityModerationRunConfiguration } from './moderation-run-configuration.mts'

describe('community moderation prompt selection', () => {
  async function communityWithPrompts(count: number, characters: number) {
    const owner = await createTestUser()
    await createTestMembership({ user_id: owner.id, plan: 'pro' })
    const community = await insertTestCommunity({ createdById: owner.id })
    const creators = [owner]
    while (creators.length * 10 < count) {
      const creator = await createTestUser()
      await createTestMembership({ user_id: creator.id, plan: 'pro' })
      creators.push(creator)
    }
    for (let index = 0; index < count; index++) {
      await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: creators[Math.floor(index / 10)]!.id,
        prompt: 'r'.repeat(characters),
        slotAllocated: true,
      })
    }
    const active = await getActiveCommunityAgentPrompts(community.id)
    expect(active).toHaveLength(count)
    return { community, active }
  }

  it('keeps every active prompt under the caps and sorts the pinned configuration', async () => {
    const { community, active } = await communityWithPrompts(10, 10)
    const resolved = await resolveCommunityModerationRunConfiguration(community.id)
    const expected = active
      .map(row => ({ id: row.id, text: row.prompt }))
      .toSorted((a, b) => a.id.localeCompare(b.id))

    expect(resolved?.configuration.prompts).toEqual(expected)
    expect(resolved?.remote).toMatchObject({ promptIds: expected.map(prompt => prompt.id) })
  })

  it('caps one provider call at thirty questions and keeps the source prefix', async () => {
    const { community, active } = await communityWithPrompts(31, 10)
    const resolved = await resolveCommunityModerationRunConfiguration(community.id)

    expect(resolved?.configuration.prompts).toHaveLength(30)
    expect(resolved?.configuration.prompts.map(prompt => prompt.id)).toEqual(
      active
        .slice(0, 30)
        .map(row => row.id)
        .toSorted(),
    )
    expect(resolved?.remote).toMatchObject({
      promptIds: resolved?.configuration.prompts.map(row => row.id),
    })
  })

  it('pins id-sorted prompts when activation order differs in both directions', async () => {
    const { community, active } = await communityWithPrompts(3, 10)
    const ids = active.map(row => row.id).toSorted()
    await setTestCommunityModerationPromptActivatedAt(ids[1]!, new Date('2026-01-01T00:00:00.000Z'))
    await setTestCommunityModerationPromptActivatedAt(ids[0]!, new Date('2026-01-02T00:00:00.000Z'))
    await setTestCommunityModerationPromptActivatedAt(ids[2]!, new Date('2026-01-03T00:00:00.000Z'))

    const source = await getActiveCommunityAgentPrompts(community.id)
    expect(source.map(row => row.id)).toEqual([ids[1], ids[0], ids[2]])
    const resolved = await resolveCommunityModerationRunConfiguration(community.id)
    expect(resolved?.configuration.prompts.map(row => row.id)).toEqual(ids)
    expect(resolved?.remote).toMatchObject({ promptIds: ids })
  })

  it('keeps exactly 40,000 rule characters and excludes the first overflow', async () => {
    const { community, active } = await communityWithPrompts(3, 1)
    await editTestCommunityRule(active[0]!.id, 'r'.repeat(20_000))
    await editTestCommunityRule(active[1]!.id, 'r'.repeat(20_000))
    const resolved = await resolveCommunityModerationRunConfiguration(community.id)

    expect(resolved?.configuration.prompts).toHaveLength(2)
    expect(resolved?.configuration.prompts.map(row => row.text.length)).toEqual([20_000, 20_000])
    expect(resolved?.configuration.prompts.map(row => row.id)).toEqual(
      active
        .slice(0, 2)
        .map(row => row.id)
        .toSorted(),
    )
  })

  it('stops at the first rule that does not fit, even when a later one is short', async () => {
    const { community, active } = await communityWithPrompts(3, 1)
    await editTestCommunityRule(active[0]!.id, 'r'.repeat(20_000))
    await editTestCommunityRule(active[1]!.id, 'r'.repeat(20_001))
    await editTestCommunityRule(active[2]!.id, 'r'.repeat(5))

    const resolved = await resolveCommunityModerationRunConfiguration(community.id)
    expect(resolved?.configuration.prompts.map(row => row.id)).toEqual([active[0]!.id])
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
